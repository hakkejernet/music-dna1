import type { RankedRecommendation } from '../ranking/types';
import { getHistoryDb } from './db';
import type { RejectedRecommendation, SavedRecommendation } from './schema';

/** Persists a saved recommendation locally so the same song is excluded from future queues. */
export const saveRecommendation = async (recommendation: RankedRecommendation): Promise<void> => {
  const db = await getHistoryDb();
  await db.put('saved', {
    id: recommendation.id,
    trackId: recommendation.track.id,
    recommendation,
    savedAt: Date.now(),
  });
};

/** Persists a rejected recommendation locally — feeds modules/preferences, doesn't affect the current queue. */
export const rejectRecommendation = async (
  recommendation: RankedRecommendation,
  reason: string | null = null,
): Promise<void> => {
  const db = await getHistoryDb();
  await db.put('rejected', {
    id: recommendation.id,
    trackId: recommendation.track.id,
    recommendation,
    rejectedAt: Date.now(),
    reason,
  });
};

export const getSavedTrackIds = async (): Promise<Set<string>> => {
  const db = await getHistoryDb();
  const all = await db.getAll('saved');
  return new Set(all.map((record) => record.trackId));
};

export const getSavedCount = async (): Promise<number> => {
  const db = await getHistoryDb();
  return db.count('saved');
};

export const getAllSaved = async (): Promise<SavedRecommendation[]> => {
  const db = await getHistoryDb();
  const all = await db.getAll('saved');
  return all.sort((a, b) => b.savedAt - a.savedAt);
};

export const getAllRejected = async (): Promise<RejectedRecommendation[]> => {
  const db = await getHistoryDb();
  const all = await db.getAll('rejected');
  return all.sort((a, b) => b.rejectedAt - a.rejectedAt);
};
