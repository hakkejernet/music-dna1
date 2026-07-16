import type { SpotifyTrack } from '../spotify/types';

export interface Recommendation {
  id: string;
  track: SpotifyTrack;
  source: string;
  score: number;
  reasons: string[];
  /** Provider-supplied genres for this track, if known. Empty when the source can't tell us. */
  genres: string[];
  /** Real Spotify track ID, if the provider gave us one or modules/spotifyLink resolved+cached one. Null until resolved. */
  spotifyTrackId: string | null;
}

/** Taste signal handed to a RecommendationProvider — not the full Spotify user object. */
export interface UserProfile {
  userId: string;
  seedArtistIds: string[];
  /** Same artists as seedArtistIds, by name — providers keyed by artist name (e.g. Last.fm) need this. */
  seedArtistNames: string[];
  seedTrackIds: string[];
  seedGenres: string[];
  /** Artist/track IDs already in the user's synced library — signal for ranking, not for display. */
  libraryArtistIds: string[];
  libraryTrackIds: string[];
}

export interface RecommendationProvider {
  getRecommendations(user: UserProfile): Promise<Recommendation[]>;
}
