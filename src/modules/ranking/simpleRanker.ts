import type { Recommendation } from '../recommendations/types';
import type { RankedRecommendation, RankingInput, RecommendationRanker } from './types';

const NEW_ARTIST_BONUS = 20;
const GENRE_MATCH_BONUS = 10;
const ALREADY_IN_LIBRARY_PENALTY = -30;
const MULTI_SOURCE_AGREEMENT_BONUS = 5;
const PREFERRED_GENRE_BONUS = 15;
const AVOIDED_GENRE_PENALTY = -15;
const PREFERRED_ARTIST_BONUS = 10;
const PREFERRED_SOURCE_BONUS = 5;
const AVOIDED_SOURCE_PENALTY = -5;
const PREFERRED_DECADE_BONUS = 5;

interface ScoringContext {
  libraryArtistIds: Set<string>;
  libraryTrackIds: Set<string>;
  favoriteGenres: Set<string>;
  trackOccurrences: Map<string, number>;
  preferredGenres: Set<string>;
  avoidedGenres: Set<string>;
  preferredArtistIds: Set<string>;
  preferredSources: Set<string>;
  avoidedSources: Set<string>;
  preferredDecades: Set<string>;
}

const countTrackOccurrences = (recommendations: Recommendation[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const recommendation of recommendations) {
    counts.set(recommendation.track.id, (counts.get(recommendation.track.id) ?? 0) + 1);
  }
  return counts;
};

const toDecade = (releaseDate: string | null): string | null => {
  if (!releaseDate) return null;
  const year = Number.parseInt(releaseDate.slice(0, 4), 10);
  if (Number.isNaN(year)) return null;
  return `${Math.floor(year / 10) * 10}`;
};

/**
 * First RecommendationRanker. Deliberately simple, rule-based scoring — no
 * AI, no machine learning, no network or storage access, no knowledge of
 * Spotify, Last.fm, or any future provider. It only reads what's on
 * RankingInput and returns a reordered, annotated copy; it never fetches
 * anything itself, matching its one job: rank music, not find it.
 *
 * input.preferences (a PreferenceProfile computed purely from local
 * save/reject history — see modules/preferences) is optional, so a fresh
 * user with no history still ranks exactly as before, just without the
 * preference-based rules below.
 */
export class SimpleRanker implements RecommendationRanker {
  rank(input: RankingInput): RankedRecommendation[] {
    const preferences = input.preferences;
    const context: ScoringContext = {
      libraryArtistIds: new Set(input.profile.libraryArtistIds),
      libraryTrackIds: new Set(input.profile.libraryTrackIds),
      favoriteGenres: new Set(input.profile.seedGenres.map((genre) => genre.toLowerCase())),
      trackOccurrences: countTrackOccurrences(input.recommendations),
      preferredGenres: new Set((preferences?.favoriteGenres ?? []).map((genre) => genre.toLowerCase())),
      avoidedGenres: new Set((preferences?.avoidedGenres ?? []).map((genre) => genre.toLowerCase())),
      preferredArtistIds: new Set(preferences?.favoriteArtistIds ?? []),
      preferredSources: new Set(preferences?.favoriteSources ?? []),
      avoidedSources: new Set(preferences?.avoidedSources ?? []),
      preferredDecades: new Set(preferences?.favoriteDecades ?? []),
    };

    return input.recommendations
      .map((recommendation) => this.scoreOne(recommendation, context))
      .sort((a, b) => b.finalScore - a.finalScore);
  }

  private scoreOne(recommendation: Recommendation, context: ScoringContext): RankedRecommendation {
    let finalScore = 0;
    const explanations: string[] = [];

    const artistIds = recommendation.track.artists.map((artist) => artist.id);
    const isNewArtist = artistIds.every((id) => !context.libraryArtistIds.has(id));
    if (isNewArtist) {
      finalScore += NEW_ARTIST_BONUS;
      explanations.push('Ny kunstner');
    }

    const genresLower = recommendation.genres.map((genre) => genre.toLowerCase());

    const matchesFavoriteGenre = genresLower.some((genre) => context.favoriteGenres.has(genre));
    if (matchesFavoriteGenre) {
      finalScore += GENRE_MATCH_BONUS;
      explanations.push('Matcher dine favoritgenrer');
    }

    if (context.libraryTrackIds.has(recommendation.track.id)) {
      finalScore += ALREADY_IN_LIBRARY_PENALTY;
      explanations.push('Allerede i dit bibliotek');
    } else {
      explanations.push('Ikke fundet i dit bibliotek');
    }

    // Placeholder for real cross-provider fusion: today this only fires if
    // two configured providers happened to recommend the exact same track.
    if ((context.trackOccurrences.get(recommendation.track.id) ?? 1) > 1) {
      finalScore += MULTI_SOURCE_AGREEMENT_BONUS;
      explanations.push('Flere kilder er enige om denne sang');
    }

    // From here on: purely learned from the user's own save/reject history.
    if (genresLower.some((genre) => context.preferredGenres.has(genre))) {
      finalScore += PREFERRED_GENRE_BONUS;
      explanations.push('Du har tidligere gemt mange sange fra denne genre');
    }
    if (genresLower.some((genre) => context.avoidedGenres.has(genre))) {
      finalScore += AVOIDED_GENRE_PENALTY;
      explanations.push('Du afviser ofte sange fra denne genre');
    }

    if (artistIds.some((id) => context.preferredArtistIds.has(id))) {
      finalScore += PREFERRED_ARTIST_BONUS;
      explanations.push('Du har tidligere gemt sange med denne kunstner');
    }

    if (context.preferredSources.has(recommendation.source)) {
      finalScore += PREFERRED_SOURCE_BONUS;
      explanations.push('Du gemmer ofte sange fra denne kilde');
    }
    if (context.avoidedSources.has(recommendation.source)) {
      finalScore += AVOIDED_SOURCE_PENALTY;
      explanations.push('Du afviser ofte sange fra denne kilde');
    }

    const decade = toDecade(recommendation.track.releaseDate);
    if (decade && context.preferredDecades.has(decade)) {
      finalScore += PREFERRED_DECADE_BONUS;
      explanations.push('Du foretrækker ofte musik fra dette årti');
    }

    return { ...recommendation, finalScore, explanations };
  }
}
