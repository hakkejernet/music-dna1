import type { DBSchema } from 'idb';

export interface SpotifyLinkCacheEntry {
  /** Normalized "title::artist" — see matching.ts normalizeCacheKey(). */
  key: string;
  spotifyTrackId: string;
  cachedAt: number;
}

export interface SpotifyLinkCacheDb extends DBSchema {
  links: {
    key: string;
    value: SpotifyLinkCacheEntry;
  };
}
