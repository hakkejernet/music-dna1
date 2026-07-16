import { openDB, type IDBPDatabase } from 'idb';
import type { HistoryDb } from './schema';

const DB_NAME = 'music-dna-history';
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase<HistoryDb>> | null = null;

export const getHistoryDb = (): Promise<IDBPDatabase<HistoryDb>> => {
  if (!dbPromise) {
    dbPromise = openDB<HistoryDb>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('saved', { keyPath: 'id' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('rejected', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
};
