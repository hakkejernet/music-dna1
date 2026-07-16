import { shuffle } from '../../lib/shuffle';
import type { SpotifyTrack } from '../spotify/types';
import type { Recommendation, RecommendationProvider, UserProfile } from './types';

// Mock candidates standing in for a future Last.fm-backed source. This
// provider has zero runtime dependency on modules/spotify — it never
// imports Spotify's client/auth/endpoints, and getRecommendations below
// doesn't touch the given UserProfile at all. The `SpotifyTrack` type is
// just the shared track shape every provider's Recommendation.track uses,
// not a sign of coupling to the Spotify API.
const mkTrack = (
  id: string,
  name: string,
  artistName: string,
  albumName: string,
  releaseDate: string,
  durationMs: number,
  popularity: number,
): SpotifyTrack => ({
  id,
  name,
  durationMs,
  explicit: false,
  popularity,
  isrc: null,
  previewUrl: null,
  albumId: `${id}-album`,
  albumName,
  albumImages: [],
  releaseDate,
  releaseDatePrecision: 'day',
  artists: [{ id: `${id}-artist`, name: artistName }],
  addedAt: null,
  playlistIds: [],
});

const MOCK_TRACKS: SpotifyTrack[] = [
  mkTrack('lfm-1', 'Salt Circuit', 'Harbor Lines', 'Salt Circuit', '2024-08-11', 198000, 22),
  mkTrack('lfm-2', 'Quiet Static', 'Loom & Wire', 'Quiet Static', '2025-02-27', 214000, 19),
  mkTrack('lfm-3', 'Marrow', 'Kite Season', 'Marrow', '2024-12-05', 231000, 31),
  mkTrack('lfm-4', 'Tin Roof Weather', 'Panelbeater', 'Tin Roof Weather EP', '2025-04-16', 189000, 15),
];

const MOCK_REASON_SETS: string[][] = [
  ['Populær blandt lyttere med lignende smag på Last.fm'],
  ['Scrobbles overlapper med kunstnere du lytter til'],
  ['Ligner sange andre Last.fm-brugere har tagget ens'],
];

/**
 * First non-Spotify RecommendationProvider. No real Last.fm API calls yet
 * — this is architecture only, returning a fixed mock batch so the queue
 * can be filled from more than one source without DiscoveryPage changing.
 */
export class LastFmRecommendationProvider implements RecommendationProvider {
  async getRecommendations(_user: UserProfile): Promise<Recommendation[]> {
    return shuffle(
      MOCK_TRACKS.map((track, index) => ({
        id: `lastfm-rec-${track.id}`,
        track,
        source: 'lastfm-mock',
        score: Number((0.8 - index * 0.1).toFixed(2)),
        reasons: MOCK_REASON_SETS[index % MOCK_REASON_SETS.length],
      })),
    );
  }
}
