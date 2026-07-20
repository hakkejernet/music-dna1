import { describe, expect, it } from 'vitest';
import { InMemoryObservationSink } from './inMemoryObservationSink';

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('InMemoryObservationSink — records each observation type as a described event (M13 Rule 2/5)', () => {
  it('recordRecommendationShown() stores a RecommendationShown snapshot with the given data plus a timestamp', () => {
    const sink = new InMemoryObservationSink();
    sink.recordRecommendationShown({ candidateRef: 'c1', trackDnaRef: 't1', score: 72, providerNames: ['lastfm', 'listenbrainz'] }, NOW);

    expect(sink.getAll()).toEqual([
      { type: 'RecommendationShown', candidateRef: 'c1', trackDnaRef: 't1', score: 72, providerNames: ['lastfm', 'listenbrainz'], observedAt: NOW.toISOString() },
    ]);
  });

  it('recordRecommendationAccepted/Rejected/Known() each store their own discriminated shape', () => {
    const sink = new InMemoryObservationSink();
    sink.recordRecommendationAccepted({ candidateRef: 'c1', trackDnaRef: 't1' }, NOW);
    sink.recordRecommendationRejected({ candidateRef: 'c2', trackDnaRef: 't2' }, NOW);
    sink.recordRecommendationKnown({ candidateRef: 'c3', trackDnaRef: 't3' }, NOW);

    expect(sink.getAll()).toEqual([
      { type: 'RecommendationAccepted', candidateRef: 'c1', trackDnaRef: 't1', observedAt: NOW.toISOString() },
      { type: 'RecommendationRejected', candidateRef: 'c2', trackDnaRef: 't2', observedAt: NOW.toISOString() },
      { type: 'RecommendationKnown', candidateRef: 'c3', trackDnaRef: 't3', observedAt: NOW.toISOString() },
    ]);
  });

  it('recordLearningApplied() stores userId/eventId/changed plus a timestamp', () => {
    const sink = new InMemoryObservationSink();
    sink.recordLearningApplied({ userId: 'user-1', eventId: 'evt-1', changed: true }, NOW);

    expect(sink.getAll()).toEqual([{ type: 'LearningApplied', userId: 'user-1', eventId: 'evt-1', changed: true, observedAt: NOW.toISOString() }]);
  });

  it('every record* method returns void — recording can never be branched on by a caller (M13 Rule 1)', () => {
    const sink = new InMemoryObservationSink();
    expect(sink.recordRecommendationShown({ candidateRef: 'c1', trackDnaRef: 't1', score: 50, providerNames: [] }, NOW)).toBeUndefined();
    expect(sink.recordRecommendationAccepted({ candidateRef: 'c1', trackDnaRef: 't1' }, NOW)).toBeUndefined();
  });
});

describe('InMemoryObservationSink — observations are frozen snapshots (M13 Rule 11)', () => {
  it('a stored observation cannot be mutated after creation', () => {
    const sink = new InMemoryObservationSink();
    sink.recordRecommendationShown({ candidateRef: 'c1', trackDnaRef: 't1', score: 50, providerNames: ['lastfm'] }, NOW);

    const [observation] = sink.getAll();
    expect(Object.isFrozen(observation)).toBe(true);
    expect(() => {
      (observation as { score: number }).score = 999;
    }).toThrow();
    expect(sink.getAll()[0]).toEqual(observation);
  });

  it('the providerNames array on a RecommendationShown observation is itself frozen — not just the outer object', () => {
    const sink = new InMemoryObservationSink();
    const originalProviderNames = ['lastfm'];
    sink.recordRecommendationShown({ candidateRef: 'c1', trackDnaRef: 't1', score: 50, providerNames: originalProviderNames }, NOW);

    const [observation] = sink.getAll();
    if (observation.type !== 'RecommendationShown') throw new Error('unreachable');
    expect(Object.isFrozen(observation.providerNames)).toBe(true);

    // Mutating the caller's original array after the call must never affect the stored snapshot either.
    originalProviderNames.push('listenbrainz');
    expect(observation.providerNames).toEqual(['lastfm']);
  });

  it('mutating a returned getAll() array never affects the sink\'s own stored observations', () => {
    const sink = new InMemoryObservationSink();
    sink.recordRecommendationAccepted({ candidateRef: 'c1', trackDnaRef: 't1' }, NOW);

    const firstRead = sink.getAll();
    (firstRead as unknown[]).push('intruder');

    expect(sink.getAll()).toHaveLength(1);
  });
});

describe('InMemoryObservationSink — each instance owns its own, independent state (no singleton, consistent with M9 Rule 8)', () => {
  it('two instances never share observations', () => {
    const sinkOne = new InMemoryObservationSink();
    const sinkTwo = new InMemoryObservationSink();

    sinkOne.recordRecommendationAccepted({ candidateRef: 'c1', trackDnaRef: 't1' }, NOW);

    expect(sinkOne.getAll()).toHaveLength(1);
    expect(sinkTwo.getAll()).toHaveLength(0);
  });
});

describe('InMemoryObservationSink — determinism', () => {
  it('recording the same input at the same now produces byte-identical stored observations across two independent sinks', () => {
    const sinkA = new InMemoryObservationSink();
    const sinkB = new InMemoryObservationSink();
    const input = { candidateRef: 'c1', trackDnaRef: 't1', score: 88, providerNames: ['lastfm'] };

    sinkA.recordRecommendationShown(input, NOW);
    sinkB.recordRecommendationShown(input, NOW);

    expect(sinkA.getAll()).toEqual(sinkB.getAll());
  });
});
