import type { SpotifyTrack } from '../spotify/types';

export interface Recommendation {
  id: string;
  track: SpotifyTrack;
  source: string;
  score: number;
  reasons: string[];
}
