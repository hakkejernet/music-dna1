import { describe, expect, it } from 'vitest';
import { CandidateAggregator } from '../../candidateProviders';
import type { Candidate, CandidateProvider, CandidateRequest } from '../../candidateProviders';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure } from '../../domainErrors';
import { explicitMetadataEnricher, EnrichmentPipeline, tagBasedEnricher, trackSimilarityEnricher } from '../../enrichment';
import type { RecommendationMemoryRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
import type { RecommendationMemoryEntry } from '../../recommendationMemory';
import { RuleBasedRankingEngine } from '../../rankingEngine';
import { failure, success, type Result } from '../../result';
import type { TrackDNA } from '../../trackDna';
import { validateSignalVector } from '../../trackDna';
import type { LibrarySnapshot, UserDNA } from '../../userDna';
import { BuildDiscoveryQueue } from './buildDiscoveryQueue';

const NOW = new Date('2026-01-01T00:00:00.000Z');

const EMPTY_SNAPSHOT: LibrarySnapshot = { topArtists: null, savedTracks: null };

class FakeUserDnaRepository implements UserDnaRepository {
  public saveCalls: UserDNA[] = [];
  private fixed: UserDNA | null;
  private readonly failNextGetById: RepositoryFailure | null;

  constructor(fixed: UserDNA | null = null, options: { failNextGetById?: RepositoryFailure } = {}) {
    this.fixed = fixed;
    this.failNextGetById = options.failNextGetById ?? null;
  }

  async save(item: UserDNA): Promise<Result<void, RepositoryFailure>> {
    this.saveCalls.push(item);
    this.fixed = item;
    return success(undefined);
  }

  async getById(): Promise<Result<UserDNA | null, RepositoryFailure>> {
    if (this.failNextGetById) return failure(this.failNextGetById);
    return success(this.fixed);
  }

  async getAll(): Promise<Result<UserDNA[], RepositoryFailure>> {
    return success(this.fixed ? [this.fixed] : []);
  }
}

class FakeTrackDnaRepository implements TrackDnaRepository {
  public saveCalls: TrackDNA[] = [];

  async save(item: TrackDNA): Promise<Result<void, RepositoryFailure>> {
    this.saveCalls.push(item);
    return success(undefined);
  }

  async getById(id: string): Promise<Result<TrackDNA | null, RepositoryFailure>> {
    return success(this.saveCalls.find((item) => item.trackId === id) ?? null);
  }

  async getAll(): Promise<Result<TrackDNA[], RepositoryFailure>> {
    return success(this.saveCalls);
  }
}

/** M29: a Map-backed fake mirroring InMemoryRecommendationMemoryRepository's own get/put contract — seedable with pre-existing entries so tests can assert on suppression behavior without touching real persistence. */
class FakeRecommendationMemoryRepository implements RecommendationMemoryRepository {
  private readonly entries: Map<string, RecommendationMemoryEntry>;
  private readonly failNextGet: RepositoryFailure | null;

  constructor(initial: RecommendationMemoryEntry[] = [], options: { failNextGet?: RepositoryFailure } = {}) {
    this.entries = new Map(initial.map((entry) => [entry.candidateId, entry]));
    this.failNextGet = options.failNextGet ?? null;
  }

  async get(candidateId: string): Promise<Result<RecommendationMemoryEntry | null, RepositoryFailure>> {
    if (this.failNextGet && candidateId === 'c-fails') return failure(this.failNextGet);
    return success(this.entries.get(candidateId) ?? null);
  }

  async put(entry: RecommendationMemoryEntry): Promise<Result<void, RepositoryFailure>> {
    this.entries.set(entry.candidateId, entry);
    return success(undefined);
  }
}

/** A CandidateProvider test double — the only fake in this suite; CandidateAggregator, EnrichmentPipeline, and RuleBasedRankingEngine below are all the real, unmodified implementations. */
class FakeCandidateProvider implements CandidateProvider {
  readonly providerName = 'fake';
  public receivedLimits: number[] = [];
  private readonly candidates: Candidate[];

  constructor(candidates: Candidate[]) {
    this.candidates = candidates;
  }

  async fetchCandidates(request: CandidateRequest): Promise<Candidate[]> {
    this.receivedLimits.push(request.limit);
    return this.candidates.slice(0, request.limit);
  }
}

const candidate = (id: string, title: string, artist: string, tags: string[]): Candidate => ({
  candidateId: id,
  title,
  artists: [artist],
  contributions: [{ providerName: 'fake', externalIds: {}, rawMetadata: { tags, explicit: false } }],
});

const buildPipeline = () => new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher, trackSimilarityEnricher]);

const expectSuccess = <T>(result: Result<T, unknown>): T => {
  if (!result.success) throw new Error(`expected Success, got Failure: ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('BuildDiscoveryQueue — the full Spotify Library → Candidate Provider → Ranking → Queue chain (Sprint 1 Rule 1)', () => {
  it('bootstraps a cold-start UserDNA on first use, then builds a ranked queue from real candidates', async () => {
    const userDnaRepository = new FakeUserDnaRepository(null);
    const trackDnaRepository = new FakeTrackDnaRepository();
    const provider = new FakeCandidateProvider([candidate('c1', 'Paper Skies', 'Coastal Static', ['dream pop'])]);
    const useCase = new BuildDiscoveryQueue(
      userDnaRepository,
      trackDnaRepository,
      new CandidateAggregator([provider]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const snapshot: LibrarySnapshot = { topArtists: [{ genres: ['dream pop'], popularity: 40 }], savedTracks: null };
    const result = expectSuccess(await useCase.execute('user-1', snapshot, 10, NOW));

    // Cold-start UserDNA was built and persisted — not left unresolved.
    expect(userDnaRepository.saveCalls).toHaveLength(1);
    expect(userDnaRepository.saveCalls[0].coldStart).toBe(true);

    // The TrackDNA for the one real candidate was persisted, so a later
    // reaction to it can actually be learned from (Sprint 1 Rule 6).
    expect(trackDnaRepository.saveCalls).toHaveLength(1);
    expect(trackDnaRepository.saveCalls[0].trackId).toBe('c1');

    // The queue holds the real, ranked candidate — genre-matched against
    // the cold-start UserDNA's own dream-pop signal, produced entirely by
    // the real, unmodified EnrichmentPipeline + RuleBasedRankingEngine.
    expect(result.queue.remaining()).toBe(1);
    expect(result.queue.current()?.candidateRef).toBe('c1');
    expect(result.queue.current()?.explanations.length).toBeGreaterThan(0);
    expect(result.enrichedCandidates).toHaveLength(1);
    expect(result.enrichedCandidates[0].candidate.title).toBe('Paper Skies');
  });

  it('reuses an already-persisted UserDNA instead of overwriting it with a new cold start', async () => {
    const existingUserDna: UserDNA = {
      userId: 'user-1',
      signals: {},
      coldStart: false,
      sourceLibrarySnapshotRef: null,
      version: 3,
      updatedAt: '2025-06-01T00:00:00.000Z',
    };
    const userDnaRepository = new FakeUserDnaRepository(existingUserDna);
    const useCase = new BuildDiscoveryQueue(
      userDnaRepository,
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW);

    expect(userDnaRepository.saveCalls).toHaveLength(0);
  });

  it('returns an empty queue — never a fabricated recommendation — when the provider yields nothing (Sprint 1 Rule 7)', async () => {
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW));

    expect(result.queue.current()).toBeNull();
    expect(result.queue.remaining()).toBe(0);
    expect(result.enrichedCandidates).toEqual([]);
  });

  it('propagates a UserDnaRepository failure unchanged, without touching candidates at all', async () => {
    const theFailure = repositoryFailure('UserDnaRepository.getById', 'simulated outage');
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null, { failNextGetById: theFailure }),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', [])])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW);

    expect(result).toEqual(failure(theFailure));
  });
});

describe('BuildDiscoveryQueue — excludeCandidateIds prevents repeat batches from showing the same songs (M19)', () => {
  // M27: distinct artist per candidate — these tests exercise exclusion
  // logic, not the per-artist diversity cap. A shared 'Artist' literal
  // here would trip M27's cap and truncate these batches for a reason
  // unrelated to what each test actually verifies.
  const manyCandidates = Array.from({ length: 20 }, (_, index) => candidate(`c${index}`, `Track ${index}`, `Artist${index}`, []));

  it('omits every excluded candidate from the returned batch', async () => {
    const alreadyShown = new Set(manyCandidates.slice(0, 15).map((c) => c.candidateId));
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider(manyCandidates)]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 15, NOW, alreadyShown));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds.some((id) => alreadyShown.has(id))).toBe(false);
    // Only 5 of the 20 fixture candidates were never shown — that's all that's left to return.
    expect(returnedIds).toHaveLength(5);
  });

  it('a second batch excluding the first batch\'s ids never reproduces a candidate the first batch already returned', async () => {
    const provider = new FakeCandidateProvider(manyCandidates);
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([provider]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const firstBatch = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 15, NOW));
    const shown = new Set(firstBatch.enrichedCandidates.map((enriched) => enriched.candidate.candidateId));

    const secondBatch = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 15, NOW, shown));
    const secondIds = secondBatch.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);

    expect(secondIds.some((id) => shown.has(id))).toBe(false);
    expect(secondIds).toHaveLength(5);
  });

  it('returns a genuinely empty batch — not a crash — once every available candidate has already been shown', async () => {
    const allShown = new Set(manyCandidates.map((c) => c.candidateId));
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider(manyCandidates)]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 15, NOW, allShown));

    expect(result.queue.current()).toBeNull();
    expect(result.enrichedCandidates).toEqual([]);
  });
});

describe('BuildDiscoveryQueue — requests a much larger pool from the provider than the caller\'s batch size (M21)', () => {
  it('asks the aggregator/provider for far more than the requested batch limit, regardless of caller-supplied limit', async () => {
    const provider = new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', [])]);
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([provider]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    await useCase.execute('user-1', EMPTY_SNAPSHOT, 15, NOW);

    expect(provider.receivedLimits).toHaveLength(1);
    expect(provider.receivedLimits[0]).toBeGreaterThan(15);
    expect(provider.receivedLimits[0]).toBeGreaterThanOrEqual(100);
  });
});

describe('BuildDiscoveryQueue — ranks the entire filtered pool before selecting the top `limit` (M23)', () => {
  it('selects the best-matching candidates regardless of where they landed in the raw fetch order', async () => {
    const existingUserDna: UserDNA = {
      userId: 'user-1',
      signals: validateSignalVector({ rock: { value: 1, confidence: 1 } }),
      coldStart: false,
      sourceLibrarySnapshotRef: null,
      version: 1,
      updatedAt: '2025-06-01T00:00:00.000Z',
    };

    // The 5 rock-tagged candidates that should score highest are placed
    // LAST in the raw provider order, after 15 untagged filler candidates.
    // Under the old slice-before-rank logic, a batch limit of 5 would have
    // taken only the first 5 fillers and never reached ranking at all —
    // this proves ranking now sees (and correctly prefers) the whole pool.
    // M27: distinct artist per candidate — a shared 'Artist' literal
    // across all 20 would trip the per-artist diversity cap and truncate
    // the result for a reason unrelated to what this test verifies
    // (that ranking, not raw fetch order, decides which candidates win).
    const fillers = Array.from({ length: 15 }, (_, i) => candidate(`filler${i}`, `Filler ${i}`, `FillerArtist${i}`, []));
    const rockMatches = Array.from({ length: 5 }, (_, i) => candidate(`rock${i}`, `Rock Track ${i}`, `RockArtist${i}`, ['rock']));
    const provider = new FakeCandidateProvider([...fillers, ...rockMatches]);

    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(existingUserDna),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([provider]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 5, NOW));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds).toHaveLength(5);
    expect(returnedIds.every((id) => id.startsWith('rock'))).toBe(true);
  });

  it('still requests the full CANDIDATE_POOL_SIZE from the aggregator, not just `limit`, before ranking', async () => {
    const provider = new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', [])]);
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([provider]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 5, NOW));

    expect(provider.receivedLimits[0]).toBeGreaterThanOrEqual(100);
    expect(result.enrichedCandidates).toHaveLength(1);
  });
});

describe('BuildDiscoveryQueue — caps candidates per primary artist without re-ranking (M27)', () => {
  it('caps a dominant artist, preserves ranking order among survivors, and introduces no candidate that was not already present', async () => {
    const dominant = ['a1', 'a2', 'a3', 'a4'].map((id) => candidate(id, `Track ${id}`, 'Dominant', []));
    const other = ['b1', 'b2'].map((id) => candidate(id, `Track ${id}`, 'Other', []));
    const allCandidates = [...dominant, ...other];

    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider(allCandidates)]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 3, NOW));
    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);

    // Every candidate here scores 0 (no tags, no UserDNA signal overlap),
    // so RuleBasedRankingEngine's own deterministic candidateRef
    // tie-break fully determines rank order: a1 < a2 < a3 < a4 < b1 < b2.
    // With BuildDiscoveryQueue's own maxPerArtist = 2, a3/a4 must be
    // skipped in favor of b1 — verified precisely, not just by length.
    expect(returnedIds).toEqual(['a1', 'a2', 'b1']);

    // At most 2 of the 3 returned candidates are by the dominant artist.
    const dominantIds = new Set(dominant.map((c) => c.candidateId));
    expect(returnedIds.filter((id) => dominantIds.has(id))).toHaveLength(2);

    // No candidate appears in the result that wasn't in the original pool.
    const allIds = new Set(allCandidates.map((c) => c.candidateId));
    expect(returnedIds.every((id) => allIds.has(id))).toBe(true);

    // The result is a subsequence of the full rank order — never
    // reordered, only filtered.
    const fullRankOrder = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'];
    const positionsInRankOrder = returnedIds.map((id) => fullRankOrder.indexOf(id));
    expect(positionsInRankOrder).toEqual([...positionsInRankOrder].sort((a, z) => a - z));
  });
});

describe('BuildDiscoveryQueue — filters out currently-suppressed candidates via Recommendation Memory (M29)', () => {
  it('excludes a candidate with an active (non-expired) reject suppression', async () => {
    const rejectedRecently: RecommendationMemoryEntry = {
      candidateId: 'c1',
      lastOutcome: 'reject',
      lastOutcomeAt: NOW.toISOString(),
      suppressedUntil: new Date(NOW.getTime() + 1000 * 60 * 60 * 24 * 60).toISOString(), // +60d, still in the future relative to NOW
    };
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', []), candidate('c2', 'Track 2', 'Other', [])])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository([rejectedRecently]),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds).not.toContain('c1');
    expect(returnedIds).toContain('c2');
  });

  it('includes a candidate whose reject suppression has already expired', async () => {
    const rejectedLongAgo: RecommendationMemoryEntry = {
      candidateId: 'c1',
      lastOutcome: 'reject',
      lastOutcomeAt: '2025-01-01T00:00:00.000Z',
      suppressedUntil: '2025-03-02T00:00:00.000Z', // 60 days after lastOutcomeAt — well before NOW (2026-01-01)
    };
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', [])])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository([rejectedLongAgo]),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds).toContain('c1');
  });

  it('permanently excludes a saved candidate, even far into the future', async () => {
    const saved: RecommendationMemoryEntry = {
      candidateId: 'c1',
      lastOutcome: 'save',
      lastOutcomeAt: '2020-01-01T00:00:00.000Z',
      suppressedUntil: null,
    };
    const farFuture = new Date('2099-01-01T00:00:00.000Z');
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', []), candidate('c2', 'Track 2', 'Other', [])])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository([saved]),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, farFuture));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds).not.toContain('c1');
    expect(returnedIds).toContain('c2');
  });

  it('degrades a single failing memory lookup to "not suppressed" for that candidate alone, without aborting the batch', async () => {
    const theFailure = repositoryFailure('RecommendationMemoryRepository.get', 'simulated outage');
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([candidate('c-fails', 'Track', 'Artist', []), candidate('c2', 'Track 2', 'Other', [])])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository([], { failNextGet: theFailure }),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds).toContain('c-fails');
    expect(returnedIds).toContain('c2');
  });

  it('is a no-regression no-op when Recommendation Memory is empty', async () => {
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([candidate('c1', 'Track', 'Artist', [])])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW));

    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);
    expect(returnedIds).toContain('c1');
  });
});

describe('BuildDiscoveryQueue — track-level similarity data moves rank order end-to-end (M30)', () => {
  it('ranks a candidate carrying a trackSimilarityMatch strictly above an otherwise-identical candidate without one', async () => {
    const withMatch: Candidate = {
      candidateId: 'similar',
      title: 'Similar Track',
      artists: ['ArtistA'],
      contributions: [{ providerName: 'fake', externalIds: {}, rawMetadata: { tags: [], explicit: false, trackSimilarityMatch: 0.9 } }],
    };
    const withoutMatch: Candidate = {
      candidateId: 'plain',
      title: 'Plain Track',
      artists: ['ArtistB'],
      contributions: [{ providerName: 'fake', externalIds: {}, rawMetadata: { tags: [], explicit: false } }],
    };

    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([withMatch, withoutMatch])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 2, NOW));
    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);

    expect(returnedIds).toEqual(['similar', 'plain']);
  });

  it('stays fully inert — a plain candidateRef tie-break, same as before M30 — when no candidate carries trackSimilarityMatch', async () => {
    const a = candidate('a', 'Track A', 'ArtistA', []);
    const b = candidate('b', 'Track B', 'ArtistB', []);
    const useCase = new BuildDiscoveryQueue(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(),
      new CandidateAggregator([new FakeCandidateProvider([b, a])]),
      buildPipeline(),
      new RuleBasedRankingEngine(),
      new FakeRecommendationMemoryRepository(),
    );

    const result = expectSuccess(await useCase.execute('user-1', EMPTY_SNAPSHOT, 2, NOW));
    const returnedIds = result.enrichedCandidates.map((enriched) => enriched.candidate.candidateId);

    expect(returnedIds).toEqual(['a', 'b']);
  });
});
