import type { Recommendation } from '../recommendations/types';
import type { RankedRecommendation, RankingInput, RecommendationRanker } from './types';

const NEW_ARTIST_BONUS = 20;
const GENRE_MATCH_BONUS = 10;
const ALREADY_IN_LIBRARY_PENALTY = -30;
const MULTI_SOURCE_AGREEMENT_BONUS = 5;

interface ScoringContext {
  libraryArtistIds: Set<string>;
  libraryTrackIds: Set<string>;
  favoriteGenres: Set<string>;
  trackOccurrences: Map<string, number>;
}

const countTrackOccurrences = (recommendations: Recommendation[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const recommendation of recommendations) {
    counts.set(recommendation.track.id, (counts.get(recommendation.track.id) ?? 0) + 1);
  }
  return counts;
};

/**
 * First RecommendationRanker. Deliberately simple, rule-based scoring — no
 * AI, no machine learning, no network or storage access, no knowledge of
 * Spotify, Last.fm, or any future provider. It only reads what's on
 * RankingInput and returns a reordered, annotated copy; it never fetches
 * anything itself, matching its one job: rank music, not find it.
 */
export class SimpleRanker implements RecommendationRanker {
  rank(input: RankingInput): RankedRecommendation[] {
    const context: ScoringContext = {
      libraryArtistIds: new Set(input.profile.libraryArtistIds),
      libraryTrackIds: new Set(input.profile.libraryTrackIds),
      favoriteGenres: new Set(input.profile.seedGenres.map((genre) => genre.toLowerCase())),
      trackOccurrences: countTrackOccurrences(input.recommendations),
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

    const matchesFavoriteGenre = recommendation.genres.some((genre) =>
      context.favoriteGenres.has(genre.toLowerCase()),
    );
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

    return { ...recommendation, finalScore, explanations };
  }
}
