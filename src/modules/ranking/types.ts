import type { Recommendation, UserProfile } from '../recommendations/types';

export interface RankingInput {
  recommendations: Recommendation[];
  profile: UserProfile;
}

export interface RankedRecommendation extends Recommendation {
  finalScore: number;
  explanations: string[];
}

export interface RecommendationRanker {
  rank(input: RankingInput): RankedRecommendation[];
}
