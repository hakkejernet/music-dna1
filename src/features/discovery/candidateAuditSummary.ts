import type { CandidateAuditEntry } from '../../modules/applicationLayer';

/**
 * TEMPORARY — one-time candidate-quality audit only (Danish-recommendation-
 * dominance investigation). Pure aggregation over the entries
 * BuildDiscoveryQueue.execute() already produced — no new data sources,
 * no network calls. Remove alongside the rest of the audit once it
 * concludes.
 */
export interface CandidateAuditSummary {
  totalAnalyzed: number;
  danishPercent: number;
  internationalPercent: number;
  unknownPercent: number;
  topSeedArtists: { seedArtist: string; count: number }[];
  seedsThatProducedDanishArtists: { seedArtist: string; count: number }[];
  providersThatProducedDanishArtists: { provider: string; count: number }[];
  /** For Danish-classified candidates that survived into the visible queue: how many had a nonzero score in each of the 5 ranking buckets — i.e. which factors let them through. */
  rankingFactorsAmongDanishSurvivors: { bucket: string; nonzeroCount: number }[];
}

const TOP_SEED_COUNT = 20;

const countBy = <T,>(items: readonly T[], keyOf: (item: T) => string | null): { key: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    if (key === null) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([key, count]) => ({ key, count }));
};

const percent = (count: number, total: number): number => (total > 0 ? Math.round((count / total) * 1000) / 10 : 0);

export const buildCandidateAuditSummary = (entries: readonly CandidateAuditEntry[]): CandidateAuditSummary => {
  const totalAnalyzed = entries.length;
  const danishEntries = entries.filter((entry) => entry.countryLanguage === 'danish');
  const internationalCount = entries.filter((entry) => entry.countryLanguage === 'international').length;
  const unknownCount = entries.filter((entry) => entry.countryLanguage === 'unknown').length;

  const topSeedArtists = countBy(entries, (entry) => entry.seedArtist)
    .slice(0, TOP_SEED_COUNT)
    .map(({ key, count }) => ({ seedArtist: key, count }));

  const seedsThatProducedDanishArtists = countBy(danishEntries, (entry) => entry.seedArtist).map(({ key, count }) => ({ seedArtist: key, count }));

  const providersThatProducedDanishArtists = countBy(
    danishEntries.flatMap((entry) => entry.providers),
    (provider) => provider,
  ).map(({ key, count }) => ({ provider: key, count }));

  const danishSurvivors = danishEntries.filter((entry) => entry.survivedToQueue);
  const buckets: (keyof CandidateAuditEntry['scoreBreakdown'])[] = ['genreMatch', 'mainstreamMatch', 'explicitMatch', 'durationMatch', 'trackSimilarityMatch'];
  const rankingFactorsAmongDanishSurvivors = buckets.map((bucket) => ({
    bucket,
    nonzeroCount: danishSurvivors.filter((entry) => entry.scoreBreakdown[bucket] > 0).length,
  }));

  return {
    totalAnalyzed,
    danishPercent: percent(danishEntries.length, totalAnalyzed),
    internationalPercent: percent(internationalCount, totalAnalyzed),
    unknownPercent: percent(unknownCount, totalAnalyzed),
    topSeedArtists,
    seedsThatProducedDanishArtists,
    providersThatProducedDanishArtists,
    rankingFactorsAmongDanishSurvivors,
  };
};
