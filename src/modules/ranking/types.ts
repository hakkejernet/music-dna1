import type { PreferenceProfile } from '../preferences/types';
import type { Recommendation, UserProfile } from '../recommendations/types';

export interface RankingInput {
  recommendations: Recommendation[];
  profile: UserProfile;
  /** Optional: a fresh user with no save/reject history simply won't have preference-based rules applied. */
  preferences?: PreferenceProfile;
}

export interface RankedRecommendation extends Recommendation {
  finalScore: number;
  explanations: string[];
}

export interface RecommendationRanker {
  rank(input: RankingInput): RankedRecommendation[];
}
