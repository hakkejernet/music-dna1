import type { SpotifyTrack } from '../spotify/types';

const stripParenthetical = (value: string): string => value.replace(/[([][^)\]]*[)\]]/g, ' ');

/** Lowercases and strips diacritics, punctuation and parenthetical suffixes (e.g. "(feat. X)", "- Remastered 2011") so title/artist comparisons ignore cosmetic differences between sources. */
export const normalize = (value: string): string =>
  stripParenthetical(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const normalizeCacheKey = (title: string, artist: string): string => `${normalize(title)}::${normalize(artist)}`;

/**
 * Deterministic exact-match search — no AI, no fuzzy scoring. A candidate
 * counts as a match only if its normalized title equals the target title
 * AND at least one of its artists normalizes to the target artist. Returns
 * the first such match (Spotify's own relevance order), or null when
 * nothing qualifies as unambiguous.
 */
export const findExactMatch = (candidates: SpotifyTrack[], title: string, artist: string): SpotifyTrack | null => {
  const targetTitle = normalize(title);
  const targetArtist = normalize(artist);
  const match = candidates.find(
    (candidate) =>
      normalize(candidate.name) === targetTitle &&
      candidate.artists.some((candidateArtist) => normalize(candidateArtist.name) === targetArtist),
  );
  return match ?? null;
};
