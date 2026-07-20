import { describe, expect, it } from 'vitest';
import { CandidateAggregator } from '../../candidateProviders';
import type { Candidate, CandidateProvider, CandidateRequest } from '../../candidateProviders';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure } from '../../domainErrors';
import { explicitMetadataEnricher, EnrichmentPipeline, tagBasedEnricher } from '../../enrichment';
import type { TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { RuleBasedRankingEngine } from '../../rankingEngine';
import { failure, success, type Result } from '../../result';
import type { TrackDNA } from '../../trackDna';
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

/** A CandidateProvider test double — the only fake in this suite; CandidateAggregator, EnrichmentPipeline, and RuleBasedRankingEngine below are all the real, unmodified implementations. */
class FakeCandidateProvider implements CandidateProvider {
  readonly providerName = 'fake';
  private readonly candidates: Candidate[];

  constructor(candidates: Candidate[]) {
    this.candidates = candidates;
  }

  async fetchCandidates(request: CandidateRequest): Promise<Candidate[]> {
    return this.candidates.slice(0, request.limit);
  }
}

const candidate = (id: string, title: string, artist: string, tags: string[]): Candidate => ({
  candidateId: id,
  title,
  artists: [artist],
  contributions: [{ providerName: 'fake', externalIds: {}, rawMetadata: { tags, explicit: false } }],
});

const buildPipeline = () => new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);

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
    );

    const result = await useCase.execute('user-1', EMPTY_SNAPSHOT, 10, NOW);

    expect(result).toEqual(failure(theFailure));
  });
});
