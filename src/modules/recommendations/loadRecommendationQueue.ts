import { getSavedTrackIds } from '../history';
import { SimpleRanker, type RankedRecommendation } from '../ranking';
import { createMockRecommendations } from './mockData';
import { getConfiguredProviders } from './providerConfig';
import { RecommendationQueue } from './recommendationQueue';
import type { Recommendation, UserProfile } from './types';
import { buildUserProfile } from './userProfile';

const EMPTY_PROFILE: UserProfile = {
  userId: '',
  seedArtistIds: [],
  seedTrackIds: [],
  seedGenres: [],
  libraryArtistIds: [],
  libraryTrackIds: [],
};

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

const ranker = new SimpleRanker();

/**
 * Single entry point Discovery uses to get a filled RecommendationQueue.
 * Runs every configured provider (see providerConfig.ts) and concatenates
 * whatever they return — no fusion across sources yet. A provider that
 * throws is treated as contributing nothing, not as a fatal error. If
 * every provider comes back empty, this falls back to the existing mock
 * recommendations. Already-saved tracks (see modules/history) are filtered
 * out so a song the user saved once never resurfaces in a later session.
 * Whatever's left is run through SimpleRanker before it reaches the queue,
 * so RecommendationQueue holds RankedRecommendation objects.
 */
export const loadRecommendationQueue = async (): Promise<RecommendationQueue<RankedRecommendation>> => {
  const profile = await buildProfileSafely();
  const providers = getConfiguredProviders();

  const settled = await Promise.allSettled(providers.map((provider) => provider.getRecommendations(profile)));

  const recommendations: Recommendation[] = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`[recommendations] Provider #${index} (${providers[index].constructor.name}) fejlede:`, result.reason);
    return [];
  });

  const batch = recommendations.length > 0 ? recommendations : createMockRecommendations();

  const savedTrackIds = await getSavedTrackIds();
  const unseen = batch.filter((recommendation) => !savedTrackIds.has(recommendation.track.id));

  const ranked = ranker.rank({ recommendations: unseen, profile });

  return new RecommendationQueue<RankedRecommendation>(ranked);
};
