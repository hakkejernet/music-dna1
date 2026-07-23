import { describe, expect, it } from 'vitest';
import type { Candidate } from '../../candidateProviders';
import { popularityEnricher } from './popularityEnricher';

const candidateWithRawMetadata = (rawMetadata: unknown): Candidate => ({
  candidateId: 'c1',
  title: 'Track',
  artists: ['Artist'],
  contributions: [{ providerName: 'fake', externalIds: {}, rawMetadata }],
});

describe('popularityEnricher — owns mainstream, derived from Last.fm listeners (M26)', () => {
  it('maps 1,000 listeners to exactly 0.5 at fixed confidence 0.5', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: 1000 }));
    expect(result).toEqual({ mainstream: { value: 0.5, confidence: 0.5 } });
  });

  it('maps the floor (1 listener) to value 0 — still a real contribution, not "no data"', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: 1 }));
    expect(result).toEqual({ mainstream: { value: 0, confidence: 0.5 } });
  });

  it('maps exactly the reference ceiling (1,000,000 listeners) to value 1', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: 1_000_000 }));
    expect(result).toEqual({ mainstream: { value: 1, confidence: 0.5 } });
  });

  it('clamps a listener count above the reference ceiling to value 1, never exceeding it', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: 10_000_000 }));
    expect(result).toEqual({ mainstream: { value: 1, confidence: 0.5 } });
  });

  it('contributes nothing when listeners is 0 — treated as unknown, not as "very niche"', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: 0 }));
    expect(result).toEqual({});
  });

  it('contributes nothing when listeners is negative', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: -5 }));
    expect(result).toEqual({});
  });

  it('contributes nothing when rawMetadata has no listeners field at all', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ tags: [] }));
    expect(result).toEqual({});
  });

  it('contributes nothing when listeners is present but not a number', async () => {
    const result = await popularityEnricher.enrich(candidateWithRawMetadata({ listeners: '1000' }));
    expect(result).toEqual({});
  });

  it('finds listeners on a later contribution when an earlier one lacks it', async () => {
    const candidate: Candidate = {
      candidateId: 'c1',
      title: 'Track',
      artists: ['Artist'],
      contributions: [
        { providerName: 'fake-a', externalIds: {}, rawMetadata: { tags: [] } },
        { providerName: 'fake-b', externalIds: {}, rawMetadata: { listeners: 1000 } },
      ],
    };
    const result = await popularityEnricher.enrich(candidate);
    expect(result).toEqual({ mainstream: { value: 0.5, confidence: 0.5 } });
  });

  it('is deterministic — the same candidate always produces the same result', async () => {
    const candidate = candidateWithRawMetadata({ listeners: 4200 });
    const first = await popularityEnricher.enrich(candidate);
    const second = await popularityEnricher.enrich(candidate);
    expect(first).toEqual(second);
  });
});
