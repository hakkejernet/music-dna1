import { describe, expect, it } from 'vitest';
import type { LearningEvent } from '../feedbackPipeline';
import { validateSignalVector, type SignalVector, type TrackDNA } from '../trackDna';
import type { UserDNA } from '../userDna';
import { DEFAULT_LEARNING_STRATEGIES, learn } from './learningEngine';
import { durationLearningStrategy } from './strategies/durationLearningStrategy';
import { explicitnessLearningStrategy } from './strategies/explicitnessLearningStrategy';
import { genreLearningStrategy } from './strategies/genreLearningStrategy';
import { mainstreamLearningStrategy } from './strategies/mainstreamLearningStrategy';
import type { LearningStrategy } from './types';

const PREVIOUS_UPDATED_AT = '2025-01-01T00:00:00.000Z';
const EVENT_RECORDED_AT = '2026-01-01T00:00:00.000Z';

const buildUserDna = (signals: Partial<SignalVector> = {}): UserDNA => ({
  userId: 'user-1',
  signals: validateSignalVector(signals),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: PREVIOUS_UPDATED_AT,
});

const buildTrackDna = (signals: Partial<SignalVector> = {}): TrackDNA => ({
  trackId: 'track-1',
  signals: validateSignalVector(signals),
  sourceCandidateRef: 'track-1',
  enrichmentCompleteness: 0,
});

const buildLearningEvent = (overrides: Partial<LearningEvent> = {}): LearningEvent => ({
  eventId: 'evt_test',
  candidateRef: 'c1',
  trackDnaRef: 'track-1',
  reactionType: 'save',
  recordedAt: EVENT_RECORDED_AT,
  ...overrides,
});

describe('learn — immutability (M8 Rule 3)', () => {
  it('never mutates the input UserDNA and returns a new instance', () => {
    const userDna = buildUserDna({ rock: { value: 0.2, confidence: 0.2 } });
    const before = JSON.parse(JSON.stringify(userDna));
    const trackDna = buildTrackDna({ rock: { value: 1, confidence: 1 } });

    const result = learn(DEFAULT_LEARNING_STRATEGIES, userDna, buildLearningEvent(), trackDna);

    expect(userDna).toEqual(before);
    expect(result).not.toBe(userDna);
    expect(result.signals).not.toBe(userDna.signals);
  });
});

describe('learn — determinism (M8 Rule 9)', () => {
  it('produces byte-identical output for identical (userDna, learningEvent, trackDna), called twice', () => {
    const userDna = buildUserDna({ rock: { value: 0.2, confidence: 0.2 } });
    const trackDna = buildTrackDna({ rock: { value: 0.9, confidence: 0.8 } });
    const event = buildLearningEvent();

    const first = learn(DEFAULT_LEARNING_STRATEGIES, userDna, event, trackDna);
    const second = learn(DEFAULT_LEARNING_STRATEGIES, userDna, event, trackDna);

    expect(second).toEqual(first);
  });
});

describe('learn — strategy independence (M8 Rule 6)', () => {
  it('GenreLearningStrategy changes only genre signals, never mainstream/explicitness/duration', () => {
    const userDna = buildUserDna({
      rock: { value: 0, confidence: 0.5 },
      mainstream: { value: 0.5, confidence: 0.5 },
      explicitness: { value: 0.5, confidence: 0.5 },
      songLength: { value: 0.5, confidence: 0.5 },
    });
    const trackDna = buildTrackDna({
      rock: { value: 1, confidence: 1 },
      mainstream: { value: 1, confidence: 1 },
      explicitness: { value: 1, confidence: 1 },
      songLength: { value: 1, confidence: 1 },
    });

    const result = learn([genreLearningStrategy], userDna, buildLearningEvent(), trackDna);

    expect(result.signals.rock).not.toEqual(userDna.signals.rock);
    expect(result.signals.mainstream).toEqual(userDna.signals.mainstream);
    expect(result.signals.explicitness).toEqual(userDna.signals.explicitness);
    expect(result.signals.songLength).toEqual(userDna.signals.songLength);
  });

  it('rejects two strategies claiming the same signal', () => {
    const a: LearningStrategy = { strategyName: 'A', ownedSignals: ['mainstream'], learn: () => ({}) };
    const b: LearningStrategy = { strategyName: 'B', ownedSignals: ['mainstream'], learn: () => ({}) };

    expect(() => learn([a, b], buildUserDna(), buildLearningEvent(), buildTrackDna())).toThrow(/mainstream/);
  });

  it('discards any signal a strategy returns outside its own declared ownership', () => {
    const outOfContract: LearningStrategy = {
      strategyName: 'OutOfContract',
      ownedSignals: ['mainstream'],
      learn: () => ({
        mainstream: { value: 0.9, confidence: 0.9 },
        tempo: { value: 0.9, confidence: 0.9 },
      }),
    };
    const userDna = buildUserDna();
    const result = learn([outOfContract], userDna, buildLearningEvent(), buildTrackDna({ mainstream: { value: 1, confidence: 1 } }));

    expect(result.signals.mainstream).toEqual({ value: 0.9, confidence: 0.9 });
    // "tempo" was returned but never declared — must stay untouched.
    expect(result.signals.tempo).toEqual(userDna.signals.tempo);
  });

  it('one throwing strategy never blocks the others', () => {
    const throwing: LearningStrategy = {
      strategyName: 'Throwing',
      ownedSignals: ['songLength'],
      learn: () => {
        throw new Error('boom');
      },
    };
    const userDna = buildUserDna();
    const trackDna = buildTrackDna({ rock: { value: 1, confidence: 1 } });

    const result = learn([genreLearningStrategy, throwing], userDna, buildLearningEvent(), trackDna);

    expect(result.signals.rock).not.toEqual(userDna.signals.rock);
    expect(result.signals.songLength).toEqual(userDna.signals.songLength);
  });
});

describe('learn — missing TrackDNA is normal (M8 Rule 7)', () => {
  it('returns an unchanged (but new-instance) UserDNA when trackDna is entirely null', () => {
    const userDna = buildUserDna({ rock: { value: 0.3, confidence: 0.4 } });
    const result = learn(DEFAULT_LEARNING_STRATEGIES, userDna, buildLearningEvent(), null);

    expect(result.signals).toEqual(userDna.signals);
    expect(result.version).toBe(userDna.version);
    expect(result.updatedAt).toBe(userDna.updatedAt);
    expect(result.coldStart).toBe(userDna.coldStart);
    expect(result).not.toBe(userDna);
  });

  it('never throws when trackDna has no data for any owned signal', () => {
    const userDna = buildUserDna();
    const emptyTrackDna = buildTrackDna();
    expect(() => learn(DEFAULT_LEARNING_STRATEGIES, userDna, buildLearningEvent(), emptyTrackDna)).not.toThrow();
  });

  it('a single unknown signal within genre leaves that one signal unchanged, without affecting sibling genre signals that do have data', () => {
    const userDna = buildUserDna({
      rock: { value: 0.2, confidence: 0.3 },
      pop: { value: 0.2, confidence: 0.3 },
    });
    // Only "rock" has TrackDNA data — "pop" is entirely unknown for this track.
    const trackDna = buildTrackDna({ rock: { value: 1, confidence: 1 } });

    const result = learn([genreLearningStrategy], userDna, buildLearningEvent(), trackDna);

    expect(result.signals.rock).not.toEqual(userDna.signals.rock);
    expect(result.signals.pop).toEqual(userDna.signals.pop);
  });
});

describe('learn — the engine contains no domain-specific rules (M8 Rule 5)', () => {
  it('applies whatever a custom strategy says verbatim — the engine adds no signal-specific behavior of its own', () => {
    const fixedResultStrategy: LearningStrategy = {
      strategyName: 'FixedResult',
      ownedSignals: ['mainstream'],
      learn: () => ({ mainstream: { value: 0.42, confidence: 0.77 } }),
    };

    const result = learn([fixedResultStrategy], buildUserDna(), buildLearningEvent(), buildTrackDna());

    expect(result.signals.mainstream).toEqual({ value: 0.42, confidence: 0.77 });
  });

  it('with zero strategies, nothing changes at all — the engine has no fallback logic of its own', () => {
    const userDna = buildUserDna({ rock: { value: 0.5, confidence: 0.5 } });
    const trackDna = buildTrackDna({ rock: { value: 1, confidence: 1 } });

    const result = learn([], userDna, buildLearningEvent(), trackDna);

    expect(result.signals).toEqual(userDna.signals);
  });
});

describe('learn — reaction weight (M8 Rule 8: SAVE/REJECT/KNOWN handled uniformly)', () => {
  it('save moves the value toward the track and increases confidence', () => {
    const userDna = buildUserDna({ mainstream: { value: 0.2, confidence: 0.2 } });
    const trackDna = buildTrackDna({ mainstream: { value: 1, confidence: 1 } });

    const result = learn([mainstreamLearningStrategy], userDna, buildLearningEvent({ reactionType: 'save' }), trackDna);

    expect(result.signals.mainstream.value).toBeGreaterThan(userDna.signals.mainstream.value);
    expect(result.signals.mainstream.confidence).toBeGreaterThan(userDna.signals.mainstream.confidence);
  });

  it('reject moves the value away from the track, while still increasing confidence', () => {
    const userDna = buildUserDna({ mainstream: { value: 0.5, confidence: 0.2 } });
    const trackDna = buildTrackDna({ mainstream: { value: 1, confidence: 1 } });

    const result = learn([mainstreamLearningStrategy], userDna, buildLearningEvent({ reactionType: 'reject' }), trackDna);

    expect(result.signals.mainstream.value).toBeLessThan(userDna.signals.mainstream.value);
    expect(result.signals.mainstream.confidence).toBeGreaterThan(userDna.signals.mainstream.confidence);
  });

  it('moves the value less per reaction as confidence rises — repeated similar reactions stabilize (TDS ADR-05)', () => {
    let userDna = buildUserDna({ mainstream: { value: 0.1, confidence: 0.1 } });
    const trackDna = buildTrackDna({ mainstream: { value: 1, confidence: 1 } });

    const movements: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const before = userDna.signals.mainstream.value;
      userDna = learn([mainstreamLearningStrategy], userDna, buildLearningEvent({ reactionType: 'save' }), trackDna);
      movements.push(userDna.signals.mainstream.value - before);
    }

    for (let i = 1; i < movements.length; i += 1) {
      expect(movements[i]).toBeLessThan(movements[i - 1]);
    }
  });

  it('known changes nothing at all — same grounding as v1\'s "Kendte allerede", which never touched preferences', () => {
    const userDna = buildUserDna({ mainstream: { value: 0.5, confidence: 0.2 } });
    const trackDna = buildTrackDna({ mainstream: { value: 1, confidence: 1 } });

    const result = learn([mainstreamLearningStrategy], userDna, buildLearningEvent({ reactionType: 'known' }), trackDna);

    expect(result.signals.mainstream).toEqual(userDna.signals.mainstream);
  });

  it('every default strategy handles all three reaction types without throwing', () => {
    for (const strategy of [genreLearningStrategy, mainstreamLearningStrategy, explicitnessLearningStrategy, durationLearningStrategy]) {
      for (const reactionType of ['save', 'reject', 'known'] as const) {
        expect(() =>
          learn([strategy], buildUserDna(), buildLearningEvent({ reactionType }), buildTrackDna({ [strategy.ownedSignals[0]]: { value: 1, confidence: 1 } })),
        ).not.toThrow();
      }
    }
  });
});

describe('learn — version/coldStart/updatedAt transitions', () => {
  it('bumps version, clears coldStart, and stamps updatedAt from the event when something actually changed', () => {
    const userDna = buildUserDna({ rock: { value: 0, confidence: 0.2 } });
    const trackDna = buildTrackDna({ rock: { value: 1, confidence: 1 } });

    const result = learn([genreLearningStrategy], userDna, buildLearningEvent({ recordedAt: EVENT_RECORDED_AT }), trackDna);

    expect(result.version).toBe(userDna.version + 1);
    expect(result.coldStart).toBe(false);
    expect(result.updatedAt).toBe(EVENT_RECORDED_AT);
  });

  it('leaves version/coldStart/updatedAt untouched when nothing changed (e.g. a "known" reaction)', () => {
    const userDna = buildUserDna({ rock: { value: 0, confidence: 0.2 } });
    const trackDna = buildTrackDna({ rock: { value: 1, confidence: 1 } });

    const result = learn([genreLearningStrategy], userDna, buildLearningEvent({ reactionType: 'known' }), trackDna);

    expect(result.version).toBe(userDna.version);
    expect(result.coldStart).toBe(userDna.coldStart);
    expect(result.updatedAt).toBe(userDna.updatedAt);
  });
});
