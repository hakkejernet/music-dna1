import { getCurrentUser, getTopArtists } from '../spotify';
import type { UserProfile } from './types';

const MAX_SEED_ARTISTS = 3;
const MAX_SEED_GENRES = 2;

/** Builds a minimal taste signal from the user's Spotify top artists (not audio-features, which is restricted). */
export const buildUserProfile = async (): Promise<UserProfile> => {
  const [user, topArtists] = await Promise.all([getCurrentUser(), getTopArtists(5)]);

  return {
    userId: user.id,
    seedArtistIds: topArtists.slice(0, MAX_SEED_ARTISTS).map((artist) => artist.id),
    seedTrackIds: [],
    seedGenres: [...new Set(topArtists.flatMap((artist) => artist.genres))].slice(0, MAX_SEED_GENRES),
  };
};
