import { CandidateAggregator } from '../../candidateProviders';
import type { RepositoryFailure } from '../../domainErrors';
import type { EnrichedCandidate } from '../../enrichment';
import { EnrichmentPipeline } from '../../enrichment';
import type { RecommendationMemoryRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { RecommendationQueue } from '../../queue';
import { SIGNAL_GROUPS } from '../../rankingEngine';
import type { RankedCandidate, RankingEngine } from '../../rankingEngine';
import { isSuppressed } from '../../recommendationMemory';
import { success, type Result } from '../../result';
import { buildColdStartUserDna, type LibrarySnapshot, type UserDNA } from '../../userDna';
import { diversifyRankedCandidates } from './diversifyRankedCandidates';

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
 * M27: the maximum number of candidates by the same primary artist
 * allowed in one queue. Owned here, not inside diversifyRankedCandidates
 * itself — that function takes maxPerArtist as a parameter precisely so
 * this value is a configuration choice this use case makes, not a
 * constant baked into the filtering logic (dependency injection of a
 * value, not a new architectural layer).
 */
const MAX_PER_ARTIST = 2;

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
  private readonly recommendationMemoryRepository: RecommendationMemoryRepository;

  constructor(
    userDnaRepository: UserDnaRepository,
    trackDnaRepository: TrackDnaRepository,
    candidateAggregator: CandidateAggregator,
    enrichmentPipeline: EnrichmentPipeline,
    rankingEngine: RankingEngine,
    recommendationMemoryRepository: RecommendationMemoryRepository,
  ) {
    this.userDnaRepository = userDnaRepository;
    this.trackDnaRepository = trackDnaRepository;
    this.candidateAggregator = candidateAggregator;
    this.enrichmentPipeline = enrichmentPipeline;
    this.rankingEngine = rankingEngine;
    this.recommendationMemoryRepository = recommendationMemoryRepository;
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
    const notExcluded = candidates.filter((candidate) => !excludeCandidateIds.has(candidate.candidateId));

    // M29: best-effort — a Recommendation Memory read failure for one
    // candidate degrades to "not suppressed" for that candidate alone;
    // it never aborts the batch, the same posture as every other
    // best-effort degrade already in this method.
    const memoryResults = await Promise.all(notExcluded.map((candidate) => this.recommendationMemoryRepository.get(candidate.candidateId)));
    const freshCandidates = notExcluded.filter((_candidate, index) => {
      const result = memoryResults[index];
      return !isSuppressed(result.success ? result.value : null, now);
    });

    const enrichedCandidates = await Promise.all(freshCandidates.map((candidate) => this.enrichmentPipeline.enrich(candidate, now)));

    const persisted: EnrichedCandidate[] = [];
    for (const enriched of enrichedCandidates) {
      const saveResult = await this.trackDnaRepository.save(enriched.trackDna);
      if (saveResult.success) persisted.push(enriched);
    }

    // M23: rank the entire filtered/enriched pool first, and only take the
    // top `limit` afterwards. Previously the pool was truncated to `limit`
    // BEFORE ranking ever ran, so RankingEngine only ever reordered an
    // arbitrary early slice of the fetched pool instead of choosing the
    // best-matching candidates out of everything actually available.
    const rankedPool = this.rankingEngine.rank(userDnaResult.value, persisted, now);

    const persistedByCandidateId = new Map(persisted.map((enriched) => [enriched.candidate.candidateId, enriched]));

    // M27: filter (never re-rank) the ranked pool down to `limit`, capping
    // how many candidates by the same primary artist can appear together
    // — RankingEngine's own order is otherwise fully preserved.
    const topRanked = diversifyRankedCandidates(rankedPool, persistedByCandidateId, limit, MAX_PER_ARTIST);

    const topEnriched: EnrichedCandidate[] = [];
    for (const ranked of topRanked) {
      const enriched = persistedByCandidateId.get(ranked.candidateRef);
      if (enriched) topEnriched.push(enriched);
    }

    // M24 — TEMPORARY diagnostic trace (Recommendation Trace & Candidate
    // Audit). Read-only: touches no candidate selection, no ranking, no
    // persistence. Logs, per recommendation, exactly what the M24
    // investigation asked for — seed chain, raw-pool position, and the
    // 4 per-bucket scores — so it's possible to see WHY a given track
    // survived the pipeline. Meant to be removed again once the audit
    // this milestone requested is done.
    this.logRecommendationTrace(candidates, persistedByCandidateId, rankedPool, topRanked);

    const queue = RecommendationQueue.create(topRanked);

    return success({ queue, enrichedCandidates: topEnriched });
  }

  /** M24 diagnostic-only — see the block comment at its one call site. Never throws: a logging failure must never break Discovery. */
  private logRecommendationTrace(
    rawPool: readonly { candidateId: string }[],
    persistedByCandidateId: ReadonlyMap<string, EnrichedCandidate>,
    rankedPool: readonly RankedCandidate[],
    topRanked: readonly RankedCandidate[],
  ): void {
    try {
      const rawPoolPositionById = new Map(rawPool.map((candidate, index) => [candidate.candidateId, index]));

      const buildTraceEntry = (ranked: RankedCandidate) => {
        const enriched = persistedByCandidateId.get(ranked.candidateRef);
        if (!enriched) return null;

        const rawMetadata = enriched.candidate.contributions[0]?.rawMetadata;
        const provenance = typeof rawMetadata === 'object' && rawMetadata !== null ? (rawMetadata as Record<string, unknown>) : {};
        const tags = Array.isArray(provenance.tags) ? (provenance.tags as string[]) : [];
        // Which of the 6 genre keywords the tag-based enricher actually
        // matched (value === 1) for THIS track — as opposed to merely
        // having a (possibly all-zero) reading at all.
        const matchedGenreKeywords = SIGNAL_GROUPS.genreMatch.filter((key) => enriched.trackDna.signals[key].value === 1);

        return {
          title: enriched.candidate.title,
          artist: enriched.candidate.artists[0] ?? '(ukendt artist)',
          candidateId: ranked.candidateRef,
          seedArtist: typeof provenance.seedArtist === 'string' ? provenance.seedArtist : null,
          similarArtist: typeof provenance.similarArtist === 'string' ? provenance.similarArtist : null,
          rawPoolPosition: rawPoolPositionById.get(ranked.candidateRef) ?? null,
          score: ranked.score,
          genreScore: ranked.scoreBreakdown.genreMatch,
          mainstreamScore: ranked.scoreBreakdown.mainstreamMatch,
          explicitScore: ranked.scoreBreakdown.explicitMatch,
          durationScore: ranked.scoreBreakdown.durationMatch,
          tags,
          matchedGenreKeywords,
          // score === 0 means every bucket had zero combined confidence —
          // this candidate's position in the queue came entirely from
          // RuleBasedRankingEngine's candidateRef tie-break, not from any
          // taste signal. See M24 root-cause analysis.
          survivedByTieBreakOnly: ranked.score === 0,
        };
      };

      const top20Trace = rankedPool.slice(0, 20).map(buildTraceEntry).filter((entry) => entry !== null);
      console.debug('[M24 trace] Top 20 rangerede kandidater før RecommendationQueue bygges:', top20Trace);

      for (const ranked of topRanked) {
        const entry = buildTraceEntry(ranked);
        if (!entry) continue;
        console.debug(`[M24 trace] Anbefaling "${entry.title}" af ${entry.artist}${entry.survivedByTieBreakOnly ? ' — INGEN signal-overlap, valgt kun via tie-break' : ''}:`, entry);
      }
    } catch (error) {
      console.warn('[M24 trace] Diagnostisk logging fejlede (påvirker ikke Discovery):', error);
    }
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
