import { createMockRecommendations } from './mockData';
import { getConfiguredProviders } from './providerConfig';
import { RecommendationQueue } from './recommendationQueue';
import type { Recommendation, UserProfile } from './types';
import { buildUserProfile } from './userProfile';

const EMPTY_PROFILE: UserProfile = { userId: '', seedArtistIds: [], seedTrackIds: [], seedGenres: [] };

// Building the Spotify-derived profile must never block providers that
// don't need it (e.g. LastFmRecommendationProvider) — so a failure here
// degrades to an empty profile instead of aborting the whole load.
const buildProfileSafely = async (): Promise<UserProfile> => {
  try {
    return await buildUserProfile();
  } catch (error) {
    console.warn('[recommendations] Kunne ikke bygge Spotify-baseret brugerprofil, fortsætter uden:', error);
    return EMPTY_PROFILE;
  }
};

/**
 * Single entry point Discovery uses to get a filled RecommendationQueue.
 * Runs every configured provider (see providerConfig.ts) and concatenates
 * whatever they return — no fusion or scoring across sources yet. A
 * provider that throws is treated as contributing nothing, not as a fatal
 * error. If every provider comes back empty, this falls back to the
 * existing mock recommendations so Discovery always has something to show.
 */
export const loadRecommendationQueue = async (): Promise<RecommendationQueue> => {
  const profile = await buildProfileSafely();
  const providers = getConfiguredProviders();

  const settled = await Promise.allSettled(providers.map((provider) => provider.getRecommendations(profile)));

  const recommendations: Recommendation[] = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`[recommendations] Provider #${index} (${providers[index].constructor.name}) fejlede:`, result.reason);
    return [];
  });

  return new RecommendationQueue(recommendations.length > 0 ? recommendations : createMockRecommendations());
};
