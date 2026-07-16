import { createMockRecommendations } from './mockData';
import { RecommendationQueue } from './recommendationQueue';
import { SpotifyRecommendationProvider } from './spotifyProvider';
import type { Recommendation } from './types';
import { buildUserProfile } from './userProfile';

/**
 * Single entry point Discovery uses to get a filled RecommendationQueue.
 * Tries the real Spotify provider first; if it can't produce anything
 * (API restriction, network error, no seeds, ...) this falls back to the
 * mock recommendations so Discovery always has something to show.
 */
export const loadRecommendationQueue = async (): Promise<RecommendationQueue> => {
  let recommendations: Recommendation[] = [];

  try {
    const profile = await buildUserProfile();
    const provider = new SpotifyRecommendationProvider();
    recommendations = await provider.getRecommendations(profile);
  } catch (error) {
    console.warn('[recommendations] Kunne ikke bygge brugerprofil til Spotify-anbefalinger:', error);
  }

  if (recommendations.length === 0) {
    recommendations = createMockRecommendations();
  }

  return new RecommendationQueue(recommendations);
};
