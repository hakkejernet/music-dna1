import { describe, expect, it } from 'vitest';
import {
  calculateAcceptanceRate,
  calculateCalibrationScore,
  calculateCoverage,
  calculateKnownRate,
  calculateProviderContribution,
  calculateRejectRate,
} from './metrics';
import type { Observation } from './types';

const NOW = '2026-01-01T00:00:00.000Z';

const shown = (candidateRef: string, score: number, providerNames: readonly string[] = []): Observation => ({
  type: 'RecommendationShown',
  candidateRef,
  trackDnaRef: `track-${candidateRef}`,
  score,
  providerNames,
  observedAt: NOW,
});
const accepted = (candidateRef: string): Observation => ({ type: 'RecommendationAccepted', candidateRef, trackDnaRef: `track-${candidateRef}`, observedAt: NOW });
const rejected = (candidateRef: string): Observation => ({ type: 'RecommendationRejected', candidateRef, trackDnaRef: `track-${candidateRef}`, observedAt: NOW });
const known = (candidateRef: string): Observation => ({ type: 'RecommendationKnown', candidateRef, trackDnaRef: `track-${candidateRef}`, observedAt: NOW });

describe('calculateAcceptanceRate / calculateRejectRate / calculateKnownRate (M13 Rule 8)', () => {
  const observations: Observation[] = [
    shown('c1', 90),
    shown('c2', 20),
    shown('c3', 50),
    shown('c4', 60),
    accepted('c1'),
    rejected('c2'),
    known('c3'),
    // c4 never reacted to.
  ];

  it('acceptance rate is accepted / shown', () => {
    expect(calculateAcceptanceRate(observations)).toBeCloseTo(1 / 4, 10);
  });

  it('reject rate is rejected / shown', () => {
    expect(calculateRejectRate(observations)).toBeCloseTo(1 / 4, 10);
  });

  it('known rate is known / shown', () => {
    expect(calculateKnownRate(observations)).toBeCloseTo(1 / 4, 10);
  });

  it('all three rates are 0 — never NaN — when nothing was ever shown', () => {
    expect(calculateAcceptanceRate([])).toBe(0);
    expect(calculateRejectRate([])).toBe(0);
    expect(calculateKnownRate([])).toBe(0);
  });

  it('is deterministic: repeated calls on the same array give the same result', () => {
    const first = calculateAcceptanceRate(observations);
    const second = calculateAcceptanceRate(observations);
    expect(first).toBe(second);
  });
});

describe('calculateCoverage (M13 Rule 8)', () => {
  it('is the fraction of distinct shown candidates that received any reaction', () => {
    const observations: Observation[] = [shown('c1', 90), shown('c2', 20), shown('c3', 50), accepted('c1'), rejected('c2')];
    // c1 and c2 covered, c3 not — 2 of 3.
    expect(calculateCoverage(observations)).toBeCloseTo(2 / 3, 10);
  });

  it('counts a candidate shown multiple times only once', () => {
    const observations: Observation[] = [shown('c1', 90), shown('c1', 90), accepted('c1')];
    expect(calculateCoverage(observations)).toBe(1);
  });

  it('is 0 when nothing was ever shown', () => {
    expect(calculateCoverage([])).toBe(0);
  });

  it('ignores a reaction with no matching shown observation', () => {
    const observations: Observation[] = [shown('c1', 90), accepted('c1'), accepted('never-shown')];
    expect(calculateCoverage(observations)).toBe(1);
  });
});

describe('calculateProviderContribution (M13 Rule 8)', () => {
  it('reports, per provider, the fraction of shown recommendations it contributed to', () => {
    const observations: Observation[] = [
      shown('c1', 90, ['lastfm']),
      shown('c2', 50, ['lastfm', 'listenbrainz']),
      shown('c3', 30, ['listenbrainz']),
      shown('c4', 10, []),
    ];

    expect(calculateProviderContribution(observations)).toEqual({ lastfm: 2 / 4, listenbrainz: 2 / 4 });
  });

  it('is an empty object when nothing was ever shown', () => {
    expect(calculateProviderContribution([])).toEqual({});
  });

  it('is deterministic regardless of observation order', () => {
    const forward: Observation[] = [shown('c1', 90, ['a']), shown('c2', 50, ['b'])];
    const backward: Observation[] = [shown('c2', 50, ['b']), shown('c1', 90, ['a'])];
    expect(calculateProviderContribution(forward)).toEqual(calculateProviderContribution(backward));
  });
});

describe('calculateCalibrationScore (M13 Rule 8)', () => {
  it('reports 5 buckets covering the full 0-100 score range', () => {
    const result = calculateCalibrationScore([]);
    expect(result.buckets.map((bucket) => bucket.bucketLabel)).toEqual(['0-20', '20-40', '40-60', '60-80', '80-100']);
  });

  it('gives a perfect overall score when observed acceptance exactly matches each bucket\'s predicted rate', () => {
    // Bucket 80-100 (midpoint 0.9): 10 shown, 9 accepted → observed 0.9, matches predicted exactly.
    const observations: Observation[] = [
      ...Array.from({ length: 10 }, (_, i) => shown(`c${i}`, 90)),
      ...Array.from({ length: 9 }, (_, i) => accepted(`c${i}`)),
    ];

    const result = calculateCalibrationScore(observations);
    const topBucket = result.buckets.find((bucket) => bucket.bucketLabel === '80-100');
    expect(topBucket?.observedAcceptanceRate).toBeCloseTo(0.9, 10);
    expect(result.overallScore).toBeCloseTo(1, 10);
  });

  it('gives a low overall score when observed acceptance is far from predicted', () => {
    // Bucket 80-100 (predicted 0.9): shown 10, accepted 0 → observed 0, |0.9 - 0| = 0.9 error.
    const observations: Observation[] = Array.from({ length: 10 }, (_, i) => shown(`c${i}`, 90));

    const result = calculateCalibrationScore(observations);
    expect(result.overallScore).toBeCloseTo(0.1, 10);
  });

  it('is 0 — never a guess — when nothing was ever shown', () => {
    expect(calculateCalibrationScore([]).overallScore).toBe(0);
  });

  it('excludes empty buckets from the overall score rather than penalizing missing data', () => {
    // Only one bucket has any data — the overall score must depend only on that bucket, not be diluted by 4 empty ones.
    const observations: Observation[] = [shown('c1', 90), accepted('c1')];
    const result = calculateCalibrationScore(observations);
    expect(result.overallScore).toBeCloseTo(1 - Math.abs(0.9 - 1), 10);
  });

  it('is deterministic: repeated calls on the same array give the same result', () => {
    const observations: Observation[] = [shown('c1', 90), accepted('c1'), shown('c2', 20), rejected('c2')];
    expect(calculateCalibrationScore(observations)).toEqual(calculateCalibrationScore(observations));
  });
});
