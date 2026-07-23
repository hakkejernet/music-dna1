/**
 * One provider's contribution to a (possibly deduplicated) Candidate.
 * TDS §3 Candidate: "rawMetadata bevares pr. bidrag, ikke kun det først
 * sete" — this array is that rule made literal. Every provider that
 * contributed to a candidate keeps its own externalIds/rawMetadata; a
 * dedup merge never discards one contribution to keep another (M3 Rule 6).
 */
export interface CandidateContribution {
  providerName: string;
  /** Whatever the provider used to identify this track (isrc, mbid, its own id — not necessarily a Spotify id). */
  externalIds: Record<string, string>;
  /** Everything the provider sent, unmodified — traceability, not optional (TDS §3). */
  rawMetadata: unknown;
}

/**
 * TDS §3 Candidate, minus providerMetadataRef (see ProviderMetadata
 * below — M3 keeps provider health as a sibling result rather than a
 * cross-reference field, since nothing in this milestone needs the
 * indirection). Raw, unscored, unranked (TDS §2 candidate-providers
 * "Output"): a Candidate has no field for a score, a rank, or anything
 * ranking/UI would need — only identity and where it came from.
 */
export interface Candidate {
  candidateId: string;
  title: string;
  artists: string[];
  contributions: CandidateContribution[];
}

/** What a caller asks a provider (or the aggregator) for — deliberately minimal; M3 has no filtering/personalization concept to add here. */
export interface CandidateRequest {
  limit: number;
}

/**
 * A pure interface (M3 Rule 1): a provider knows only its own input and
 * output. It must never import from userDna, ranking, feedback, queue,
 * discovery, UI, or analytics — doing so would make candidate-providers
 * know things TDS §2 explicitly forbids it from knowing.
 */
export interface CandidateProvider {
  readonly providerName: string;
  fetchCandidates(request: CandidateRequest): Promise<Candidate[]>;

  /**
   * M31: optional, additive instrumentation hook — a provider that
   * implements it reports named counters about its own most recent
   * `fetchCandidates()` call, for visibility only. Never required
   * (a provider that omits it is simply left out of
   * `CandidateAggregatorResult.providerDiagnostics`), and never allowed
   * to influence `fetchCandidates()`'s own behavior or return value —
   * this is a read-only "what just happened" report, not a second
   * output channel for candidates themselves.
   */
  getLastFetchDiagnostics?(): Readonly<Record<string, number>> | null;
}

/**
 * TDS §3 ProviderMetadata, minus capabilities/qualityScore. Those two
 * fields require knowledge M3 doesn't have yet: capabilities describes
 * what enrichment (M4) can expect from a source, qualityScore is
 * computed by analytics (M10) from feedback outcomes. Adding them here
 * now would be guessing at a shape before the modules that own that
 * knowledge exist. lastSuccessAt/lastFailureAt are the only fields M3's
 * own error-isolation logic (Rule 5) actually produces.
 */
export interface ProviderMetadata {
  providerName: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
}
