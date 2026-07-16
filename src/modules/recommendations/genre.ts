import type { Recommendation } from './types';

/** Provider-agnostic: just reads whatever genre the source attached to the recommendation. */
export const getPrimaryGenre = (recommendation: Recommendation): string | null =>
  recommendation.genres[0] ?? null;
