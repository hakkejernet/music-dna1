import { describe, expect, it } from 'vitest';
import type { Candidate } from '../candidateProviders';
import type { EnrichedCandidate } from '../enrichment';
import { validateSignalVector, type SignalVector } from '../trackDna';
import type { UserDNA } from '../userDna';
import { RuleBasedRankingEngine } from './ruleBasedRankingEngine';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

const buildUserDna = (signals: Partial<SignalVector>): UserDNA => ({
  userId: 'user-1',
  signals: validateSignalVector(signals),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: FIXED_NOW.toISOString(),
});

const buildEnrichedCandidate = (candidateId: string, signals: Partial<SignalVector>): EnrichedCandidate => {
  const candidate: Candidate = { candidateId, title: `Song ${candidateId}`, artists: ['Artist'], contributions: [] };
  return {
    candidate,
    trackDna: {
      trackId: candidateId,
      signals: validateSignalVector(signals),
      sourceCandidateRef: candidateId,
      enrichmentCompleteness: 0,
    },
    enrichmentMetadata: { enricherNames: [], signalSources: {}, enrichedAt: FIXED_NOW.toISOString() },
  };
};

describe('RuleBasedRankingEngine — pure function / no mutation (M5 Rule 1)', () => {
  it('never mutates userDna or any candidate, and returns a new array', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const candidate = buildEnrichedCandidate('c1', { rock: { value: 1, confidence: 1 } });
    const userDnaBefore = JSON.parse(JSON.stringify(userDna));
    const candidateBefore = JSON.parse(JSON.stringify(candidate));

    const engine = new RuleBasedRankingEngine();
    const result = engine.rank(userDna, [candidate], FIXED_NOW);

    expect(userDna).toEqual(userDnaBefore);
    expect(candidate).toEqual(candidateBefore);
    expect(Array.isArray(result)).toBe(true);
  });
});

describe('RuleBasedRankingEngine — determinism (M5 Rule 6)', () => {
  it('produces byte-identical output for identical input, called twice', () => {
    const userDna = buildUserDna({ rock: { value: 0.8, confidence: 0.7 }, mainstream: { value: 0.5, confidence: 0.5 } });
    const candidates = [
      buildEnrichedCandidate('c1', { rock: { value: 0.9, confidence: 0.6 } }),
      buildEnrichedCandidate('c2', { rock: { value: 0.2, confidence: 0.9 } }),
    ];
    const engine = new RuleBasedRankingEngine();

    const first = engine.rank(userDna, candidates, FIXED_NOW);
    const second = engine.rank(userDna, candidates, FIXED_NOW);

    expect(second).toEqual(first);
  });
});

describe('RuleBasedRankingEngine — tie-break (M5 Rule 7)', () => {
  it('breaks ties by candidateRef, independent of input array order', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    // Both candidates are an identical perfect match — guaranteed tie.
    const a = buildEnrichedCandidate('candidate-a', { rock: { value: 1, confidence: 1 } });
    const b = buildEnrichedCandidate('candidate-b', { rock: { value: 1, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();

    const forward = engine.rank(userDna, [a, b], FIXED_NOW);
    const reversed = engine.rank(userDna, [b, a], FIXED_NOW);

    expect(forward[0].score).toBe(forward[1].score);
    expect(forward.map((r) => r.candidateRef)).toEqual(['candidate-a', 'candidate-b']);
    expect(reversed.map((r) => r.candidateRef)).toEqual(['candidate-a', 'candidate-b']);
  });

  it('still sorts correctly by score when there is no tie', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const goodMatch = buildEnrichedCandidate('good', { rock: { value: 1, confidence: 1 } });
    const badMatch = buildEnrichedCandidate('bad', { rock: { value: 0, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();

    const result = engine.rank(userDna, [badMatch, goodMatch], FIXED_NOW);

    expect(result.map((r) => r.candidateRef)).toEqual(['good', 'bad']);
  });
});

describe('RuleBasedRankingEngine — score-breakdown (M5 Rule 3)', () => {
  it('includes a breakdown with all four named categories on every RankedCandidate', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const candidate = buildEnrichedCandidate('c1', { rock: { value: 1, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();

    const [result] = engine.rank(userDna, [candidate], FIXED_NOW);

    expect(result.scoreBreakdown).toEqual(
      expect.objectContaining({
        genreMatch: expect.any(Number),
        mainstreamMatch: expect.any(Number),
        explicitMatch: expect.any(Number),
        durationMatch: expect.any(Number),
      }),
    );
  });

  it('produces a non-empty, breakdown-derived explanation whenever any bucket has a positive score', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const candidate = buildEnrichedCandidate('c1', { rock: { value: 1, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();

    const [result] = engine.rank(userDna, [candidate], FIXED_NOW);

    expect(result.explanations.length).toBeGreaterThan(0);
    expect(result.explanations[0]).toContain('Genre-match');
  });

  it('gives an empty explanation list, not a fabricated one, when nothing could be determined', () => {
    const userDna = buildUserDna({});
    const candidate = buildEnrichedCandidate('c1', {});
    const engine = new RuleBasedRankingEngine();

    const [result] = engine.rank(userDna, [candidate], FIXED_NOW);

    expect(result.explanations).toEqual([]);
    expect(result.score).toBe(0);
  });
});

describe('RuleBasedRankingEngine — confidence weighting (M5 Rule 5)', () => {
  it('weighs an identical perfect match lower when confidence is lower', () => {
    const lowConfidenceUser = buildUserDna({ mainstream: { value: 0.5, confidence: 0.2 } });
    const highConfidenceUser = buildUserDna({ mainstream: { value: 0.5, confidence: 0.9 } });
    // Same perfect-match candidate for both comparisons.
    const candidate = buildEnrichedCandidate('c1', { mainstream: { value: 0.5, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();

    const [lowResult] = engine.rank(lowConfidenceUser, [candidate], FIXED_NOW);
    const [highResult] = engine.rank(highConfidenceUser, [candidate], FIXED_NOW);

    expect(lowResult.scoreBreakdown.mainstreamMatch).toBeCloseTo(0.2, 10);
    expect(highResult.scoreBreakdown.mainstreamMatch).toBeCloseTo(0.9, 10);
    expect(lowResult.score).toBeLessThan(highResult.score);
  });

  it('never treats two differently-confident signals as equally certain', () => {
    const userDna = buildUserDna({
      rock: { value: 1, confidence: 0.1 },
      pop: { value: 1, confidence: 0.95 },
    });
    const candidate = buildEnrichedCandidate('c1', {
      rock: { value: 1, confidence: 1 },
      pop: { value: 1, confidence: 1 },
    });
    const engine = new RuleBasedRankingEngine();

    const [result] = engine.rank(userDna, [candidate], FIXED_NOW);

    // Both signals are a perfect value-match, but genreMatch's trust
    // component must reflect that pop was known with far higher
    // confidence than rock, not treat them as interchangeable.
    expect(result.scoreBreakdown.genreMatch).toBeGreaterThan(0);
    expect(result.scoreBreakdown.genreMatch).toBeLessThan(1);
  });
});

describe('RuleBasedRankingEngine — missing signals never cause errors (M5 Rule 4)', () => {
  it('resolves a candidate with completely empty signals to a valid, zeroed RankedCandidate — never a crash', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const candidate = buildEnrichedCandidate('c1', {});
    const engine = new RuleBasedRankingEngine();

    expect(() => engine.rank(userDna, [candidate], FIXED_NOW)).not.toThrow();
    const [result] = engine.rank(userDna, [candidate], FIXED_NOW);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBe(0);
  });

  it('a single unknown signal inside a multi-signal bucket lowers trust without treating the known part as a bad match', () => {
    // Only "rock" has any data; the other 5 genre signals are entirely unknown.
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const candidate = buildEnrichedCandidate('c1', { rock: { value: 1, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();

    const [result] = engine.rank(userDna, [candidate], FIXED_NOW);

    // Perfect match on the one known signal (1/6 coverage) must land
    // strictly between "no idea" (0) and "fully confirmed match" (1).
    expect(result.scoreBreakdown.genreMatch).toBeGreaterThan(0);
    expect(result.scoreBreakdown.genreMatch).toBeLessThan(1);
  });

  it('an empty candidate list ranks to an empty result, not an error', () => {
    const userDna = buildUserDna({ rock: { value: 1, confidence: 1 } });
    const engine = new RuleBasedRankingEngine();
    expect(engine.rank(userDna, [], FIXED_NOW)).toEqual([]);
  });
});
