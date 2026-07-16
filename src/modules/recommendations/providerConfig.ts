import { LastFmRecommendationProvider } from './lastFmProvider';
import type { RecommendationProvider } from './types';

/**
 * The providers loadRecommendationQueue() pulls from, in order. Spotify is
 * no longer the recommendation engine (see SpotifyRecommendationProvider's
 * @deprecated note), so Last.fm is the only active source today. Adding a
 * source back — or combining several — is just extending this array, e.g.:
 *
 *   [new SpotifyRecommendationProvider(), new LastFmRecommendationProvider()]
 *
 * No fusion or scoring across providers yet: loadRecommendationQueue()
 * simply concatenates whatever each configured provider returns. Nothing
 * outside this module needs to change when the list changes — DiscoveryPage
 * only ever sees the resulting RecommendationQueue.
 */
export const getConfiguredProviders = (): RecommendationProvider[] => [new LastFmRecommendationProvider()];
