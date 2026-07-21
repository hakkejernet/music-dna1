import { CandidateAggregator } from '../../candidateProviders';
import type { RepositoryFailure } from '../../domainErrors';
import type { EnrichedCandidate } from '../../enrichment';
import { EnrichmentPipeline } from '../../enrichment';
import type { TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { RecommendationQueue } from '../../queue';
import type { RankingEngine } from '../../rankingEngine';
import { success, type Result } from '../../result';
import { buildColdStartUserDna, type LibrarySnapshot, type UserDNA } from '../../userDna';

export interface DiscoveryQueueResult {
  queue: RecommendationQueue;
  enrichedCandidates: readonly EnrichedCandidate[];
}

/**
 * M19: requested from the aggregator regardless of the caller's batch
 * size. LastFmCandidateProvider already computes its full candidate
 * pool (similar artists × their top tracks) internally before
 * truncating to whatever limit it's given — asking for more here costs
 * no extra network calls, it just lets more of that already-computed
 * pool through the provider's own final slice, which is what makes a
 * second, non-repeating batch possible from the same seed artists.
 *
 * M21: raised from 100 to 500 to match LastFmCandidateProvider's own
 * expanded internal ceiling (up to 640 raw candidates before dedup,
 * up from 75) — this constant was already the second half of the same
 * bottleneck M19 partially addressed: even a provider computing
 * hundreds of candidates would still only ever return the first 100 of
 * them, because that's all this use case asked for.
 */
const CANDIDATE_POOL_SIZE = 500;

/**
 * Product Sprint 1's one new workflow: "Spotify Library → Candidate
 * Provider → Ranking → Queue" (Rule 1), coordinated the same way every
 * other Application Service already does (M10 Rule 1/2) — this class
 * contains no domain logic of its own, only the sequence in which the
 * already-built domain pieces are called. `candidateAggregator`,
 * `enrichmentPipeline`, and `rankingEngine` are all injected (M10
 * Rule 4/6/8, mirroring how repositories are injected); this class never
 * constructs a concrete provider, enricher, or ranking implementation.
 *
 * Bootstraps `UserDNA` on first use (M2's `buildColdStartUserDna`, still
 * completely unmodified) rather than failing when none exists yet — a
 * fresh user with no persisted UserDNA is the normal first-run case for
 * this sprint's in-memory-only repositories, not an error condition.
 *
 * Persists every freshly-enriched `TrackDNA` (via `trackDnaRepository`)
 * before ranking — without this, a later reaction to one of these
 * candidates would find no `TrackDNA` for `LearnFromReaction` to learn
 * from (Sprint 1 Rule 6 depends on this). A `TrackDNA` save failing is
 * treated as best-effort here (that one candidate is simply excluded
 * from ranking, the rest of the batch proceeds) — `learn()` already
 * treats a missing `TrackDNA` as a normal case (M8 Rule 7), so this
 * mirrors that same degrade-gracefully posture rather than aborting the
 * whole page over one technical save failure.
 */
export class BuildDiscoveryQueue {
  private readonly userDnaRepository: UserDnaRepository;
  private readonly trackDnaRepository: TrackDnaRepository;
  private readonly candidateAggregator: CandidateAggregator;
  private readonly enrichmentPipeline: EnrichmentPipeline;
  private readonly rankingEngine: RankingEngine;

  constructor(
    userDnaRepository: UserDnaRepository,
    trackDnaRepository: TrackDnaRepository,
    candidateAggregator: CandidateAggregator,
    enrichmentPipeline: EnrichmentPipeline,
    rankingEngine: RankingEngine,
  ) {
    this.userDnaRepository = userDnaRepository;
    this.trackDnaRepository = trackDnaRepository;
    this.candidateAggregator = candidateAggregator;
    this.enrichmentPipeline = enrichmentPipeline;
    this.rankingEngine = rankingEngine;
  }

  /**
   * `excludeCandidateIds` (M19) is every candidate already shown to this
   * user this session — including ones they saved or rejected, since
   * both are reactions to a candidate that was necessarily shown first.
   * Filtered out before enrichment, so a repeat call (e.g. once the
   * previous batch is exhausted) draws only fresh candidates from the
   * same underlying pool instead of reproducing the same songs.
   */
  async execute(
    userId: string,
    snapshot: LibrarySnapshot,
    limit: number,
    now: Date,
    excludeCandidateIds: ReadonlySet<string> = new Set(),
  ): Promise<Result<DiscoveryQueueResult, RepositoryFailure>> {
    const userDnaResult = await this.ensureUserDna(userId, snapshot, now);
    if (!userDnaResult.success) return userDnaResult;

    const { candidates } = await this.candidateAggregator.fetchAll({ limit: CANDIDATE_POOL_SIZE }, now);
    const freshCandidates = candidates.filter((candidate) => !excludeCandidateIds.has(candidate.candidateId)).slice(0, limit);
    const enrichedCandidates = await Promise.all(freshCandidates.map((candidate) => this.enrichmentPipeline.enrich(candidate, now)));

    const persisted: EnrichedCandidate[] = [];
    for (const enriched of enrichedCandidates) {
      const saveResult = await this.trackDnaRepository.save(enriched.trackDna);
      if (saveResult.success) persisted.push(enriched);
    }

    const rankedCandidates = this.rankingEngine.rank(userDnaResult.value, persisted, now);
    const queue = RecommendationQueue.create(rankedCandidates);

    return success({ queue, enrichedCandidates: persisted });
  }

  /** Never fails on "no UserDNA yet" — that's the expected first-run state, resolved by building and saving a cold-start one instead of returning UserDnaNotFound. */
  private async ensureUserDna(userId: string, snapshot: LibrarySnapshot, now: Date): Promise<Result<UserDNA, RepositoryFailure>> {
    const existing = await this.userDnaRepository.getById(userId);
    if (!existing.success) return existing;
    if (existing.value !== null) return success(existing.value);

    const coldStart = buildColdStartUserDna(userId, snapshot, now);
    const saveResult = await this.userDnaRepository.save(coldStart);
    if (!saveResult.success) return saveResult;
    return success(coldStart);
  }
}
