import type { Candidate } from '../../candidateProviders';
import type { Enricher, PartialSignalContribution } from '../types';

/**
 * Direct per-track tag evidence is stronger than the aggregate,
 * library-wide popularity heuristic Cold Start (M2) uses, but still
 * crude keyword-matching against free-text tags, not real audio
 * analysis — hence a mid-level, fixed confidence, higher than M2's 0.2
 * but well short of certainty. Fixed rather than graduated for the same
 * reason M2 chose a fixed constant: the simplest correct implementation
 * this milestone needs, not a polished model.
 */
const TAG_ENRICHMENT_CONFIDENCE = 0.5;

/** Same crude keyword-matching approach as Cold Start's genre signals (M2) — deliberately consistent, not reinvented. */
const GENRE_KEYWORDS: Record<string, string[]> = {
  pop: ['pop'],
  hiphop: ['hip hop', 'hip-hop', 'rap'],
  trap: ['trap'],
  rock: ['rock'],
  country: ['country'],
  house: ['house'],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === 'string');

/** Reads a `tags: string[]` field from any contribution's rawMetadata — the first one found, since all contributions describe the same candidate. */
const findTags = (candidate: Candidate): string[] | null => {
  for (const contribution of candidate.contributions) {
    const { rawMetadata } = contribution;
    if (isRecord(rawMetadata) && isStringArray(rawMetadata.tags)) {
      return rawMetadata.tags;
    }
  }
  return null;
};

/**
 * Owns the 6 genre signals. Deterministic, network-free (M4 Rule 8):
 * reads only what's already present in the Candidate it was given —
 * never fetches anything itself. Missing/absent tags is a normal
 * outcome (M4 Rule 5): this enricher then simply contributes nothing,
 * leaving every genre signal at validateSignalVector()'s neutral
 * default rather than guessing.
 */
export const tagBasedEnricher: Enricher = {
  enricherName: 'tag-based',
  ownedSignals: Object.keys(GENRE_KEYWORDS),

  async enrich(candidate: Candidate): Promise<PartialSignalContribution> {
    const tags = findTags(candidate);
    // No tags at all is genuinely unknown — leave every genre signal at
    // validateSignalVector()'s default rather than guessing (Rule 4).
    // With tags present, absence of a keyword match is itself real
    // (if weaker) evidence the genre does not apply — a determination,
    // not a guess — so every owned signal gets a reading, not just hits.
    if (tags === null || tags.length === 0) return {};

    const lowerTags = tags.map((tag) => tag.toLowerCase());
    const contribution: PartialSignalContribution = {};
    for (const [signalKey, keywords] of Object.entries(GENRE_KEYWORDS)) {
      const matches = lowerTags.some((tag) => keywords.some((keyword) => tag.includes(keyword)));
      contribution[signalKey] = { value: matches ? 1 : 0, confidence: TAG_ENRICHMENT_CONFIDENCE };
    }
    return contribution;
  },
};
