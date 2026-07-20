import type { SignalVector } from '../trackDna';
import { SCORE_BREAKDOWN_KEYS, SIGNAL_GROUPS, type ScoreBreakdownKey } from './signalGroups';
import type { ScoreBreakdown } from './types';

/**
 * How close two readings' values are, on the shared [0, 1] catalog
 * scale (SIGNAL_CATALOG, M1) — 1 is a perfect match, 0 is maximally far
 * apart. The simplest correct distance measure for a bounded,
 * continuous scale.
 */
const valueSimilarity = (a: number, b: number): number => 1 - Math.abs(a - b);

/**
 * M5 Rule 5: confidence must weight the score, and a perfect match at
 * confidence 0.2 must weigh less than the same match at confidence 0.9
 * — not just relative to other signals, but in absolute terms.
 * Multiplying both sides' confidences (0 if either side is unknown)
 * gives Rule 4 for free: an unknown signal's combined weight is 0.
 *
 * A bucket score is `quality * trust`:
 * - `quality` is how good the match is on the signals we *do* know
 *   about — a confidence-weighted average among only the signals with
 *   nonzero combined confidence. Signals neither side could speak to
 *   are excluded here, not counted as a bad match (Rule 4: missing
 *   data must never ruin the score).
 * - `trust` is how much of the bucket we actually know anything
 *   about — mean combined confidence across *all* signals in the
 *   bucket, including the unknown ones. This is what makes Rule 5
 *   literal: a single-signal bucket (mainstreamMatch, explicitMatch,
 *   durationMatch) with a perfect-similarity match reduces exactly to
 *   `1 * combinedConfidence`, so 0.2 vs. 0.9 confidence produces 0.2
 *   vs. 0.9 directly. For a multi-signal bucket (genreMatch) where
 *   only some signals have data, partial coverage lowers `trust`
 *   without quality ever being treated as poor — an honest reflection
 *   of "we've only confirmed part of this," not a penalty on the part
 *   we did confirm.
 *
 * Both `quality` and `trust` are always in [0, 1], so their product is
 * too — and the formula never divides by a possibly-zero total without
 * a guard, so it never produces NaN.
 */
const bucketScore = (signalKeys: readonly string[], userSignals: SignalVector, trackSignals: SignalVector): number => {
  let totalConfidence = 0;
  let knownWeight = 0;
  let knownWeightedSimilarity = 0;

  for (const signalKey of signalKeys) {
    const userReading = userSignals[signalKey];
    const trackReading = trackSignals[signalKey];
    const weight = userReading.confidence * trackReading.confidence;
    totalConfidence += weight;
    if (weight > 0) {
      knownWeight += weight;
      knownWeightedSimilarity += weight * valueSimilarity(userReading.value, trackReading.value);
    }
  }

  const quality = knownWeight > 0 ? knownWeightedSimilarity / knownWeight : 0;
  const trust = totalConfidence / signalKeys.length;
  return quality * trust;
};

const bucketHasAnyData = (signalKeys: readonly string[], userSignals: SignalVector, trackSignals: SignalVector): boolean =>
  signalKeys.some((signalKey) => userSignals[signalKey].confidence * trackSignals[signalKey].confidence > 0);

/**
 * Builds the full breakdown and the 0-100 aggregate score from it in
 * one pass — the breakdown is not a post-hoc explanation of a
 * differently-computed score, it IS the computation (M5 Rule 3).
 *
 * The aggregate is an equal-weight average across whichever of the 4
 * buckets had any data at all — same "don't punish missing data"
 * policy as inside a bucket, applied one level up (Rule 4). If none of
 * the 4 buckets had any data, the aggregate is 0 — a defined number,
 * never a guess.
 */
export const computeScore = (userSignals: SignalVector, trackSignals: SignalVector): { score: number; breakdown: ScoreBreakdown } => {
  const breakdown = {} as ScoreBreakdown;
  let bucketsWithData = 0;
  let bucketScoreSum = 0;

  for (const breakdownKey of SCORE_BREAKDOWN_KEYS) {
    const signalKeys = SIGNAL_GROUPS[breakdownKey];
    const value = bucketScore(signalKeys, userSignals, trackSignals);
    breakdown[breakdownKey] = value;
    if (bucketHasAnyData(signalKeys, userSignals, trackSignals)) {
      bucketsWithData += 1;
      bucketScoreSum += value;
    }
  }

  const score = bucketsWithData > 0 ? (bucketScoreSum / bucketsWithData) * 100 : 0;
  return { score, breakdown };
};

export const explainBreakdown = (breakdown: ScoreBreakdown): string[] => {
  const labels: Record<ScoreBreakdownKey, string> = {
    genreMatch: 'Genre-match med din smagsprofil',
    mainstreamMatch: 'Mainstream-niveau matcher din profil',
    explicitMatch: 'Explicit-indhold matcher din profil',
    durationMatch: 'Sanglængde matcher din profil',
  };
  return SCORE_BREAKDOWN_KEYS.filter((key) => breakdown[key] > 0).map(
    (key) => `${labels[key]} (${Math.round(breakdown[key] * 100)}%)`,
  );
};
