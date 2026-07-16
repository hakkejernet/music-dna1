import { getSpotifyLinkCacheDb } from './db';
import { normalizeCacheKey } from './matching';

/** Never throws — a cache miss (including a broken/unavailable IndexedDB) just means "resolve it fresh". */
export const getCachedSpotifyTrackId = async (title: string, artist: string): Promise<string | null> => {
  try {
    const db = await getSpotifyLinkCacheDb();
    const entry = await db.get('links', normalizeCacheKey(title, artist));
    return entry?.spotifyTrackId ?? null;
  } catch (error) {
    console.warn('[spotifyLink] Kunne ikke læse fra link-cachen:', error);
    return null;
  }
};

export const setCachedSpotifyTrackId = async (title: string, artist: string, spotifyTrackId: string): Promise<void> => {
  try {
    const db = await getSpotifyLinkCacheDb();
    await db.put('links', { key: normalizeCacheKey(title, artist), spotifyTrackId, cachedAt: Date.now() });
  } catch (error) {
    console.warn('[spotifyLink] Kunne ikke skrive til link-cachen:', error);
  }
};
