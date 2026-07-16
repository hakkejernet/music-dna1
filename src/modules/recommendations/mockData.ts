import { shuffle } from '../../lib/shuffle';
import type { SpotifyTrack } from '../spotify/types';
import type { Recommendation } from './types';

const mkTrack = (
  id: string,
  name: string,
  artistId: string,
  artistName: string,
  albumName: string,
  releaseDate: string,
  durationMs: number,
  popularity: number,
  explicit: boolean,
): SpotifyTrack => ({
  id,
  name,
  durationMs,
  explicit,
  popularity,
  isrc: null,
  previewUrl: null,
  albumId: `${id}-album`,
  albumName,
  albumImages: [],
  releaseDate,
  releaseDatePrecision: 'day',
  artists: [{ id: artistId, name: artistName }],
  addedAt: null,
  playlistIds: [],
});

// Mock candidates only — none of these come from the user's own library.
// This stands in for a future recommendation source (a real engine, or
// an external API) that hasn't been built yet.
const MOCK_TRACKS: SpotifyTrack[] = [
  mkTrack('mock-1', 'Paper Skies', 'artist-coastal-static', 'Coastal Static', 'Paper Skies', '2025-03-14', 187000, 34, false),
  mkTrack('mock-2', 'Ultraviolet Bloom', 'artist-glass-parade', 'Glass Parade', 'Ultraviolet Bloom', '2025-06-02', 203000, 41, false),
  mkTrack('mock-3', 'Concrete Garden', 'artist-mono-harbor', 'Mono Harbor', 'Concrete Garden EP', '2024-11-20', 221000, 28, true),
  mkTrack('mock-4', 'Slow Static', 'artist-fernweh', 'Fernweh', 'Slow Static', '2025-01-09', 195000, 52, false),
  mkTrack('mock-5', 'Nightbus', 'artist-copper-lung', 'Copper Lung', 'Nightbus', '2025-05-18', 176000, 37, false),
  mkTrack('mock-6', 'Halflight', 'artist-tender-vhs', 'Tender VHS', 'Halflight', '2024-09-30', 210000, 45, false),
];

const MOCK_GENRES: Record<string, string> = {
  'artist-coastal-static': 'dream pop',
  'artist-glass-parade': 'hyperpop',
  'artist-mono-harbor': 'post-punk',
  'artist-fernweh': 'folktronica',
  'artist-copper-lung': 'uk garage',
  'artist-tender-vhs': 'jazz fusion',
};

const MOCK_REASON_SETS: string[][] = [
  ['Matcher din musiksmag', 'Samme stemning'],
  ['Ligner sange i din playlist', 'Samme genre'],
  ['Matcher din musiksmag', 'Ligner sange i din playlist'],
  ['Samme genre', 'Samme stemning'],
];

/** Builds a fresh, shuffled batch of mock recommendations. No real scoring yet. */
export const createMockRecommendations = (): Recommendation[] =>
  shuffle(
    MOCK_TRACKS.map((track, index) => {
      const genre = MOCK_GENRES[track.artists[0]?.id ?? ''];
      return {
        id: `rec-${track.id}`,
        track,
        source: 'mock-seed',
        score: Number((0.9 - index * 0.08).toFixed(2)),
        reasons: MOCK_REASON_SETS[index % MOCK_REASON_SETS.length],
        genres: genre ? [genre] : [],
      };
    }),
  );
