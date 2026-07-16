import { getAllRejected, getAllSaved } from '../history';
import type { RejectedRecommendation, SavedRecommendation } from '../history';
import type { PreferenceProfile } from './types';

const MIN_GENRE_COUNT = 2;
const MIN_DECADE_COUNT = 2;
const MIN_SOURCE_COUNT = 2;
const MAX_FAVORITE_GENRES = 5;
const MAX_AVOIDED_GENRES = 5;
const MAX_FAVORITE_ARTISTS = 20;
const MAX_FAVORITE_DECADES = 3;
const MAX_SOURCES = 3;

const EMPTY_PROFILE: PreferenceProfile = {
  favoriteGenres: [],
  avoidedGenres: [],
  favoriteArtistIds: [],
  favoriteDecades: [],
  favoriteSources: [],
  avoidedSources: [],
};

const countBy = <T>(items: T[], toKeys: (item: T) => string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const key of toKeys(item)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
};

const topKeys = (counts: Map<string, number>, minCount: number, limit: number): string[] =>
  [...counts.entries()]
    .filter(([, count]) => count >= minCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key]) => key);

const toDecade = (releaseDate: string | null): string | null => {
  if (!releaseDate) return null;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  if (Number.isNaN(year)) return null;
  return `${Math.floor(year / 10) * 10}`;
};

/**
 * Computes a PreferenceProfile purely from local save/reject history — no
 * AI, no ML, just counting. Nothing here is cached: it recomputes fresh
 * from modules/history every time it's called. Self-protecting: any
 * failure (e.g. IndexedDB unavailable) degrades to an all-empty profile
 * rather than throwing, so a fresh user with no history — or any read
 * error — just means SimpleRanker's preference-based rules don't fire yet.
 */
export const buildPreferenceProfile = async (): Promise<PreferenceProfile> => {
  try {
    const [saved, rejected]: [SavedRecommendation[], RejectedRecommendation[]] = await Promise.all([
      getAllSaved(),
      getAllRejected(),
    ]);

    const savedGenreCounts = countBy(saved, (record) => record.recommendation.genres);
    const rejectedGenreCounts = countBy(rejected, (record) => record.recommendation.genres);
    const savedArtistCounts = countBy(saved, (record) =>
      record.recommendation.track.artists.map((artist) => artist.id),
    );
    const savedDecadeCounts = countBy(saved, (record) => {
      const decade = toDecade(record.recommendation.track.releaseDate);
      return decade ? [decade] : [];
    });
    const savedSourceCounts = countBy(saved, (record) => [record.recommendation.source]);
    const rejectedSourceCounts = countBy(rejected, (record) => [record.recommendation.source]);

    return {
      favoriteGenres: topKeys(savedGenreCounts, MIN_GENRE_COUNT, MAX_FAVORITE_GENRES),
      avoidedGenres: topKeys(rejectedGenreCounts, MIN_GENRE_COUNT, MAX_AVOIDED_GENRES),
      favoriteArtistIds: topKeys(savedArtistCounts, 1, MAX_FAVORITE_ARTISTS),
      favoriteDecades: topKeys(savedDecadeCounts, MIN_DECADE_COUNT, MAX_FAVORITE_DECADES),
      favoriteSources: topKeys(savedSourceCounts, MIN_SOURCE_COUNT, MAX_SOURCES),
      avoidedSources: topKeys(rejectedSourceCounts, MIN_SOURCE_COUNT, MAX_SOURCES),
    };
  } catch (error) {
    console.warn('[preferences] Kunne ikke beregne PreferenceProfile, fortsætter uden:', error);
    return EMPTY_PROFILE;
  }
};
