import { getTopArtists } from '../../modules/spotify';
import { getAllArtists, getAllPlaylists, getAllTracks } from '../../modules/storage';

/**
 * ============================================================
 * TEMPORARY — manual-evaluation diagnostic aid. REMOVE once the
 * library-artist-composition investigation is complete.
 *
 * Read-only: only reads already-synced local storage plus one
 * Spotify call. Writes nothing, persists nothing, and never
 * influences candidate generation, ranking, or what Discovery
 * returns — this exists purely to print a single summary row so
 * the current library-artist composition can be inspected by hand.
 * ============================================================
 *
 * Spotify's own per-call maximum, used here deliberately — this is
 * an analysis tool, not production seeding (which uses a much
 * smaller MAX_SEED_ARTISTS). The goal is the truest possible
 * overlap picture, not to mirror today's seed-selection limits.
 */
const TOP_ARTISTS_ANALYSIS_LIMIT = 50;

/** The same fields previously printed as one console.table row — now returned so the caller can render them instead (presentation-only change, the computation itself is unchanged). */
export interface LibraryCompositionSummary {
  totalLibraryArtists: number;
  followedPlaylistsOnly: number;
  ownPlaylists: number;
  ownedPlaylistsOnly: number;
  bothOwnedAndFollowed: number;
  overlapsTopArtists: number;
  topArtistsSampleSize: number;
  exactlyOneTrack: number;
  multipleTracks: number;
  noTracksFound: number;
}

/**
 * Answers, in one summary: how many library artists come only from
 * followed (not owned) playlists, how many come from the user's own
 * playlists (owned-only or both), how many overlap with Spotify Top
 * Artists, and how many are backed by exactly one track vs. more
 * than one. Never throws — a failure here must never affect
 * Discovery, the same posture as every other diagnostic-only block
 * in this codebase (M24, M31). Returns `null` on failure.
 */
export const analyzeLibraryArtistComposition = async (currentUserId: string): Promise<LibraryCompositionSummary | null> => {
  try {
    const [tracks, artists, playlists, topArtists] = await Promise.all([
      getAllTracks(),
      getAllArtists(),
      getAllPlaylists(),
      getTopArtists(TOP_ARTISTS_ANALYSIS_LIMIT),
    ]);

    const ownedPlaylistIds = new Set(playlists.filter((playlist) => playlist.ownerId === currentUserId).map((playlist) => playlist.id));
    const topArtistIds = new Set(topArtists.map((artist) => artist.id));

    const trackIdsByArtistId = new Map<string, Set<string>>();
    const playlistIdsByArtistId = new Map<string, Set<string>>();
    for (const track of tracks) {
      for (const trackArtist of track.artists) {
        if (!trackIdsByArtistId.has(trackArtist.id)) trackIdsByArtistId.set(trackArtist.id, new Set());
        trackIdsByArtistId.get(trackArtist.id)?.add(track.id);

        if (!playlistIdsByArtistId.has(trackArtist.id)) playlistIdsByArtistId.set(trackArtist.id, new Set());
        for (const playlistId of track.playlistIds) {
          playlistIdsByArtistId.get(trackArtist.id)?.add(playlistId);
        }
      }
    }

    let followedPlaylistsOnly = 0;
    let ownedPlaylistsOnly = 0;
    let bothOwnedAndFollowed = 0;
    let noTracksFound = 0;
    let exactlyOneTrack = 0;
    let multipleTracks = 0;
    let overlapsTopArtists = 0;

    for (const artist of artists) {
      const trackCount = trackIdsByArtistId.get(artist.id)?.size ?? 0;
      if (trackCount === 0) noTracksFound += 1;
      else if (trackCount === 1) exactlyOneTrack += 1;
      else multipleTracks += 1;

      const artistPlaylistIds = playlistIdsByArtistId.get(artist.id) ?? new Set<string>();
      let hasOwned = false;
      let hasFollowed = false;
      for (const playlistId of artistPlaylistIds) {
        if (ownedPlaylistIds.has(playlistId)) hasOwned = true;
        else hasFollowed = true;
      }
      if (hasOwned && hasFollowed) bothOwnedAndFollowed += 1;
      else if (hasOwned) ownedPlaylistsOnly += 1;
      else if (hasFollowed) followedPlaylistsOnly += 1;

      if (topArtistIds.has(artist.id)) overlapsTopArtists += 1;
    }

    return {
      totalLibraryArtists: artists.length,
      followedPlaylistsOnly,
      ownPlaylists: ownedPlaylistsOnly + bothOwnedAndFollowed,
      ownedPlaylistsOnly,
      bothOwnedAndFollowed,
      overlapsTopArtists,
      topArtistsSampleSize: topArtists.length,
      exactlyOneTrack,
      multipleTracks,
      noTracksFound,
    };
  } catch (error) {
    console.warn('[library-composition] Kunne ikke analysere biblioteket (påvirker ikke Discovery):', error);
    return null;
  }
};
