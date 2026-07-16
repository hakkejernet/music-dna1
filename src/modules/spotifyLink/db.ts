import { openDB, type IDBPDatabase } from 'idb';
import type { SpotifyLinkCacheDb } from './schema';

const DB_NAME = 'music-dna-spotify-link-cache';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SpotifyLinkCacheDb>> | null = null;

export const getSpotifyLinkCacheDb = (): Promise<IDBPDatabase<SpotifyLinkCacheDb>> => {
  if (!dbPromise) {
    dbPromise = openDB<SpotifyLinkCacheDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('links', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
};
