import type { Candidate } from '../../candidateProviders';
import type { Enricher, PartialSignalContribution } from '../types';

/**
 * An arbitrary, deterministic normalization constant — not statistically
 * derived from any real Last.fm listener-count distribution (no such
 * dataset has been collected). It exists only to turn an unbounded raw
 * count into the catalog's shared [0, 1] scale, the same "simplest
 * deterministic normalization, not a statistical claim" posture M2's
 * REFERENCE_MAX_DURATION_MS already uses for song length.
 */
const REFERENCE_MAX_LISTENERS = 1_000_000;

/**
 * Real, directly-observed data (unlike tagBasedEnricher's crude keyword
 * matching), but the log-scale mapping below is an initial, uncalibrated
 * choice — not tuned against any real listener-count distribution — so
 * this sits at the same confidence tier as tag-based enrichment, not as
 * high as a direct boolean flag (explicitMetadataEnricher's 0.9).
 */
const POPULARITY_ENRICHMENT_CONFIDENCE = 0.5;

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads a `listeners: number` field from any contribution's rawMetadata — the first usable one found, since all contributions describe the same candidate. */
const findListeners = (candidate: Candidate): number | null => {
  for (const contribution of candidate.contributions) {
    const { rawMetadata } = contribution;
    if (isRecord(rawMetadata) && typeof rawMetadata.listeners === 'number' && Number.isFinite(rawMetadata.listeners) && rawMetadata.listeners > 0) {
      return rawMetadata.listeners;
    }
  }
  return null;
};

/**
 * M26: owns the single `mainstream` signal — previously always at its
 * neutral default for every real candidate, since no enricher populated
 * it. Last.fm's own `listeners` count (already attached to every
 * LastFmCandidateProvider candidate's rawMetadata since M21/M24 — never
 * fetched specially for this) is the only input. `playcount`
 * (repeat-listening intensity, a different concept from reach) and
 * `similarArtistMatch` (a taste-similarity score, not a popularity
 * measure) are deliberately not used or combined with it — inventing a
 * weighted combination without evidence it's better than the simpler
 * single-field signal would be premature sophistication this milestone
 * doesn't claim.
 *
 * log10(listeners) / log10(REFERENCE_MAX_LISTENERS) is an initial,
 * uncalibrated mapping, not tuned against any real listener-count
 * distribution — no such calibration data exists yet. A logarithmic (not
 * linear) scale is necessary regardless of tuning: listener counts span
 * many orders of magnitude, and a linear scale against any fixed ceiling
 * would collapse nearly every real candidate to ~0. Recalibrating the
 * ceiling or the transform itself, if real usage ever shows this spread
 * is wrong, is an explicit future decision, not something this milestone
 * claims to have gotten right.
 *
 * M26 does not change any ranking weights or balancing — RankingEngine's
 * formula, SIGNAL_GROUPS, and SIGNAL_CATALOG are all unchanged. This
 * enricher only supplies data to a signal that was previously empty.
 *
 * Deterministic, network-free (M4 Rule 8): reads only what's already
 * present in the Candidate it was given. Missing/zero/negative/
 * non-numeric listeners is treated as genuinely unknown (M4 Rule 5), not
 * as evidence of "very niche" — this enricher then contributes nothing,
 * leaving `mainstream` at validateSignalVector()'s neutral default, the
 * same "missing is normal" posture tagBasedEnricher and
 * explicitMetadataEnricher already use.
 */
export const popularityEnricher: Enricher = {
  enricherName: 'popularity',
  ownedSignals: ['mainstream'],

  async enrich(candidate: Candidate): Promise<PartialSignalContribution> {
    const listeners = findListeners(candidate);
    if (listeners === null) return {};

    const value = clamp01(Math.log10(listeners) / Math.log10(REFERENCE_MAX_LISTENERS));
    return { mainstream: { value, confidence: POPULARITY_ENRICHMENT_CONFIDENCE } };
  },
};
