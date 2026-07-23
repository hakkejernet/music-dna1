import type { Candidate, CandidateProvider, CandidateRequest, ProviderMetadata } from './types';

/**
 * Loose matching key for dedup: strips accents/punctuation/case so
 * "Beyonce" (accented or not) or "Song (Remix)" vs "song remix" collapse
 * to the same candidate. Deliberately crude - a real matching strategy
 * (ISRC-based, fuzzy, etc.) is a future concern, not M3's; this is the
 * simplest thing that lets two test providers "agree" on a track.
 */
const normalizeForMatching = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const dedupeKey = (candidate: Candidate): string =>
  `${normalizeForMatching(candidate.title)}::${normalizeForMatching(candidate.artists[0] ?? '')}`;

/** M31: which provider reported the diagnostics, and the provider's own named counters (see `LastFmCandidateProvider.getLastFetchDiagnostics` for the concrete field meanings). Only present for providers that implement the optional `getLastFetchDiagnostics()` hook. */
export interface ProviderDiagnosticsEntry {
  providerName: string;
  diagnostics: Readonly<Record<string, number>>;
}

export interface CandidateAggregatorResult {
  candidates: Candidate[];
  providerMetadata: ProviderMetadata[];
  /** M31: total candidates returned across all providers' own `fetchCandidates()` calls, before this aggregator's cross-provider dedup below. */
  rawCandidateCount: number;
  /** M31: `candidates.length` — the count after this aggregator's own cross-provider dedup (`byKey.size`). */
  deduplicatedCandidateCount: number;
  /** M31: per-provider instrumentation, collected only from providers implementing the optional `getLastFetchDiagnostics()` hook. */
  providerDiagnostics: ProviderDiagnosticsEntry[];
}

/**
 * The ONLY place that knows more than one CandidateProvider exists (M3
 * Rule 3). Providers themselves stay mutually unaware - this class is
 * what lets one be added or removed without touching any other.
 */
export class CandidateAggregator {
  private readonly providers: readonly CandidateProvider[];

  constructor(providers: readonly CandidateProvider[]) {
    this.providers = providers;
  }

  /**
   * `now` is an explicit parameter, not `Date.now()` read internally -
   * same determinism-by-injection pattern as buildColdStartUserDna
   * (M2), for the same reason: a pure function is trivially testable.
   *
   * Promise.allSettled is what makes Rule 5 (error isolation) hold: one
   * provider rejecting can never prevent the others' results from being
   * collected, and is recorded as this provider's own failure only.
   */
  async fetchAll(request: CandidateRequest, now: Date): Promise<CandidateAggregatorResult> {
    const settled = await Promise.allSettled(this.providers.map((provider) => provider.fetchCandidates(request)));

    const providerMetadata: ProviderMetadata[] = [];
    const providerDiagnostics: ProviderDiagnosticsEntry[] = [];
    const byKey = new Map<string, Candidate>();
    let rawCandidateCount = 0;

    settled.forEach((result, index) => {
      const provider = this.providers[index];

      // M31: recorded regardless of success/failure — the diagnostics hook
      // reports "what happened on this provider's most recent attempt,"
      // which is meaningful even when that attempt ultimately failed.
      const diagnostics = provider.getLastFetchDiagnostics?.() ?? null;
      if (diagnostics !== null) providerDiagnostics.push({ providerName: provider.providerName, diagnostics });

      if (result.status === 'rejected') {
        providerMetadata.push({ providerName: provider.providerName, lastSuccessAt: null, lastFailureAt: now.toISOString() });
        return;
      }

      providerMetadata.push({ providerName: provider.providerName, lastSuccessAt: now.toISOString(), lastFailureAt: null });
      rawCandidateCount += result.value.length;

      for (const candidate of result.value) {
        const key = dedupeKey(candidate);
        const existing = byKey.get(key);
        // Metadata is never discarded on dedup (M3 Rule 6): merging two
        // providers' view of "the same song" concatenates contributions
        // rather than picking one and dropping the other.
        byKey.set(
          key,
          existing
            ? { ...existing, contributions: [...existing.contributions, ...candidate.contributions] }
            : candidate,
        );
      }
    });

    return { candidates: [...byKey.values()], providerMetadata, rawCandidateCount, deduplicatedCandidateCount: byKey.size, providerDiagnostics };
  }
}
