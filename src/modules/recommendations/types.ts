import type { SpotifyTrack } from '../spotify/types';

export interface Recommendation {
  id: string;
  track: SpotifyTrack;
  source: string;
  score: number;
  reasons: string[];
}

/** Taste signal handed to a RecommendationProvider — not the full Spotify user object. */
export interface UserProfile {
  userId: string;
  seedArtistIds: string[];
  seedTrackIds: string[];
  seedGenres: string[];
}

export interface RecommendationProvider {
  getRecommendations(user: UserProfile): Promise<Recommendation[]>;
}
