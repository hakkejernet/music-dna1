import { isDebugModeEnabled } from '../../lib/debugMode';
import { updateSpotifyDiagnostics, type TopArtistsDebug } from '../diagnostics';
import { getCurrentUser, getTopArtists, getValidAccessToken } from '../spotify';
import { getAllArtists, getAllTracks } from '../storage';
import type { UserProfile } from './types';

const MAX_SEED_ARTISTS = 3;
const MAX_SEED_GENRES = 2;

interface SpotifySeed {
  userId: string;
  seedArtistIds: string[];
  seedArtistNames: string[];
  seedGenres: string[];
}

// Mirrors exactly what buildSpotifySeed()'s real getTopArtists(5) call sends
// (same path, same limit) — a second, debug-only request so the panel shows
// actual Spotify data rather than an error message derived from it. Only
// ever made when ?debug=1 is active; never affects the real seed-building
// flow below.
const TOP_ARTISTS_DEBUG_URL = 'https://api.spotify.com/v1/me/top/artists?limit=5';

const runTopArtistsDebugFetch = async (): Promise<TopArtistsDebug> => {
  const debug: TopArtistsDebug = {
    httpStatus: null,
    itemCount: null,
    firstArtist: null,
    parseError: null,
    emptySeedReason: null,
  };

  const token = await getValidAccessToken();
  if (!token) {
    debug.emptySeedReason = 'getValidAccessToken() returnerede null — ikke logget ind, eller token kunne ikke refreshes.';
    return debug;
  }

  let response: Response;
  try {
    response = await fetch(TOP_ARTISTS_DEBUG_URL, { headers: { Authorization: `Bearer ${token}` } });
  } catch (error) {
    debug.parseError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
      location: 'src/modules/recommendations/userProfile.ts — runTopArtistsDebugFetch(), fetch() call',
    };
    debug.emptySeedReason = 'fetch() til /me/top/artists kastede en exception (se parseError).';
    return debug;
  }

  debug.httpStatus = response.status;

  if (!response.ok) {
    debug.emptySeedReason = `Spotify svarede HTTP ${response.status} på /me/top/artists.`;
    return debug;
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    debug.parseError = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
      location: 'src/modules/recommendations/userProfile.ts — runTopArtistsDebugFetch(), response.json()',
    };
    debug.emptySeedReason = 'Svaret fra /me/top/artists kunne ikke parses som JSON (se parseError).';
    return debug;
  }

  const items = Array.isArray((raw as { items?: unknown[] })?.items) ? (raw as { items: unknown[] }).items : [];
  debug.itemCount = items.length;

  const first = items[0];
  if (first && typeof first === 'object') {
    const record = first as Record<string, unknown>;
    debug.firstArtist = {
      name: typeof record.name === 'string' ? record.name : null,
      id: typeof record.id === 'string' ? record.id : null,
      fields: Object.keys(record),
    };
  }

  if (items.length === 0) {
    debug.emptySeedReason = 'Spotify returnerede 0 items i /me/top/artists — ingen seeds at udlede.';
  }

  return debug;
};

// Isolated from the local-storage reads below on purpose: a failed/expired
// Spotify session must not wipe out perfectly good, already-synced library
// data (which ranking depends on) just because they were awaited together.
const buildSpotifySeed = async (): Promise<SpotifySeed> => {
  const topArtistsDebug = isDebugModeEnabled() ? await runTopArtistsDebugFetch() : null;

  try {
    const [user, topArtists] = await Promise.all([getCurrentUser(), getTopArtists(5)]);
    const seedArtists = topArtists.slice(0, MAX_SEED_ARTISTS);
    const seedArtistNames = seedArtists.map((artist) => artist.name);
    updateSpotifyDiagnostics({ loginOk: true, topArtistsFound: topArtists.length, seedArtistNames, error: null, topArtistsDebug });
    return {
      userId: user.id,
      seedArtistIds: seedArtists.map((artist) => artist.id),
      seedArtistNames,
      seedGenres: [...new Set(topArtists.flatMap((artist) => artist.genres))].slice(0, MAX_SEED_GENRES),
    };
  } catch (error) {
    console.warn('[recommendations] Kunne ikke hente Spotify top-kunstnere til seeds, fortsætter uden:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    updateSpotifyDiagnostics({
      loginOk: false,
      topArtistsFound: null,
      seedArtistNames: [],
      error: errorMessage,
      topArtistsDebug: topArtistsDebug && { ...topArtistsDebug, emptySeedReason: topArtistsDebug.emptySeedReason ?? errorMessage },
    });
    return { userId: '', seedArtistIds: [], seedArtistNames: [], seedGenres: [] };
  }
};

/**
 * Builds a taste signal for both provider seeding and ranking. Seeds come
 * from Spotify's top artists (not audio-features, which is restricted);
 * the library IDs are read from the local IndexedDB sync (modules/storage)
 * — no extra API calls, just whatever's already been synced.
 */
export const buildUserProfile = async (): Promise<UserProfile> => {
  const [spotifySeed, libraryArtists, libraryTracks] = await Promise.all([
    buildSpotifySeed(),
    getAllArtists(),
    getAllTracks(),
  ]);

  return {
    userId: spotifySeed.userId,
    seedArtistIds: spotifySeed.seedArtistIds,
    seedArtistNames: spotifySeed.seedArtistNames,
    seedTrackIds: [],
    seedGenres: spotifySeed.seedGenres,
    libraryArtistIds: libraryArtists.map((artist) => artist.id),
    libraryTrackIds: libraryTracks.map((track) => track.id),
  };
};
