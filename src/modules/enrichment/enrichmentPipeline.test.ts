import { describe, expect, it } from 'vitest';
import type { Candidate } from '../candidateProviders';
import { SIGNAL_CATALOG } from '../trackDna';
import { explicitMetadataEnricher } from './enrichers/explicitMetadataEnricher';
import { tagBasedEnricher } from './enrichers/tagBasedEnricher';
import { EnrichmentPipeline } from './enrichmentPipeline';
import type { Enricher, PartialSignalContribution } from './types';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

const makeCandidate = (rawMetadata: unknown): Candidate => ({
  candidateId: 'track-1',
  title: 'Test Song',
  artists: ['Test Artist'],
  contributions: [{ providerName: 'test-provider', externalIds: { 'test-provider': 'track-1' }, rawMetadata }],
});

class ThrowingEnricher implements Enricher {
  readonly enricherName: string;
  readonly ownedSignals: readonly string[];

  constructor(enricherName: string, ownedSignals: readonly string[]) {
    this.enricherName = enricherName;
    this.ownedSignals = ownedSignals;
  }

  async enrich(_candidate: Candidate): Promise<PartialSignalContribution> {
    throw new Error(`${this.enricherName} always fails`);
  }
}

class MutatingEnricher implements Enricher {
  readonly enricherName = 'mutating';
  readonly ownedSignals: readonly string[] = ['mainstream'];

  async enrich(candidate: Candidate): Promise<PartialSignalContribution> {
    try {
      // Deliberately attempts to mutate the (frozen) Candidate it was given.
      (candidate as { title: string }).title = 'mutated';
      candidate.contributions.push({ providerName: 'intruder', externalIds: {}, rawMetadata: {} });
    } catch {
      // Object.freeze throws in strict mode — swallowed here so this
      // enricher's failure-to-mutate doesn't itself crash the pipeline.
    }
    return {};
  }
}

class OutOfContractEnricher implements Enricher {
  readonly enricherName = 'out-of-contract';
  readonly ownedSignals: readonly string[] = ['mainstream'];

  async enrich(_candidate: Candidate): Promise<PartialSignalContribution> {
    // Returns a reading for a signal it never declared ownership of.
    return { mainstream: { value: 0.5, confidence: 0.9 }, tempo: { value: 0.9, confidence: 0.9 } };
  }
}

describe('EnrichmentPipeline — immutability (M4 Rule 1)', () => {
  it('never mutates the input Candidate, even when an enricher tries to', async () => {
    const candidate = makeCandidate({ tags: ['rock'] });
    const before = JSON.parse(JSON.stringify(candidate));

    const pipeline = new EnrichmentPipeline([tagBasedEnricher, new MutatingEnricher()]);
    await pipeline.enrich(candidate, FIXED_NOW);

    expect(candidate).toEqual(before);
  });

  it('returns the original Candidate, reconstructable unchanged, alongside the new TrackDNA', async () => {
    const candidate = makeCandidate({ tags: ['pop'] });
    const before = JSON.parse(JSON.stringify(candidate));

    const pipeline = new EnrichmentPipeline([tagBasedEnricher]);
    const result = await pipeline.enrich(candidate, FIXED_NOW);

    expect(result.candidate).toEqual(before);
    expect(result.candidate).toBe(candidate);
  });
});

describe('EnrichmentPipeline — determinism (M4 Rule 6)', () => {
  it('produces byte-identical output for identical (candidate, now), called twice', async () => {
    const candidate = makeCandidate({ tags: ['trap', 'hip hop'], explicit: true });
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);

    const first = await pipeline.enrich(candidate, FIXED_NOW);
    const second = await pipeline.enrich(candidate, FIXED_NOW);

    expect(second).toEqual(first);
  });
});

describe('EnrichmentPipeline — confidence correctness (M4 Rule 4)', () => {
  it('gives matching genre tags value=1 at the fixed tag-enrichment confidence, and non-matches value=0 at the same confidence', async () => {
    const candidate = makeCandidate({ tags: ['Classic Rock'] });
    const pipeline = new EnrichmentPipeline([tagBasedEnricher]);
    const result = await pipeline.enrich(candidate, FIXED_NOW);

    expect(result.trackDna.signals.rock).toEqual({ value: 1, confidence: 0.5 });
    expect(result.trackDna.signals.pop).toEqual({ value: 0, confidence: 0.5 });
    expect(result.trackDna.signals.house).toEqual({ value: 0, confidence: 0.5 });
  });

  it('gives a direct explicit metadata flag high confidence, distinct from tag-derived confidence', async () => {
    const candidate = makeCandidate({ explicit: true });
    const pipeline = new EnrichmentPipeline([explicitMetadataEnricher]);
    const result = await pipeline.enrich(candidate, FIXED_NOW);

    expect(result.trackDna.signals.explicitness).toEqual({ value: 1, confidence: 0.9 });
  });

  it('never guesses — every signal no enricher could determine stays at confidence 0', async () => {
    const candidate = makeCandidate({ tags: ['rock'] });
    const pipeline = new EnrichmentPipeline([tagBasedEnricher]);
    const result = await pipeline.enrich(candidate, FIXED_NOW);

    const untouchedSignals = SIGNAL_CATALOG.filter((def) => !['pop', 'hiphop', 'trap', 'rock', 'country', 'house'].includes(def.signalKey));
    for (const definition of untouchedSignals) {
      expect(result.trackDna.signals[definition.signalKey].confidence).toBe(0);
    }
  });
});

describe('EnrichmentPipeline — missing metadata never crashes (M4 Rule 5)', () => {
  it('resolves to a valid, fully-populated TrackDNA even with completely empty rawMetadata', async () => {
    const candidate = makeCandidate({});
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);

    const result = await pipeline.enrich(candidate, FIXED_NOW);
    expect(Object.keys(result.trackDna.signals).length).toBe(SIGNAL_CATALOG.length);
    for (const reading of Object.values(result.trackDna.signals)) {
      expect(reading.confidence).toBe(0);
      expect(Number.isFinite(reading.value)).toBe(true);
    }
  });

  it('resolves even when rawMetadata is not an object at all (null, a string, a number)', async () => {
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);
    for (const badMetadata of [null, 'not-an-object', 42, undefined]) {
      const candidate = makeCandidate(badMetadata);
      await expect(pipeline.enrich(candidate, FIXED_NOW)).resolves.toBeDefined();
    }
  });
});

describe('EnrichmentPipeline — error isolation', () => {
  it('one throwing enricher never stops the others from contributing', async () => {
    const candidate = makeCandidate({ tags: ['pop'] });
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, new ThrowingEnricher('flaky', ['mainstream'])]);

    const result = await pipeline.enrich(candidate, FIXED_NOW);

    expect(result.trackDna.signals.pop).toEqual({ value: 1, confidence: 0.5 });
    expect(result.trackDna.signals.mainstream.confidence).toBe(0);
    expect(result.enrichmentMetadata.enricherNames).toEqual(['tag-based']);
  });

  it('does not throw even when every enricher fails', async () => {
    const candidate = makeCandidate({ tags: ['pop'] });
    const pipeline = new EnrichmentPipeline([new ThrowingEnricher('a', ['mainstream']), new ThrowingEnricher('b', ['songLength'])]);

    await expect(pipeline.enrich(candidate, FIXED_NOW)).resolves.toBeDefined();
  });
});

describe('EnrichmentPipeline — one responsible enricher per signal (M4 Rule 3)', () => {
  it('rejects construction if two enrichers claim the same signal', () => {
    const a: Enricher = { enricherName: 'a', ownedSignals: ['mainstream'], enrich: async () => ({}) };
    const b: Enricher = { enricherName: 'b', ownedSignals: ['mainstream'], enrich: async () => ({}) };

    expect(() => new EnrichmentPipeline([a, b])).toThrow(/mainstream/);
  });

  it('discards any reading an enricher returns for a signal it never declared ownership of', async () => {
    const candidate = makeCandidate({});
    const pipeline = new EnrichmentPipeline([new OutOfContractEnricher()]);

    const result = await pipeline.enrich(candidate, FIXED_NOW);

    expect(result.trackDna.signals.mainstream).toEqual({ value: 0.5, confidence: 0.9 });
    // "tempo" was returned but not declared — must be dropped, not silently accepted.
    expect(result.trackDna.signals.tempo.confidence).toBe(0);
  });
});

describe('EnrichmentPipeline — source provenance (M4 Rule 7)', () => {
  it('records which enricher produced each signal it actually touched, and nothing for untouched signals', async () => {
    const candidate = makeCandidate({ tags: ['pop'], explicit: true });
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);

    const result = await pipeline.enrich(candidate, FIXED_NOW);

    expect(result.enrichmentMetadata.signalSources.pop).toBe('tag-based');
    expect(result.enrichmentMetadata.signalSources.explicitness).toBe('explicit-metadata');
    expect(result.enrichmentMetadata.signalSources.mainstream).toBeUndefined();
    expect(result.enrichmentMetadata.enricherNames.sort()).toEqual(['explicit-metadata', 'tag-based']);
    expect(result.enrichmentMetadata.enrichedAt).toBe(FIXED_NOW.toISOString());
  });
});

describe('EnrichmentPipeline — enrichmentCompleteness', () => {
  it('reflects exactly the fraction of the catalog that ended up with non-trivial confidence', async () => {
    const candidate = makeCandidate({ tags: ['pop'], explicit: true });
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);

    const result = await pipeline.enrich(candidate, FIXED_NOW);

    // tagBasedEnricher fills 6 genre signals, explicitMetadataEnricher fills 1 — 7 of 19 total.
    const expectedCompleteness = 7 / SIGNAL_CATALOG.length;
    expect(result.trackDna.enrichmentCompleteness).toBeCloseTo(expectedCompleteness, 10);
  });

  it('is 0 when no enricher could determine anything', async () => {
    const candidate = makeCandidate({});
    const pipeline = new EnrichmentPipeline([tagBasedEnricher, explicitMetadataEnricher]);

    const result = await pipeline.enrich(candidate, FIXED_NOW);
    expect(result.trackDna.enrichmentCompleteness).toBe(0);
  });
});
