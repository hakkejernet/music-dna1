import { openDB, type IDBPDatabase } from 'idb';
import type { MusicDnaDb } from './schema';

const DB_NAME = 'music-dna';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MusicDnaDb>> | null = null;

export const getDb = (): Promise<IDBPDatabase<MusicDnaDb>> => {
  if (!dbPromise) {
    dbPromise = openDB<MusicDnaDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const tracks = db.createObjectStore('tracks', { keyPath: 'id' });
        tracks.createIndex('by-album', 'albumId');
        db.createObjectStore('artists', { keyPath: 'id' });
        db.createObjectStore('playlists', { keyPath: 'id' });
        db.createObjectStore('meta', { keyPath: 'key' });
      },
    });
  }
  return dbPromise;
};
