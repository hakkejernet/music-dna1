import type { Observation, RecommendationAccepted, RecommendationKnown, RecommendationRejected, RecommendationShown } from './types';

/**
 * Every function in this file is pure (M13 Rule 8): a plain function of
 * the `observations` array it's given, nothing else — no sink, no
 * clock, no shared state. The same array, in the same order or a
 * different one, always produces the same result, because none of them
 * depend on anything but which observations exist.
 */

const isRecommendationShown = (observation: Observation): observation is RecommendationShown => observation.type === 'RecommendationShown';
const isRecommendationAccepted = (observation: Observation): observation is RecommendationAccepted => observation.type === 'RecommendationAccepted';
const isRecommendationRejected = (observation: Observation): observation is RecommendationRejected => observation.type === 'RecommendationRejected';
const isRecommendationKnown = (observation: Observation): observation is RecommendationKnown => observation.type === 'RecommendationKnown';

/** 0 when nothing was ever shown — a rate over zero observations is undefined, and reporting 0 rather than NaN is the "never guess" convention this project has followed since M1's validateSignalVector. */
const safeRate = (numerator: number, denominator: number): number => (denominator > 0 ? numerator / denominator : 0);

export const calculateAcceptanceRate = (observations: readonly Observation[]): number =>
  safeRate(observations.filter(isRecommendationAccepted).length, observations.filter(isRecommendationShown).length);

export const calculateRejectRate = (observations: readonly Observation[]): number =>
  safeRate(observations.filter(isRecommendationRejected).length, observations.filter(isRecommendationShown).length);

export const calculateKnownRate = (observations: readonly Observation[]): number =>
  safeRate(observations.filter(isRecommendationKnown).length, observations.filter(isRecommendationShown).length);

/**
 * What fraction of distinct shown candidates ever received *any*
 * reaction (accepted, rejected, or known) — matched by `candidateRef`.
 * A candidate shown more than once still counts once; a reaction with
 * no matching "shown" observation is simply not counted (it can't
 * contribute to coverage of something that was never recorded as shown).
 */
export const calculateCoverage = (observations: readonly Observation[]): number => {
  const shownCandidateRefs = new Set(observations.filter(isRecommendationShown).map((observation) => observation.candidateRef));
  if (shownCandidateRefs.size === 0) return 0;

  const reactedCandidateRefs = new Set(
    observations
      .filter((observation): observation is RecommendationAccepted | RecommendationRejected | RecommendationKnown =>
        isRecommendationAccepted(observation) || isRecommendationRejected(observation) || isRecommendationKnown(observation),
      )
      .map((observation) => observation.candidateRef),
  );

  const coveredCount = [...shownCandidateRefs].filter((candidateRef) => reactedCandidateRefs.has(candidateRef)).length;
  return coveredCount / shownCandidateRefs.size;
};

/** For every provider name that appears in at least one shown observation, the fraction of shown observations that included it. */
export const calculateProviderContribution = (observations: readonly Observation[]): Record<string, number> => {
  const shown = observations.filter(isRecommendationShown);
  if (shown.length === 0) return {};

  const countByProvider = new Map<string, number>();
  for (const observation of shown) {
    for (const providerName of observation.providerNames) {
      countByProvider.set(providerName, (countByProvider.get(providerName) ?? 0) + 1);
    }
  }

  const contribution: Record<string, number> = {};
  for (const [providerName, count] of countByProvider) {
    contribution[providerName] = count / shown.length;
  }
  return contribution;
};

export interface CalibrationBucket {
  readonly bucketLabel: string;
  readonly shownCount: number;
  readonly acceptedCount: number;
  readonly predictedAcceptanceRate: number;
  readonly observedAcceptanceRate: number;
}

export interface CalibrationResult {
  readonly buckets: readonly CalibrationBucket[];
  readonly overallScore: number;
}

const BUCKET_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0, 20],
  [20, 40],
  [40, 60],
  [60, 80],
  [80, 100],
];

/**
 * A well-calibrated score should predict its own acceptance rate: a
 * candidate scored 70-80 should get accepted roughly 70-80% of the
 * time, if the score genuinely means what it claims. This buckets shown
 * candidates by their score (TDS §8's own bucket concept), compares
 * each bucket's midpoint (as a 0-1 "predicted rate") against the
 * bucket's actual observed acceptance rate, and reports `1 -
 * meanAbsoluteError` as a single overall score in [0, 1] — 1 is
 * perfectly calibrated, 0 is maximally miscalibrated. Buckets with no
 * shown candidates are reported (for inspectability) but excluded from
 * the overall score's average, for the same "don't let missing data
 * count as bad" reasoning M5's ranking formula already uses.
 */
export const calculateCalibrationScore = (observations: readonly Observation[]): CalibrationResult => {
  const shown = observations.filter(isRecommendationShown);
  const acceptedCandidateRefs = new Set(observations.filter(isRecommendationAccepted).map((observation) => observation.candidateRef));

  const buckets: CalibrationBucket[] = BUCKET_RANGES.map(([rangeStart, rangeEnd]) => {
    const inBucket = shown.filter((observation) => observation.score >= rangeStart && observation.score <= rangeEnd);
    const acceptedInBucket = inBucket.filter((observation) => acceptedCandidateRefs.has(observation.candidateRef));
    return {
      bucketLabel: `${rangeStart}-${rangeEnd}`,
      shownCount: inBucket.length,
      acceptedCount: acceptedInBucket.length,
      predictedAcceptanceRate: (rangeStart + rangeEnd) / 2 / 100,
      observedAcceptanceRate: safeRate(acceptedInBucket.length, inBucket.length),
    };
  });

  const bucketsWithData = buckets.filter((bucket) => bucket.shownCount > 0);
  const overallScore =
    bucketsWithData.length > 0
      ? 1 - bucketsWithData.reduce((sum, bucket) => sum + Math.abs(bucket.predictedAcceptanceRate - bucket.observedAcceptanceRate), 0) / bucketsWithData.length
      : 0;

  return { buckets, overallScore };
};
