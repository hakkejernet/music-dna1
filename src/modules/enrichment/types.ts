import type { Candidate } from '../candidateProviders';
import type { SignalVector, TrackDNA } from '../trackDna';

/**
 * One enricher's contribution attempt for a single Candidate. Deliberately
 * a plain, partial signal map (not a full SignalVector) — an enricher is
 * allowed to leave out any signal it cannot determine (M4 Rule 5: missing
 * metadata is normal, never a failure). Whatever it omits, the pipeline
 * lets validateSignalVector() fill in the neutral default, exactly like
 * M1/M2 already do.
 */
export type PartialSignalContribution = Partial<SignalVector>;

/**
 * A pure, single-responsibility signal producer (M4 Rule 3: one
 * responsible enricher per signal). `ownedSignals` is a declared,
 * checkable contract — the pipeline uses it both to prevent two
 * enrichers from silently fighting over the same signal (checked at
 * construction, see EnrichmentPipeline) and to discard any reading an
 * enricher returns outside its own declared ownership.
 *
 * async to mirror CandidateProvider's shape (M3) — not because M4 makes
 * network calls (it explicitly must not, Rule 8), but because a future
 * enricher performing its own local computation that happens to be
 * asynchronous shouldn't require changing this interface.
 */
export interface Enricher {
  readonly enricherName: string;
  readonly ownedSignals: readonly string[];
  enrich(candidate: Candidate): Promise<PartialSignalContribution>;
}

/**
 * Records, per signal, which enricher actually produced its value this
 * run. This is the concrete architecture support for TrackDNA Rule 7
 * ("source" per signal) without touching TrackDNA/SignalReading's own
 * schema (owned by M1's track-dna module, out of scope here) — source
 * lives alongside TrackDNA as enrichment's own output, not inside it.
 * A signal with no entry here was never touched by any enricher this
 * run and sits at validateSignalVector()'s neutral default.
 */
export interface EnrichmentMetadata {
  enricherNames: string[];
  signalSources: Record<string, string>;
  enrichedAt: string;
}

/**
 * M4 Rule 1's output shape: the original Candidate, verbatim and
 * unmutated, alongside the TrackDNA it produced and metadata about how
 * it was produced. Keeping `candidate` as a sibling field (not folding
 * it into TrackDNA) is what makes "the original Candidate can always be
 * reconstructed unchanged" a structural guarantee rather than something
 * that has to be reverse-engineered from TrackDNA.
 */
export interface EnrichedCandidate {
  candidate: Candidate;
  trackDna: TrackDNA;
  enrichmentMetadata: EnrichmentMetadata;
}
