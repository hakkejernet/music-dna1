import { env } from '../../lib/env';

const API_BASE = 'https://ws.audioscrobbler.com/2.0/';

export class LastFmApiError extends Error {}

interface LastFmErrorBody {
  error?: number;
  message?: string;
}

/**
 * Last.fm's REST API returns HTTP 200 even for method-level errors (bad
 * artist name, invalid key, etc.) — the failure shows up as an `error`
 * field in the JSON body instead of the status code, so both cases are
 * checked here. Every call still just throws on failure; callers decide
 * whether to skip-and-continue or propagate (see LastFmRecommendationProvider).
 */
export const lastFmGet = async <T>(params: Record<string, string>): Promise<T> => {
  const url = new URL(API_BASE);
  url.searchParams.set('api_key', env.lastfmApiKey);
  url.searchParams.set('format', 'json');
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new LastFmApiError(`Last.fm API HTTP-fejl ${response.status} for metode ${params.method}`);
  }

  const data = (await response.json()) as LastFmErrorBody & T;
  if (data.error) {
    throw new LastFmApiError(
      `Last.fm API-fejl ${data.error} for metode ${params.method}: ${data.message ?? 'ukendt fejl'}`,
    );
  }

  return data;
};
