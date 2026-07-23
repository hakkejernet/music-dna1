/**
 * Every Observation is a self-contained snapshot of primitives — no
 * imported domain type is used anywhere in this file (M13 Rule 6: no
 * module outside Observability owns knowledge Observability needs, and
 * Observability itself needs no knowledge of `Candidate`/`TrackDNA`/
 * `RankedCandidate`/`UserDNA` beyond their own id strings and a score
 * number). This is a deliberate design choice, not an oversight — it's
 * what makes "no dependency from the domain to Observability" trivially
 * true in both directions: Observability never imports the domain, and
 * the domain never needs to import Observability's *types* to produce
 * one (only the `ObservationSink` *contract*, per Rule 6, would ever be
 * referenced by a future caller — see Review Report for why no current
 * module does yet).
 *
 * Immutable by construction (M13 Rule 11) — every field is `readonly`,
 * and `InMemoryObservationSink` additionally `Object.freeze()`s each
 * instance before storing it, so this is a structural guarantee, not
 * just a compile-time annotation.
 */
export interface RecommendationShown {
  readonly type: 'RecommendationShown';
  readonly candidateRef: string;
  readonly trackDnaRef: string;
  readonly score: number;
  readonly providerNames: readonly string[];
  readonly observedAt: string;
}

export interface RecommendationAccepted {
  readonly type: 'RecommendationAccepted';
  readonly candidateRef: string;
  readonly trackDnaRef: string;
  readonly observedAt: string;
}

export interface RecommendationRejected {
  readonly type: 'RecommendationRejected';
  readonly candidateRef: string;
  readonly trackDnaRef: string;
  readonly observedAt: string;
}

export interface RecommendationKnown {
  readonly type: 'RecommendationKnown';
  readonly candidateRef: string;
  readonly trackDnaRef: string;
  readonly observedAt: string;
}

/** `changed` mirrors learningEngine's own no-op detection (M8) — whether this particular learning event actually altered anything, without Observability needing to inspect a UserDNA to find out. */
export interface LearningApplied {
  readonly type: 'LearningApplied';
  readonly userId: string;
  readonly eventId: string;
  readonly changed: boolean;
  readonly observedAt: string;
}

/**
 * M31: one BuildDiscoveryQueue.execute() run's pipeline counts, purely
 * observational — never read by ranking, filtering, or anything else in
 * the system. Every count is named for the exact stage it measures, so
 * a future comparison can never accidentally mix counts from different
 * stages:
 *
 * - rawCandidateCount: total candidates returned across all
 *   CandidateProviders' own fetchCandidates() calls, before
 *   CandidateAggregator's cross-provider dedup.
 * - deduplicatedCandidateCount: the count after that cross-provider
 *   dedup — i.e. how many distinct candidates entered the rest of this
 *   pipeline run (memory filtering, enrichment, ranking).
 * - enrichedCandidateCount: how many candidates the EnrichmentPipeline
 *   actually produced a TrackDNA for this run (after excludeCandidateIds
 *   and Recommendation Memory suppression, before ranking).
 * - finalRankedPoolSize: the size of the RecommendationQueue this run
 *   actually built — what the user will really be shown.
 * - providerDiagnostics: per-provider instrumentation (e.g. seed artist
 *   count, Last.fm call count for LastFmCandidateProvider) — see each
 *   provider's own `getLastFetchDiagnostics()` for field meanings; only
 *   present for providers that implement that optional hook.
 */
export interface CandidatePipelineMeasured {
  readonly type: 'CandidatePipelineMeasured';
  readonly userId: string;
  readonly rawCandidateCount: number;
  readonly deduplicatedCandidateCount: number;
  readonly enrichedCandidateCount: number;
  readonly finalRankedPoolSize: number;
  readonly providerDiagnostics: readonly { readonly providerName: string; readonly diagnostics: Readonly<Record<string, number>> }[];
  readonly observedAt: string;
}

export type Observation =
  | RecommendationShown
  | RecommendationAccepted
  | RecommendationRejected
  | RecommendationKnown
  | LearningApplied
  | CandidatePipelineMeasured;

/**
 * The one contract between a future caller (an Application Service)
 * and Observability (M13 Rule 5/6): a caller describes *what
 * happened*, in plain, minimal terms — Observability decides how that
 * becomes a stored `Observation` (adding `type`, `observedAt`, and
 * freezing the result). A caller never constructs an `Observation`
 * object itself.
 *
 * Every `record*` method takes an explicit `now: Date` — the same
 * determinism-by-injection convention used everywhere else in this
 * project (M2 onward) — never a live clock read internally.
 *
 * Deliberately synchronous and `void`-returning (M13 Rule 1: recording
 * an observation must never influence anything — a method a caller
 * could branch on, or that itself performs I/O, would blur that line).
 */
export interface ObservationSink {
  recordRecommendationShown(input: { candidateRef: string; trackDnaRef: string; score: number; providerNames: readonly string[] }, now: Date): void;
  recordRecommendationAccepted(input: { candidateRef: string; trackDnaRef: string }, now: Date): void;
  recordRecommendationRejected(input: { candidateRef: string; trackDnaRef: string }, now: Date): void;
  recordRecommendationKnown(input: { candidateRef: string; trackDnaRef: string }, now: Date): void;
  recordLearningApplied(input: { userId: string; eventId: string; changed: boolean }, now: Date): void;
  recordCandidatePipelineMeasured(
    input: {
      userId: string;
      rawCandidateCount: number;
      deduplicatedCandidateCount: number;
      enrichedCandidateCount: number;
      finalRankedPoolSize: number;
      providerDiagnostics: readonly { providerName: string; diagnostics: Readonly<Record<string, number>> }[];
    },
    now: Date,
  ): void;
  getAll(): readonly Observation[];
}
