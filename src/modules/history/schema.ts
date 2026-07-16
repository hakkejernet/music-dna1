import type { DBSchema } from 'idb';
import type { RankedRecommendation } from '../ranking/types';

export interface SavedRecommendation {
  id: string;
  trackId: string;
  recommendation: RankedRecommendation;
  savedAt: number;
}

export interface HistoryDb extends DBSchema {
  saved: {
    key: string;
    value: SavedRecommendation;
  };
}
