import { describe, expect, it } from 'vitest';
import type { Candidate } from '../../candidateProviders';
import { trackSimilarityEnricher } from './trackSimilarityEnricher';

const candidateWithRawMetadata = (rawMetadata: unknown): Candidate => ({
  candidateId: 'c1',
  title: 'Track',
  artists: ['Artist'],
  contributions: [{ providerName: 'fake', externalIds: {}, rawMetadata }],
});

describe('trackSimilarityEnricher — owns trackSimilarity, derived from Last.fm track-level match (M30)', () => {
  it('maps a mid-range match to itself at fixed confidence 0.5', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ trackSimilarityMatch: 0.7 }));
    expect(result).toEqual({ trackSimilarity: { value: 0.7, confidence: 0.5 } });
  });

  it('maps a perfect match (1) to value 1', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ trackSimilarityMatch: 1 }));
    expect(result).toEqual({ trackSimilarity: { value: 1, confidence: 0.5 } });
  });

  it('maps a zero match to value 0 — still a real contribution, not "no data"', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ trackSimilarityMatch: 0 }));
    expect(result).toEqual({ trackSimilarity: { value: 0, confidence: 0.5 } });
  });

  it('clamps a match above 1, never exceeding value 1', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ trackSimilarityMatch: 1.4 }));
    expect(result).toEqual({ trackSimilarity: { value: 1, confidence: 0.5 } });
  });

  it('clamps a negative match to value 0, never going below it', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ trackSimilarityMatch: -0.3 }));
    expect(result).toEqual({ trackSimilarity: { value: 0, confidence: 0.5 } });
  });

  it('contributes nothing when rawMetadata has no trackSimilarityMatch field at all', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ tags: [] }));
    expect(result).toEqual({});
  });

  it('contributes nothing when trackSimilarityMatch is present but not a number', async () => {
    const result = await trackSimilarityEnricher.enrich(candidateWithRawMetadata({ trackSimilarityMatch: '0.7' }));
    expect(result).toEqual({});
  });

  it('finds the match on a later contribution when an earlier one lacks it', async () => {
    const candidate: Candidate = {
      candidateId: 'c1',
      title: 'Track',
      artists: ['Artist'],
      contributions: [
        { providerName: 'fake-a', externalIds: {}, rawMetadata: { tags: [] } },
        { providerName: 'fake-b', externalIds: {}, rawMetadata: { trackSimilarityMatch: 0.6 } },
      ],
    };
    const result = await trackSimilarityEnricher.enrich(candidate);
    expect(result).toEqual({ trackSimilarity: { value: 0.6, confidence: 0.5 } });
  });

  it('declares ownership of exactly trackSimilarity', () => {
    expect(trackSimilarityEnricher.ownedSignals).toEqual(['trackSimilarity']);
  });

  it('is deterministic — the same candidate always produces the same result', async () => {
    const candidate = candidateWithRawMetadata({ trackSimilarityMatch: 0.42 });
    const first = await trackSimilarityEnricher.enrich(candidate);
    const second = await trackSimilarityEnricher.enrich(candidate);
    expect(first).toEqual(second);
  });

  it('never throws, even for malformed rawMetadata', async () => {
    await expect(trackSimilarityEnricher.enrich(candidateWithRawMetadata(null))).resolves.toEqual({});
    await expect(trackSimilarityEnricher.enrich(candidateWithRawMetadata('not an object'))).resolves.toEqual({});
  });
});
