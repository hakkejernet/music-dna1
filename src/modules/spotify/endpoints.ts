import { spotifyGet } from './client';
import type {
  SpotifyArtist,
  SpotifyArtistRef,
  SpotifyImage,
  SpotifyPlaylist,
  SpotifyTrack,
  SpotifyUser,
} from './types';

interface RawImage {
  url: string;
  width: number | null;
  height: number | null;
}

interface RawPage<T> {
  items: T[];
  next: string | null;
}

interface RawUser {
  id: string;
  display_name: string | null;
  email: string | null;
  images: RawImage[];
}

interface RawPlaylist {
  id: string;
  name: string;
  description: string | null;
  owner: { id: string; display_name: string | null };
  tracks: { total: number };
  images: RawImage[];
  snapshot_id: string;
}

interface RawArtistRef {
  id: string;
  name: string;
}

interface RawTrack {
  id: string | null;
  name: string;
  duration_ms: number;
  explicit: boolean;
  popularity: number;
  preview_url: string | null;
  external_ids?: { isrc?: string };
  album: {
    id: string;
    name: string;
    images: RawImage[];
    release_date: string | null;
    release_date_precision: 'year' | 'month' | 'day' | null;
  };
  artists: RawArtistRef[];
  type: string;
  is_local: boolean;
}

interface RawPlaylistItem {
  added_at: string | null;
  track: RawTrack | null;
}

interface RawArtist {
  id: string;
  name: string;
  genres: string[];
  popularity: number;
  followers: { total: number };
  images: RawImage[];
}

const mapImages = (images: RawImage[]): SpotifyImage[] =>
  images.map((image) => ({ url: image.url, width: image.width, height: image.height }));

const mapArtist = (artist: RawArtist): SpotifyArtist => ({
  id: artist.id,
  name: artist.name,
  genres: artist.genres,
  popularity: artist.popularity,
  followers: artist.followers.total,
  images: mapImages(artist.images),
});

const mapArtistRefs = (artists: RawArtistRef[]): SpotifyArtistRef[] =>
  artists.map((artist) => ({ id: artist.id, name: artist.name }));

const mapTrack = (
  track: RawTrack,
  extra: { addedAt: string | null; playlistIds: string[] },
): SpotifyTrack | null => {
  // Skip local files, removed tracks, and podcast episodes — discovery is about songs.
  if (!track.id || track.is_local || track.type !== 'track') return null;

  return {
    id: track.id,
    name: track.name,
    durationMs: track.duration_ms,
    explicit: track.explicit,
    popularity: track.popularity,
    isrc: track.external_ids?.isrc ?? null,
    previewUrl: track.preview_url,
    albumId: track.album.id,
    albumName: track.album.name,
    albumImages: mapImages(track.album.images),
    releaseDate: track.album.release_date,
    releaseDatePrecision: track.album.release_date_precision,
    artists: mapArtistRefs(track.artists),
    addedAt: extra.addedAt,
    playlistIds: extra.playlistIds,
  };
};

const fetchAllPages = async <T>(firstPath: string): Promise<T[]> => {
  const items: T[] = [];
  let next: string | null = firstPath;
  while (next) {
    const page: RawPage<T> = await spotifyGet<RawPage<T>>(next);
    items.push(...page.items);
    next = page.next;
  }
  return items;
};

export const getCurrentUser = async (): Promise<SpotifyUser> => {
  const raw = await spotifyGet<RawUser>('/me');
  return {
    id: raw.id,
    displayName: raw.display_name,
    email: raw.email,
    images: mapImages(raw.images),
  };
};

export const getUserPlaylists = async (): Promise<SpotifyPlaylist[]> => {
  const raw = await fetchAllPages<RawPlaylist>('/me/playlists?limit=50');
  return raw.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    ownerId: playlist.owner.id,
    ownerName: playlist.owner.display_name ?? playlist.owner.id,
    trackCount: playlist.tracks.total,
    images: mapImages(playlist.images),
    snapshotId: playlist.snapshot_id,
  }));
};

const PLAYLIST_TRACK_FIELDS =
  'items(added_at,track(id,name,duration_ms,explicit,popularity,preview_url,external_ids,album(id,name,images,release_date,release_date_precision),artists(id,name),type,is_local)),next';

export const getPlaylistTracks = async (playlistId: string): Promise<SpotifyTrack[]> => {
  const path = `/playlists/${playlistId}/tracks?limit=100&fields=${encodeURIComponent(PLAYLIST_TRACK_FIELDS)}`;
  const raw = await fetchAllPages<RawPlaylistItem>(path);

  const tracks: SpotifyTrack[] = [];
  for (const item of raw) {
    if (!item.track) continue;
    const track = mapTrack(item.track, { addedAt: item.added_at, playlistIds: [playlistId] });
    if (track) tracks.push(track);
  }
  return tracks;
};

const ARTIST_BATCH_SIZE = 50;

export const getArtistsByIds = async (ids: string[]): Promise<SpotifyArtist[]> => {
  const uniqueIds = [...new Set(ids)];
  const artists: SpotifyArtist[] = [];

  for (let i = 0; i < uniqueIds.length; i += ARTIST_BATCH_SIZE) {
    const batch = uniqueIds.slice(i, i + ARTIST_BATCH_SIZE);
    const raw = await spotifyGet<{ artists: RawArtist[] }>(`/artists?ids=${batch.join(',')}`);
    artists.push(...raw.artists.filter(Boolean).map(mapArtist));
  }

  return artists;
};

export const getTopArtists = async (limit = 5): Promise<SpotifyArtist[]> => {
  const raw = await spotifyGet<{ items: RawArtist[] }>(`/me/top/artists?limit=${limit}`);
  return raw.items.map(mapArtist);
};

export interface RecommendationSeeds {
  seedArtistIds: string[];
  seedGenres: string[];
  seedTrackIds: string[];
  limit?: number;
}

// Spotify restricted /recommendations to apps with pre-approved "extended
// quota mode" in Nov 2024 — new apps (like this one) typically get a 403/404
// here. Callers are expected to handle that (see SpotifyRecommendationProvider).
export const getRecommendedTracks = async (seeds: RecommendationSeeds): Promise<SpotifyTrack[]> => {
  const params = new URLSearchParams();
  let budget = 5; // Spotify allows at most 5 seeds total, across all three kinds.

  const take = (key: string, values: string[]) => {
    if (budget <= 0 || values.length === 0) return;
    const slice = values.slice(0, budget);
    params.set(key, slice.join(','));
    budget -= slice.length;
  };

  take('seed_artists', seeds.seedArtistIds);
  take('seed_genres', seeds.seedGenres);
  take('seed_tracks', seeds.seedTrackIds);
  params.set('limit', String(seeds.limit ?? 20));

  const raw = await spotifyGet<{ tracks: RawTrack[] }>(`/recommendations?${params.toString()}`);
  const tracks: SpotifyTrack[] = [];
  for (const rawTrack of raw.tracks) {
    const track = mapTrack(rawTrack, { addedAt: null, playlistIds: [] });
    if (track) tracks.push(track);
  }
  return tracks;
};

/** Searches Spotify's track catalog by title + artist. Used by modules/spotifyLink to resolve a real Spotify track ID for a Recommendation that didn't come from Spotify. */
export const searchTracks = async (title: string, artist: string, limit = 5): Promise<SpotifyTrack[]> => {
  const q = `track:${title} artist:${artist}`;
  const params = new URLSearchParams({ q, type: 'track', limit: String(limit) });
  const raw = await spotifyGet<{ tracks: { items: RawTrack[] } }>(`/search?${params.toString()}`);
  const tracks: SpotifyTrack[] = [];
  for (const rawTrack of raw.tracks.items) {
    const track = mapTrack(rawTrack, { addedAt: null, playlistIds: [] });
    if (track) tracks.push(track);
  }
  return tracks;
};
