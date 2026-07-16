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
  /** Reason picked in the reject panel, if any — null for a plain/timed-out rejection. */
  reason: string | null;
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
