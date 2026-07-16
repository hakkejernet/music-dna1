import { getDb } from './db';
import type { SpotifyArtist, SpotifyPlaylist, SpotifyTrack } from '../spotify/types';

export const upsertPlaylists = async (playlists: SpotifyPlaylist[]): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction('playlists', 'readwrite');
  await Promise.all([...playlists.map((playlist) => tx.store.put(playlist)), tx.done]);
};

export const upsertTracks = async (tracks: SpotifyTrack[]): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction('tracks', 'readwrite');
  await Promise.all([
    ...tracks.map(async (track) => {
      const existing = await tx.store.get(track.id);
      const playlistIds = existing
        ? [...new Set([...existing.playlistIds, ...track.playlistIds])]
        : track.playlistIds;
      await tx.store.put({ ...track, playlistIds });
    }),
    tx.done,
  ]);
};

export const upsertArtists = async (artists: SpotifyArtist[]): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction('artists', 'readwrite');
  await Promise.all([...artists.map((artist) => tx.store.put(artist)), tx.done]);
};

export const getAllTracks = async (): Promise<SpotifyTrack[]> => {
  const db = await getDb();
  return db.getAll('tracks');
};

export const getAllArtists = async (): Promise<SpotifyArtist[]> => {
  const db = await getDb();
  return db.getAll('artists');
};

export const getAllPlaylists = async (): Promise<SpotifyPlaylist[]> => {
  const db = await getDb();
  return db.getAll('playlists');
};

export const getMeta = async (key: string): Promise<string | number | undefined> => {
  const db = await getDb();
  const record = await db.get('meta', key);
  return record?.value;
};

export const setMeta = async (key: string, value: string | number): Promise<void> => {
  const db = await getDb();
  await db.put('meta', { key, value });
};

export const clearLibrary = async (): Promise<void> => {
  const db = await getDb();
  const tx = db.transaction(['tracks', 'artists', 'playlists', 'meta'], 'readwrite');
  await Promise.all([
    tx.objectStore('tracks').clear(),
    tx.objectStore('artists').clear(),
    tx.objectStore('playlists').clear(),
    tx.objectStore('meta').clear(),
    tx.done,
  ]);
};
