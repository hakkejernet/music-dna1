import type { Candidate } from '../candidateProviders';
import { SIGNAL_CATALOG, validateSignalVector, type TrackDNA } from '../trackDna';
import { deepFreeze } from './deepFreeze';
import type { EnrichedCandidate, Enricher, PartialSignalContribution } from './types';

/** enrichmentCompleteness (TDS §3): the share of the catalog that ended up with a non-trivial (>0) confidence. */
const computeEnrichmentCompleteness = (signals: Record<string, { confidence: number }>): number => {
  const nonTrivialCount = SIGNAL_CATALOG.filter((definition) => signals[definition.signalKey].confidence > 0).length;
  return nonTrivialCount / SIGNAL_CATALOG.length;
};

/**
 * Enforces M4 Rule 3 ("one responsible enricher per signal, no implicit
 * overwriting") at construction time, before any Candidate is ever
 * enriched. Two enrichers declaring the same signal is a wiring bug, not
 * a per-candidate data problem — it belongs with the other fail-fast
 * construction checks in this codebase (contrast with per-candidate
 * enrichment failures, which must never throw, see Rule 5). There is
 * deliberately no override/precedence mechanism: if two enrichers ever
 * need to legitimately compete for the same signal, that is a real
 * design decision to make explicitly when it happens, not something to
 * pre-build for a case that does not exist yet.
 */
const assertDisjointOwnership = (enrichers: readonly Enricher[]): void => {
  const ownerOf = new Map<string, string>();
  for (const enricher of enrichers) {
    for (const signalKey of enricher.ownedSignals) {
      const existingOwner = ownerOf.get(signalKey);
      if (existingOwner !== undefined) {
        throw new Error(
          `Signal "${signalKey}" is claimed by both "${existingOwner}" and "${enricher.enricherName}" — ` +
            'each signal must have exactly one responsible enricher (M4 Rule 3).',
        );
      }
      ownerOf.set(signalKey, enricher.enricherName);
    }
  }
};

/**
 * The sole orchestrator of multiple enrichers — same role for enrichment
 * that CandidateAggregator (M3) plays for candidate providers. Enrichers
 * stay mutually unaware of each other; only this class combines them.
 */
export class EnrichmentPipeline {
  private readonly enrichers: readonly Enricher[];

  constructor(enrichers: readonly Enricher[]) {
    assertDisjointOwnership(enrichers);
    this.enrichers = enrichers;
  }

  /**
   * `now` is an explicit parameter, not read internally — same
   * determinism-by-injection pattern as M2/M3: identical (candidate,
   * now) always produces an identical EnrichedCandidate (M4 Rule 6).
   *
   * The input Candidate is deep-frozen before any enricher touches it
   * (M4 Rule 1) and returned by reference, unmodified, as `candidate` on
   * the result — the original can always be read back exactly as given.
   *
   * Promise.allSettled is what makes Rule 5 hold at the enricher level,
   * the same way it did for providers in M3: one enricher throwing (for
   * any reason, including a missing field it didn't expect) can never
   * prevent the other enrichers' contributions from being collected —
   * its own owned signals simply stay at validateSignalVector()'s
   * neutral default, which is the same "missing is normal" philosophy
   * M1/M2 already established.
   */
  async enrich(candidate: Candidate, now: Date): Promise<EnrichedCandidate> {
    const frozenCandidate = deepFreeze(candidate);

    const settled = await Promise.allSettled(this.enrichers.map((enricher) => enricher.enrich(frozenCandidate)));

    const rawSignals: PartialSignalContribution = {};
    const signalSources: Record<string, string> = {};
    const enricherNames: string[] = [];

    settled.forEach((result, index) => {
      const enricher = this.enrichers[index];
      if (result.status === 'rejected') return;

      enricherNames.push(enricher.enricherName);
      for (const [signalKey, reading] of Object.entries(result.value)) {
        // Only a signal the enricher actually declared ownership of may
        // be recorded from it — defends the one-owner invariant even if
        // an enricher's own logic misbehaves (Rule 3), without turning
        // that misbehavior into a crash (Rule 5).
        if (reading === undefined || !enricher.ownedSignals.includes(signalKey)) continue;
        rawSignals[signalKey] = reading;
        signalSources[signalKey] = enricher.enricherName;
      }
    });

    const signals = validateSignalVector(rawSignals);
    const trackDna: TrackDNA = {
      // No separate track-id-minting service exists yet — using the
      // candidateId is the simplest honest choice available in this
      // milestone (see Review Report scope note).
      trackId: candidate.candidateId,
      signals,
      sourceCandidateRef: candidate.candidateId,
      enrichmentCompleteness: computeEnrichmentCompleteness(signals),
    };

    return {
      candidate,
      trackDna,
      enrichmentMetadata: { enricherNames, signalSources, enrichedAt: now.toISOString() },
    };
  }
}
