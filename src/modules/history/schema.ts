import type { DBSchema } from 'idb';
import type { RankedRecommendation } from '../ranking/types';

export interface SavedRecommendation {
  id: string;
  trackId: string;
  recommendation: RankedRecommendation;
  savedAt: number;
}

export interface RejectedRecommendation {
  id: string;
  trackId: string;
  recommendation: RankedRecommendation;
  rejectedAt: number;
}

export interface HistoryDb extends DBSchema {
  saved: {
    key: string;
    value: SavedRecommendation;
  };
  rejected: {
    key: string;
    value: RejectedRecommendation;
  };
}
