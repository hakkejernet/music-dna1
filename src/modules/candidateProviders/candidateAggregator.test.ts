import { describe, expect, it } from 'vitest';
import { CandidateAggregator } from './candidateAggregator';
import type { Candidate, CandidateProvider, CandidateRequest } from './types';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

/** A fully deterministic in-memory provider — no fetch, no internet, no randomness (M3 "testable without internet"). */
class FixedListProvider implements CandidateProvider {
  readonly providerName: string;
  private readonly candidates: Candidate[];

  constructor(providerName: string, candidates: Candidate[]) {
    this.providerName = providerName;
    this.candidates = candidates;
  }

  async fetchCandidates(_request: CandidateRequest): Promise<Candidate[]> {
    return this.candidates;
  }
}

class FailingProvider implements CandidateProvider {
  readonly providerName: string;

  constructor(providerName: string) {
    this.providerName = providerName;
  }

  async fetchCandidates(_request: CandidateRequest): Promise<Candidate[]> {
    throw new Error(`${this.providerName} is unreachable`);
  }
}

const candidate = (candidateId: string, title: string, artists: string[], providerName: string, rawMetadata: unknown): Candidate => ({
  candidateId,
  title,
  artists,
  contributions: [{ providerName, externalIds: { [providerName]: candidateId }, rawMetadata }],
});

describe('CandidateAggregator — provider independence (M3 Rule 2/3)', () => {
  it('a single provider works with no knowledge of any other provider existing', async () => {
    const provider = new FixedListProvider('solo', [candidate('1', 'Solo Song', ['Solo Artist'], 'solo', { plays: 10 })]);
    const aggregator = new CandidateAggregator([provider]);

    const result = await aggregator.fetchAll({ limit: 10 }, FIXED_NOW);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('Solo Song');
  });

  it('adding a second, unrelated provider does not change the first provider’s own candidates', async () => {
    const providerA = new FixedListProvider('a', [candidate('a1', 'Song A', ['Artist A'], 'a', { source: 'a' })]);
    const withOnlyA = await new CandidateAggregator([providerA]).fetchAll({ limit: 10 }, FIXED_NOW);

    const providerB = new FixedListProvider('b', [candidate('b1', 'Song B', ['Artist B'], 'b', { source: 'b' })]);
    const withAAndB = await new CandidateAggregator([providerA, providerB]).fetchAll({ limit: 10 }, FIXED_NOW);

    const songAFromFirstRun = withOnlyA.candidates.find((c) => c.title === 'Song A');
    const songAFromSecondRun = withAAndB.candidates.find((c) => c.title === 'Song A');
    expect(songAFromSecondRun).toEqual(songAFromFirstRun);
    expect(withAAndB.candidates).toHaveLength(2);
  });

  it('removing a provider only removes its own candidates, leaving the rest untouched', async () => {
    const providerA = new FixedListProvider('a', [candidate('a1', 'Song A', ['Artist A'], 'a', {})]);
    const providerB = new FixedListProvider('b', [candidate('b1', 'Song B', ['Artist B'], 'b', {})]);

    const withBoth = await new CandidateAggregator([providerA, providerB]).fetchAll({ limit: 10 }, FIXED_NOW);
    const withoutB = await new CandidateAggregator([providerA]).fetchAll({ limit: 10 }, FIXED_NOW);

    expect(withBoth.candidates).toHaveLength(2);
    expect(withoutB.candidates).toHaveLength(1);
    expect(withoutB.candidates[0]).toEqual(withBoth.candidates.find((c) => c.title === 'Song A'));
  });
});

describe('CandidateAggregator — error isolation (M3 Rule 5)', () => {
  it('one failing provider never stops the others from returning their candidates', async () => {
    const healthy = new FixedListProvider('healthy', [candidate('h1', 'Healthy Song', ['Healthy Artist'], 'healthy', {})]);
    const failing = new FailingProvider('flaky');
    const aggregator = new CandidateAggregator([healthy, failing]);

    const result = await aggregator.fetchAll({ limit: 10 }, FIXED_NOW);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].title).toBe('Healthy Song');
  });

  it('records the failing provider’s own failure without affecting the healthy provider’s metadata', async () => {
    const healthy = new FixedListProvider('healthy', []);
    const failing = new FailingProvider('flaky');
    const aggregator = new CandidateAggregator([healthy, failing]);

    const result = await aggregator.fetchAll({ limit: 10 }, FIXED_NOW);

    const healthyMeta = result.providerMetadata.find((m) => m.providerName === 'healthy');
    const flakyMeta = result.providerMetadata.find((m) => m.providerName === 'flaky');

    expect(healthyMeta).toEqual({ providerName: 'healthy', lastSuccessAt: FIXED_NOW.toISOString(), lastFailureAt: null });
    expect(flakyMeta).toEqual({ providerName: 'flaky', lastSuccessAt: null, lastFailureAt: FIXED_NOW.toISOString() });
  });

  it('does not throw even when every provider fails', async () => {
    const aggregator = new CandidateAggregator([new FailingProvider('a'), new FailingProvider('b')]);
    await expect(aggregator.fetchAll({ limit: 10 }, FIXED_NOW)).resolves.toEqual({
      candidates: [],
      providerMetadata: [
        { providerName: 'a', lastSuccessAt: null, lastFailureAt: FIXED_NOW.toISOString() },
        { providerName: 'b', lastSuccessAt: null, lastFailureAt: FIXED_NOW.toISOString() },
      ],
    });
  });
});

describe('CandidateAggregator — metadata preservation on dedup (M3 Rule 6)', () => {
  it('merges two providers’ view of "the same song" into one candidate without dropping either contribution', async () => {
    const providerA = new FixedListProvider('lastfm', [candidate('lf-1', 'Same Song', ['Same Artist'], 'lastfm', { lastfmPlaycount: 900 })]);
    const providerB = new FixedListProvider('listenbrainz', [
      candidate('lb-1', 'same song', ['same artist'], 'listenbrainz', { listenbrainzScore: 0.7 }),
    ]);

    const result = await new CandidateAggregator([providerA, providerB]).fetchAll({ limit: 10 }, FIXED_NOW);

    expect(result.candidates).toHaveLength(1);
    const merged = result.candidates[0];
    expect(merged.contributions).toHaveLength(2);

    const fromLastfm = merged.contributions.find((c) => c.providerName === 'lastfm');
    const fromListenbrainz = merged.contributions.find((c) => c.providerName === 'listenbrainz');
    expect(fromLastfm?.rawMetadata).toEqual({ lastfmPlaycount: 900 });
    expect(fromListenbrainz?.rawMetadata).toEqual({ listenbrainzScore: 0.7 });
  });

  it('treats accents, casing and punctuation as the same track for matching purposes', async () => {
    const providerA = new FixedListProvider('a', [candidate('a1', 'Beyonce - Halo (Remix)', ['Beyonce'], 'a', {})]);
    const providerB = new FixedListProvider('b', [candidate('b1', 'beyonce halo remix', ['BEYONCE'], 'b', {})]);

    const result = await new CandidateAggregator([providerA, providerB]).fetchAll({ limit: 10 }, FIXED_NOW);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].contributions).toHaveLength(2);
  });

  it('keeps three-way agreement fully intact — no contribution lost regardless of provider count', async () => {
    const make = (name: string) => new FixedListProvider(name, [candidate(`${name}-1`, 'Triple Song', ['Triple Artist'], name, { from: name })]);
    const result = await new CandidateAggregator([make('p1'), make('p2'), make('p3')]).fetchAll({ limit: 10 }, FIXED_NOW);

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].contributions).toHaveLength(3);
    expect(result.candidates[0].contributions.map((c) => c.providerName).sort()).toEqual(['p1', 'p2', 'p3']);
  });

  it('does not merge genuinely different songs, even from the same provider', async () => {
    const provider = new FixedListProvider('a', [
      candidate('a1', 'Song One', ['Artist X'], 'a', {}),
      candidate('a2', 'Song Two', ['Artist X'], 'a', {}),
    ]);
    const result = await new CandidateAggregator([provider]).fetchAll({ limit: 10 }, FIXED_NOW);
    expect(result.candidates).toHaveLength(2);
  });
});

describe('CandidateAggregator — determinism and no network dependency', () => {
  it('produces identical results for identical inputs, called twice', async () => {
    const provider = new FixedListProvider('a', [candidate('a1', 'Song', ['Artist'], 'a', { x: 1 })]);
    const aggregator = new CandidateAggregator([provider]);

    const first = await aggregator.fetchAll({ limit: 10 }, FIXED_NOW);
    const second = await aggregator.fetchAll({ limit: 10 }, FIXED_NOW);

    expect(second).toEqual(first);
  });

  it('runs entirely from in-memory test doubles — no fetch, no import of any real provider', async () => {
    // The absence of any network call is structural here, not asserted at
    // runtime: FixedListProvider and FailingProvider never touch fetch/XHR.
    // This test exists to document that guarantee alongside the others.
    const result = await new CandidateAggregator([]).fetchAll({ limit: 10 }, FIXED_NOW);
    expect(result).toEqual({ candidates: [], providerMetadata: [] });
  });
});
