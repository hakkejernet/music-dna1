import { getRecommendedTracks } from '../spotify';
import type { Recommendation, RecommendationProvider, UserProfile } from './types';

/**
 * Talks to Spotify's /recommendations endpoint. Spotify restricted that
 * endpoint to apps with pre-approved "extended quota mode" in Nov 2024 —
 * a fresh app like this one will typically get a 403/404 there. That is
 * an expected, non-fatal outcome: this provider always resolves (never
 * throws) and returns an empty list when Spotify can't deliver.
 */
export class SpotifyRecommendationProvider implements RecommendationProvider {
  async getRecommendations(user: UserProfile): Promise<Recommendation[]> {
    if (user.seedArtistIds.length === 0 && user.seedGenres.length === 0 && user.seedTrackIds.length === 0) {
      console.warn('[SpotifyRecommendationProvider] Ingen seeds tilgængelige — springer Spotify-kald over.');
      return [];
    }

    try {
      const tracks = await getRecommendedTracks({
        seedArtistIds: user.seedArtistIds,
        seedGenres: user.seedGenres,
        seedTrackIds: user.seedTrackIds,
      });

      return tracks.map((track, index) => ({
        id: `spotify-rec-${track.id}`,
        track,
        source: 'spotify',
        score: Number((1 - index / Math.max(tracks.length, 1)).toFixed(2)),
        reasons: ['Anbefalet af Spotify baseret på dine top-kunstnere'],
      }));
    } catch (error) {
      console.warn(
        '[SpotifyRecommendationProvider] Kunne ikke hente anbefalinger fra Spotify (formentlig API-begrænsning på /recommendations):',
        error,
      );
      return [];
    }
  }
}
