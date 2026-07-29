import { CandidateAggregator, type ProviderDiagnosticsEntry } from '../../candidateProviders';
import type { RepositoryFailure } from '../../domainErrors';
import type { EnrichedCandidate } from '../../enrichment';
import { EnrichmentPipeline } from '../../enrichment';
import type { CandidatePipelineMeasured, ObservationSink } from '../../observability';
import type { RecommendationMemoryRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { RecommendationQueue } from '../../queue';
import { computeSignalLevelDetail } from '../../rankingEngine';
import type { RankedCandidate, RankingEngine, ScoreBreakdown, SignalLevelDetail } from '../../rankingEngine';
import { isSuppressed } from '../../recommendationMemory';
import { success, type Result } from '../../result';
import { buildColdStartUserDna, type LibrarySnapshot, type UserDNA } from '../../userDna';
import { diversifyRankedCandidates } from './diversifyRankedCandidates';

export interface DiscoveryQueueResult {
  queue: RecommendationQueue;
  enrichedCandidates: readonly EnrichedCandidate[];
  /**
   * TEMPORARY — one-time candidate-quality audit only (see
   * `runCandidateQualityAudit`). `null` unless the audit ran (see that
   * method for when). Remove this field, its population, and every
   * consumer once the audit concludes.
   */
  candidateAuditEntries?: readonly CandidateAuditEntry[];
}

/**
 * TEMPORARY — one-time candidate-quality audit only. One entry per
 * candidate in the top `CANDIDATE_AUDIT_SIZE` of the fully ranked pool
 * (before per-artist diversification), capturing every fact requested
 * for the Danish-recommendation-dominance investigation. See
 * `runCandidateQualityAudit` for exactly how each field is derived.
 */
export interface CandidateAuditEntry {
  /** 1-based position in the fully ranked pool, before diversifyRankedCandidates() caps/reorders it down to the visible queue. */
  rankPosition: number;
  /** Whether this candidate actually survived diversifyRankedCandidates() into the visible queue — a candidate can rank highly and still be capped out by MAX_PER_ARTIST. */
  survivedToQueue: boolean;
  title: string;
  artist: string;
  /** Every CandidateProvider that contributed to this candidate (see CandidateAggregator's contribution-merging on dedup) — usually just ['lastfm'] today, but never assumed to be exactly one. */
  providers: string[];
  seedArtist: string | null;
  /** Whether `seedArtist` came from the live Spotify Top Artists call or the local library — see LastFmCandidateProvider's TEMPORARY seedArtistSource tagging. */
  seedArtistSource: 'topArtists' | 'library' | null;
  similarArtist: string | null;
  /** Present only when this candidate matched a track already in the user's library via Last.fm's track.getsimilar — see LastFmCandidateProvider's TEMPORARY trackSimilaritySeedTrack tagging. */
  trackSimilaritySeedTrack: { name: string; artist: string } | null;
  /** Human-readable reconstruction of "why this candidate exists" from the two provenance fields above. */
  similarityChain: string;
  /** Heuristic tag-keyword classification (see DANISH_LANGUAGE_KEYWORDS) — approximate, not ground truth: no data source anywhere in this app records a track/artist's actual country or language. */
  countryLanguage: 'danish' | 'international' | 'unknown';
  tags: string[];
  score: number;
  scoreBreakdown: ScoreBreakdown;
  /** Full per-signal value/confidence/similarity detail underneath the 5 scoreBreakdown buckets — see computeSignalLevelDetail. */
  signalDetail: SignalLevelDetail[];
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

/** TEMPORARY — one-time candidate-quality audit only: how many of the top-ranked pool to audit, per the Danish-recommendation-dominance investigation's request for "the first 100 recommendation candidates." */
const CANDIDATE_AUDIT_SIZE = 100;

/**
 * TEMPORARY — one-time candidate-quality audit only. Crude keyword
 * matching against Last.fm's free-text tags — the same "simplest
 * correct implementation," fixed-list posture as tagBasedEnricher's own
 * GENRE_KEYWORDS, applied here to nationality/language instead of
 * genre. This is a heuristic, not ground truth: no signal, field, or
 * API anywhere in this app records a track/artist's actual country or
 * language (confirmed by inspection before this audit was built).
 * Deliberately narrow (only unambiguous Danish-specific terms) so
 * "danish" is never over-counted against Scandinavian neighbors.
 */
const DANISH_LANGUAGE_KEYWORDS = ['danish', 'dansk', 'denmark', 'danmark'];

/** TEMPORARY — one-time candidate-quality audit only. See DANISH_LANGUAGE_KEYWORDS for the classification's known limits. */
const classifyCountryLanguage = (tags: readonly string[]): 'danish' | 'international' | 'unknown' => {
  if (tags.length === 0) return 'unknown';
  const lowerTags = tags.map((tag) => tag.toLowerCase());
  const isDanish = lowerTags.some((tag) => DANISH_LANGUAGE_KEYWORDS.some((keyword) => tag.includes(keyword)));
  return isDanish ? 'danish' : 'international';
};

/** TEMPORARY — one-time candidate-quality audit only: a human-readable reconstruction of "why this candidate exists" from its provenance fields. */
const buildSimilarityChain = (
  seedArtist: string | null,
  seedArtistSource: 'topArtists' | 'library' | null,
  similarArtist: string | null,
  trackSimilaritySeedTrack: { name: string; artist: string } | null,
): string => {
  const parts: string[] = [];
  if (seedArtist !== null) {
    const sourceLabel = seedArtistSource === 'topArtists' ? 'Spotify Top Artists' : seedArtistSource === 'library' ? 'local library' : 'unknown source';
    parts.push(`${sourceLabel} seed "${seedArtist}" → Last.fm similar artist "${similarArtist ?? '(unknown)'}"`);
  }
  if (trackSimilaritySeedTrack !== null) {
    parts.push(`library track "${trackSimilaritySeedTrack.artist} – ${trackSimilaritySeedTrack.name}" → Last.fm track.getsimilar`);
  }
  return parts.length > 0 ? parts.join('; ') : 'unknown (no recorded provenance)';
};

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
  private readonly observationSink: ObservationSink;

  constructor(
    userDnaRepository: UserDnaRepository,
    trackDnaRepository: TrackDnaRepository,
    candidateAggregator: CandidateAggregator,
    enrichmentPipeline: EnrichmentPipeline,
    rankingEngine: RankingEngine,
    recommendationMemoryRepository: RecommendationMemoryRepository,
    observationSink: ObservationSink,
  ) {
    this.userDnaRepository = userDnaRepository;
    this.trackDnaRepository = trackDnaRepository;
    this.candidateAggregator = candidateAggregator;
    this.enrichmentPipeline = enrichmentPipeline;
    this.rankingEngine = rankingEngine;
    this.recommendationMemoryRepository = recommendationMemoryRepository;
    this.observationSink = observationSink;
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

    const { candidates, rawCandidateCount, deduplicatedCandidateCount, providerDiagnostics } = await this.candidateAggregator.fetchAll(
      { limit: CANDIDATE_POOL_SIZE },
      now,
    );
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

    // M31: pipeline instrumentation — see recordPipelineMeasurement's own
    // docs for what each count measures. Purely observational (M13 Rule
    // 1): touches no candidate selection, no ranking, nothing this method
    // returns.
    this.recordPipelineMeasurement(userId, rawCandidateCount, deduplicatedCandidateCount, enrichedCandidates.length, topRanked.length, providerDiagnostics, now);

    // TEMPORARY — one-time candidate-quality audit (Danish-recommendation-
    // dominance investigation). Supersedes and replaces M24's
    // logRecommendationTrace (same read-only posture, strictly more
    // fields). See runCandidateQualityAudit's own docs.
    const candidateAuditEntries = this.runCandidateQualityAudit(persistedByCandidateId, rankedPool, topRanked, userDnaResult.value);

    const queue = RecommendationQueue.create(topRanked);

    return success({ queue, enrichedCandidates: topEnriched, candidateAuditEntries });
  }

  /**
   * M31: records one `CandidatePipelineMeasured` observation per
   * `execute()` run, giving visibility into the real candidate pipeline
   * without changing anything about it. Each count is named for the
   * exact stage it measures (see `observability`'s own `CandidatePipelineMeasured`
   * docs for the full field-by-field explanation):
   *
   * - rawCandidateCount / deduplicatedCandidateCount: from
   *   CandidateAggregator, before/after its cross-provider dedup.
   * - enrichedCandidateCount: how many candidates the EnrichmentPipeline
   *   produced a TrackDNA for this run (after exclusion/memory
   *   suppression, before ranking).
   * - finalRankedPoolSize: the size of the RecommendationQueue this run
   *   actually built.
   * - providerDiagnostics: per-provider instrumentation (e.g.
   *   LastFmCandidateProvider's own seed/artist/call counts).
   *
   * Never throws: a recording failure here must never affect the
   * returned queue, the same "diagnostics must never break Discovery"
   * posture `logRecommendationTrace` already established (M24).
   */
  private recordPipelineMeasurement(
    userId: string,
    rawCandidateCount: number,
    deduplicatedCandidateCount: number,
    enrichedCandidateCount: number,
    finalRankedPoolSize: number,
    providerDiagnostics: readonly ProviderDiagnosticsEntry[],
    now: Date,
  ): void {
    try {
      this.observationSink.recordCandidatePipelineMeasured(
        { userId, rawCandidateCount, deduplicatedCandidateCount, enrichedCandidateCount, finalRankedPoolSize, providerDiagnostics },
        now,
      );

      // ============================================================
      // TEMPORARY — M31 manual evaluation aid. REMOVE after the
      // manual evaluation phase is complete. Read-only: prints
      // already-recorded observations, changes nothing about
      // candidate selection, ranking, or what Discovery returns.
      // ============================================================
      const isCandidatePipelineMeasured = (observation: { type: string }): observation is CandidatePipelineMeasured => observation.type === 'CandidatePipelineMeasured';
      const measurements = this.observationSink
        .getAll()
        .filter(isCandidatePipelineMeasured)
        .map((observation) => ({
          observedAt: observation.observedAt,
          userId: observation.userId,
          rawCandidateCount: observation.rawCandidateCount,
          deduplicatedCandidateCount: observation.deduplicatedCandidateCount,
          enrichedCandidateCount: observation.enrichedCandidateCount,
          finalRankedPoolSize: observation.finalRankedPoolSize,
          providerDiagnostics: JSON.stringify(observation.providerDiagnostics),
        }));
      console.table(measurements);
      // ============================================================
      // END TEMPORARY M31 manual evaluation aid.
      // ============================================================
    } catch (error) {
      console.warn('[M31] Kunne ikke registrere pipeline-diagnostik (påvirker ikke Discovery):', error);
    }
  }

  /**
   * TEMPORARY — one-time candidate-quality audit for the Danish-
   * recommendation-dominance investigation. Read-only: touches no
   * candidate selection, no ranking, no persistence — exactly the same
   * posture as the M24 trace it replaces. Never throws: a failure here
   * must never break Discovery.
   *
   * Audits the first CANDIDATE_AUDIT_SIZE entries of `rankedPool` — the
   * fully ranked pool, in ranking order, BEFORE diversifyRankedCandidates()
   * caps it down to the visible queue. `rankPosition` is this candidate's
   * 1-based position in that order; `survivedToQueue` says whether it
   * also made it past the per-artist cap into `topRanked`.
   */
  private runCandidateQualityAudit(
    persistedByCandidateId: ReadonlyMap<string, EnrichedCandidate>,
    rankedPool: readonly RankedCandidate[],
    topRanked: readonly RankedCandidate[],
    userDna: UserDNA,
  ): CandidateAuditEntry[] {
    try {
      const survivedCandidateIds = new Set(topRanked.map((ranked) => ranked.candidateRef));

      const buildEntry = (ranked: RankedCandidate, index: number): CandidateAuditEntry | null => {
        const enriched = persistedByCandidateId.get(ranked.candidateRef);
        if (!enriched) return null;

        const rawMetadata = enriched.candidate.contributions[0]?.rawMetadata;
        const provenance = typeof rawMetadata === 'object' && rawMetadata !== null ? (rawMetadata as Record<string, unknown>) : {};
        const tags = Array.isArray(provenance.tags) ? (provenance.tags as string[]) : [];

        const seedArtist = typeof provenance.seedArtist === 'string' ? provenance.seedArtist : null;
        const seedArtistSource = provenance.seedArtistSource === 'topArtists' || provenance.seedArtistSource === 'library' ? provenance.seedArtistSource : null;
        const similarArtist = typeof provenance.similarArtist === 'string' ? provenance.similarArtist : null;
        const rawSeedTrack = provenance.trackSimilaritySeedTrack;
        const trackSimilaritySeedTrack =
          typeof rawSeedTrack === 'object' && rawSeedTrack !== null && typeof (rawSeedTrack as { name: unknown }).name === 'string' && typeof (rawSeedTrack as { artist: unknown }).artist === 'string'
            ? (rawSeedTrack as { name: string; artist: string })
            : null;

        return {
          rankPosition: index + 1,
          survivedToQueue: survivedCandidateIds.has(ranked.candidateRef),
          title: enriched.candidate.title,
          artist: enriched.candidate.artists[0] ?? '(ukendt artist)',
          providers: [...new Set(enriched.candidate.contributions.map((contribution) => contribution.providerName))],
          seedArtist,
          seedArtistSource,
          similarArtist,
          trackSimilaritySeedTrack,
          similarityChain: buildSimilarityChain(seedArtist, seedArtistSource, similarArtist, trackSimilaritySeedTrack),
          countryLanguage: classifyCountryLanguage(tags),
          tags,
          score: ranked.score,
          scoreBreakdown: ranked.scoreBreakdown,
          signalDetail: computeSignalLevelDetail(userDna.signals, enriched.trackDna.signals),
        };
      };

      const entries: CandidateAuditEntry[] = [];
      for (const [index, ranked] of rankedPool.slice(0, CANDIDATE_AUDIT_SIZE).entries()) {
        const entry = buildEntry(ranked, index);
        if (entry) entries.push(entry);
      }
      return entries;
    } catch (error) {
      console.warn('[candidate-audit] Diagnostisk audit fejlede (påvirker ikke Discovery):', error);
      return [];
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
