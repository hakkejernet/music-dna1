import type { Candidate } from '../../candidateProviders';
import type { Enricher, PartialSignalContribution } from '../types';

/**
 * A provider-supplied boolean flag is direct track metadata, not an
 * inference — the same category of evidence as Spotify's own `explicit`
 * field in v1. High confidence, but not 1.0: the field is still
 * provider-reported data that could be stale or wrong, not independently
 * verified by this system.
 */
const EXPLICIT_METADATA_CONFIDENCE = 0.9;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const findExplicitFlag = (candidate: Candidate): boolean | null => {
  for (const contribution of candidate.contributions) {
    const { rawMetadata } = contribution;
    if (isRecord(rawMetadata) && typeof rawMetadata.explicit === 'boolean') {
      return rawMetadata.explicit;
    }
  }
  return null;
};

/**
 * Owns exactly one signal: `explicitness`. Deterministic, network-free
 * (M4 Rule 8) — reads only what a provider already attached to the
 * Candidate. A missing `explicit` field is normal (Rule 5): this
 * enricher then contributes nothing, leaving `explicitness` at
 * validateSignalVector()'s neutral default.
 */
export const explicitMetadataEnricher: Enricher = {
  enricherName: 'explicit-metadata',
  ownedSignals: ['explicitness'],

  async enrich(candidate: Candidate): Promise<PartialSignalContribution> {
    const explicitFlag = findExplicitFlag(candidate);
    if (explicitFlag === null) return {};

    return { explicitness: { value: explicitFlag ? 1 : 0, confidence: EXPLICIT_METADATA_CONFIDENCE } };
  },
};
