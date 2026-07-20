import { updateSpotifyDiagnostics } from '../diagnostics';
import { getCurrentUser, getTopArtists } from '../spotify';
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

// Isolated from the local-storage reads below on purpose: a failed/expired
// Spotify session must not wipe out perfectly good, already-synced library
// data (which ranking depends on) just because they were awaited together.
const buildSpotifySeed = async (): Promise<SpotifySeed> => {
  try {
    const [user, topArtists] = await Promise.all([getCurrentUser(), getTopArtists(5)]);
    const seedArtists = topArtists.slice(0, MAX_SEED_ARTISTS);
    const seedArtistNames = seedArtists.map((artist) => artist.name);
    updateSpotifyDiagnostics({ loginOk: true, topArtistsFound: topArtists.length, seedArtistNames, error: null });
    return {
      userId: user.id,
      seedArtistIds: seedArtists.map((artist) => artist.id),
      seedArtistNames,
      seedGenres: [...new Set(topArtists.flatMap((artist) => artist.genres))].slice(0, MAX_SEED_GENRES),
    };
  } catch (error) {
    console.warn('[recommendations] Kunne ikke hente Spotify top-kunstnere til seeds, fortsætter uden:', error);
    updateSpotifyDiagnostics({
      loginOk: false,
      topArtistsFound: null,
      seedArtistNames: [],
      error: error instanceof Error ? error.message : String(error),
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
