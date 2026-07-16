import type { RankedRecommendation } from '../ranking/types';
import { getHistoryDb } from './db';
import type { SavedRecommendation } from './schema';

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
