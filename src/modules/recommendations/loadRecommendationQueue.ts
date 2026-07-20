import { getRecommendationDiagnostics, resetRecommendationDiagnostics, updateRecommendationDiagnostics } from '../diagnostics';
import { getSavedTrackIds } from '../history';
import { buildPreferenceProfile } from '../preferences';
import { SimpleRanker, type RankedRecommendation } from '../ranking';
import { getConfiguredProviders } from './providerConfig';
import { RecommendationQueue } from './recommendationQueue';
import type { Recommendation, UserProfile } from './types';
import { buildUserProfile } from './userProfile';

const EMPTY_PROFILE: UserProfile = {
  userId: '',
  seedArtistIds: [],
  seedArtistNames: [],
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

/** Priority-ordered — matches the exact categories the DebugPanel shows. Only called once the queue actually ended up empty. */
const determineFallbackReason = (): string => {
  const diagnostics = getRecommendationDiagnostics();
  if (!diagnostics.spotify.topArtistsFound) {
    return 'Ingen Spotify top artists';
  }
  if (!diagnostics.lastfm.apiKeyPresent) {
    return 'Last.fm API key mangler';
  }
  if (diagnostics.lastfm.error) {
    return diagnostics.lastfm.error;
  }
  return '0 recommendations';
};

/**
 * Single entry point Discovery uses to get a filled RecommendationQueue.
 * Runs every configured provider (see providerConfig.ts) and concatenates
 * whatever they return — no fusion across sources yet. A provider that
 * throws is treated as contributing nothing, not as a fatal error. If
 * every provider comes back empty, the queue is simply empty — this never
 * fabricates recommendations to fill the gap (M15 Rule 7; the mock-data
 * fallback that used to live here has been removed, M15 Rule 1).
 * Already-saved tracks (see modules/history) are filtered out so a song
 * the user saved once never resurfaces in a later session. Whatever's
 * left is run through SimpleRanker — together with a PreferenceProfile
 * learned purely from local save/reject history (see modules/preferences)
 * — before it reaches the queue, so RecommendationQueue holds
 * RankedRecommendation objects.
 */
export const loadRecommendationQueue = async (): Promise<RecommendationQueue<RankedRecommendation>> => {
  resetRecommendationDiagnostics();

  const profile = await buildProfileSafely();
  const providers = getConfiguredProviders();

  const settled = await Promise.allSettled(providers.map((provider) => provider.getRecommendations(profile)));

  const recommendations: Recommendation[] = settled.flatMap((result, index) => {
    if (result.status === 'fulfilled') return result.value;
    console.warn(`[recommendations] Provider #${index} (${providers[index].constructor.name}) fejlede:`, result.reason);
    return [];
  });

  const savedTrackIds = await getSavedTrackIds();
  const unseen = recommendations.filter((recommendation) => !savedTrackIds.has(recommendation.track.id));

  const preferences = await buildPreferenceProfile();
  const ranked = ranker.rank({ recommendations: unseen, profile, preferences });

  const queue = new RecommendationQueue<RankedRecommendation>(ranked);
  const isEmpty = recommendations.length === 0;
  updateRecommendationDiagnostics({
    queue: {
      beforeRanking: unseen.length,
      afterRanking: ranked.length,
      inQueue: queue.size,
      source: isEmpty ? 'empty' : 'lastfm',
    },
    fallbackReason: isEmpty ? determineFallbackReason() : null,
    topRecommendations: ranked
      .slice(0, 10)
      .map((recommendation) => `${recommendation.track.name} — ${recommendation.track.artists.map((artist) => artist.name).join(', ')}`),
  });

  return queue;
};
