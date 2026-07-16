import { openDB, type IDBPDatabase } from 'idb';
import type { HistoryDb } from './schema';

const DB_NAME = 'music-dna-history';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null;

export const getHistoryDb = (): Promise<IDBPDatabase<HistoryDb>> => {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('saved', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
};
