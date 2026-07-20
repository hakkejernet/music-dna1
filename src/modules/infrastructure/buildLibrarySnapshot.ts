import { getTopArtists } from '../spotify';
import { getAllTracks } from '../storage';
import type { LibrarySnapshot } from '../userDna';

/**
 * Translates two already-real, already-existing data sources —
 * `modules/spotify`'s live top-artists call and `modules/storage`'s
 * locally-synced tracks — into the shape `buildColdStartUserDna` (M2)
 * needs. M2 deliberately left this mapping unbuilt ("out of scope for
 * this milestone" per librarySnapshot.ts's own comment); this is that
 * translation, and nothing else (infrastructure translates technical
 * realities into what the domain needs, same role as ADR-29's error
 * translation).
 *
 * Either half degrading to `null` (no top artists, or no synced tracks)
 * is a normal, expected outcome, not a failure — `buildColdStartUserDna`
 * already treats a missing half independently (Cold Start Design
 * Principle 4): a user with a synced library but no Spotify top-artists
 * data (or vice versa) still gets whatever signals the other half can
 * honestly support.
 */
export const buildLibrarySnapshot = async (): Promise<LibrarySnapshot> => {
  const [topArtists, savedTracks] = await Promise.all([
    getTopArtists(10).catch(() => []),
    getAllTracks().catch(() => []),
  ]);

  return {
    topArtists: topArtists.length > 0 ? topArtists.map((artist) => ({ genres: artist.genres, popularity: artist.popularity })) : null,
    savedTracks: savedTracks.length > 0 ? savedTracks.map((track) => ({ explicit: track.explicit, durationMs: track.durationMs })) : null,
  };
};
