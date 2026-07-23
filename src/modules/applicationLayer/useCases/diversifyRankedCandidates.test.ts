import { describe, expect, it } from 'vitest';
import type { EnrichedCandidate } from '../../enrichment';
import type { RankedCandidate } from '../../rankingEngine';
import { diversifyRankedCandidates } from './diversifyRankedCandidates';

const ranked = (candidateRef: string, score: number): RankedCandidate => ({
  candidateRef,
  trackDnaRef: candidateRef,
  score,
  scoreBreakdown: { genreMatch: 0, mainstreamMatch: 0, explicitMatch: 0, durationMatch: 0, trackSimilarityMatch: 0 },
  explanations: [],
  rankedAt: '2026-01-01T00:00:00.000Z',
});

const enrichedWithArtist = (candidateRef: string, artist: string): EnrichedCandidate => ({
  candidate: { candidateId: candidateRef, title: candidateRef, artists: [artist], contributions: [] },
  trackDna: { trackId: candidateRef, signals: {}, sourceCandidateRef: candidateRef, enrichmentCompleteness: 0 },
  enrichmentMetadata: { enricherNames: [], signalSources: {}, enrichedAt: '2026-01-01T00:00:00.000Z' },
});

describe('diversifyRankedCandidates — per-primary-artist cap, filtering only (M27)', () => {
  it('leaves the top `limit` unchanged when no artist ever exceeds the cap', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80), ranked('c3', 70)];
    const enrichedByCandidateId = new Map([
      ['c1', enrichedWithArtist('c1', 'Artist A')],
      ['c2', enrichedWithArtist('c2', 'Artist B')],
      ['c3', enrichedWithArtist('c3', 'Artist C')],
    ]);

    const result = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 3, 2);

    expect(result).toEqual(rankedPool);
  });

  it('caps a dominant artist at maxPerArtist and fills displaced slots from the next-highest-ranked other artists, in order', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80), ranked('c3', 70), ranked('c4', 60), ranked('c5', 50)];
    const enrichedByCandidateId = new Map([
      ['c1', enrichedWithArtist('c1', 'Dominant')],
      ['c2', enrichedWithArtist('c2', 'Dominant')],
      ['c3', enrichedWithArtist('c3', 'Dominant')],
      ['c4', enrichedWithArtist('c4', 'Other')],
      ['c5', enrichedWithArtist('c5', 'AnotherOne')],
    ]);

    const result = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 3, 2);

    expect(result.map((r) => r.candidateRef)).toEqual(['c1', 'c2', 'c4']);
  });

  it('never reorders — the result is always a subsequence of the input in the same relative order', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80), ranked('c3', 70), ranked('c4', 60)];
    const enrichedByCandidateId = new Map([
      ['c1', enrichedWithArtist('c1', 'X')],
      ['c2', enrichedWithArtist('c2', 'X')],
      ['c3', enrichedWithArtist('c3', 'X')],
      ['c4', enrichedWithArtist('c4', 'Y')],
    ]);

    const result = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 4, 1);
    const resultIds = result.map((r) => r.candidateRef);
    const inputIds = rankedPool.map((r) => r.candidateRef);

    // Every id in the result appears in the input, in the same relative order.
    const positionsInInput = resultIds.map((id) => inputIds.indexOf(id));
    expect(positionsInInput).toEqual([...positionsInInput].sort((a, b) => a - b));
    expect(resultIds.every((id) => inputIds.includes(id))).toBe(true);
  });

  it('returns fewer than `limit` when too few distinct artists exist to fill it — never pads', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80), ranked('c3', 70), ranked('c4', 60)];
    const enrichedByCandidateId = new Map([
      ['c1', enrichedWithArtist('c1', 'A')],
      ['c2', enrichedWithArtist('c2', 'A')],
      ['c3', enrichedWithArtist('c3', 'B')],
      ['c4', enrichedWithArtist('c4', 'B')],
    ]);

    const result = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 15, 2);

    expect(result).toHaveLength(4);
  });

  it('returns an empty array for an empty ranked pool', () => {
    expect(diversifyRankedCandidates([], new Map(), 15, 2)).toEqual([]);
  });

  it('returns an empty array when limit is 0', () => {
    const rankedPool = [ranked('c1', 90)];
    const enrichedByCandidateId = new Map([['c1', enrichedWithArtist('c1', 'A')]]);

    expect(diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 0, 2)).toEqual([]);
  });

  it('never caps a candidate whose id is missing from enrichedByCandidateId — always eligible', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80), ranked('c3', 70)];
    // c1..c3 all missing from the map — none can be attributed to an artist.
    const result = diversifyRankedCandidates(rankedPool, new Map(), 3, 1);

    expect(result.map((r) => r.candidateRef)).toEqual(['c1', 'c2', 'c3']);
  });

  it('never caps a candidate with an empty artists array — always eligible', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80)];
    const enrichedByCandidateId = new Map([
      ['c1', { ...enrichedWithArtist('c1', ''), candidate: { ...enrichedWithArtist('c1', '').candidate, artists: [] } }],
      ['c2', { ...enrichedWithArtist('c2', ''), candidate: { ...enrichedWithArtist('c2', '').candidate, artists: [] } }],
    ]);

    const result = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 2, 1);

    expect(result.map((r) => r.candidateRef)).toEqual(['c1', 'c2']);
  });

  it('is deterministic — the same input always produces the same output', () => {
    const rankedPool = [ranked('c1', 90), ranked('c2', 80), ranked('c3', 70)];
    const enrichedByCandidateId = new Map([
      ['c1', enrichedWithArtist('c1', 'A')],
      ['c2', enrichedWithArtist('c2', 'A')],
      ['c3', enrichedWithArtist('c3', 'B')],
    ]);

    const first = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 3, 1);
    const second = diversifyRankedCandidates(rankedPool, enrichedByCandidateId, 3, 1);
    expect(first).toEqual(second);
  });
});
