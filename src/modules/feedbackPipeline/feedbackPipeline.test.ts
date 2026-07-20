import { describe, expect, it } from 'vitest';
import { computeEventId, processReactionEvent } from './feedbackPipeline';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');
const LATER_NOW = new Date('2026-06-15T12:30:00.000Z');

const validEvent = { candidateRef: 'c1', trackDnaRef: 'track-c1', reactionType: 'save' };

describe('processReactionEvent — determinism (M7 Rule 5)', () => {
  it('produces byte-identical output for identical input at identical now, called twice', () => {
    const first = processReactionEvent(validEvent, FIXED_NOW);
    const second = processReactionEvent(validEvent, FIXED_NOW);
    expect(second).toEqual(first);
  });
});

describe('processReactionEvent — idempotency (M7 Rule 6)', () => {
  it('gives the same eventId for the same event even when reprocessed at a different time', () => {
    const first = processReactionEvent(validEvent, FIXED_NOW);
    const second = processReactionEvent(validEvent, LATER_NOW);

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    if (!first.accepted || !second.accepted) throw new Error('unreachable');

    expect(second.learningEvent.eventId).toBe(first.learningEvent.eventId);
    // The two are still distinguishable in time — idempotency identifies
    // *which* reaction this is, it does not pretend the two calls never happened.
    expect(second.learningEvent.recordedAt).not.toBe(first.learningEvent.recordedAt);
  });

  it('computeEventId alone is a pure function of the event content, not of any call order or timing', () => {
    const a = computeEventId('c1', 'track-c1', 'save');
    const b = computeEventId('c1', 'track-c1', 'save');
    const different = computeEventId('c2', 'track-c1', 'save');

    expect(a).toBe(b);
    expect(a).not.toBe(different);
  });

  it('gives different reaction types on the same candidate different, but each internally stable, ids', () => {
    const saveId = computeEventId('c1', 'track-c1', 'save');
    const rejectId = computeEventId('c1', 'track-c1', 'reject');

    expect(saveId).not.toBe(rejectId);
    expect(computeEventId('c1', 'track-c1', 'reject')).toBe(rejectId);
  });
});

describe('processReactionEvent — validation and rejection of invalid events (M7 Rule 4)', () => {
  it.each([null, undefined, 'a string', 42, ['array', 'is', 'not', 'a', 'record']])('rejects %p as not-an-object', (badInput) => {
    const result = processReactionEvent(badInput, FIXED_NOW);
    expect(result).toEqual({ accepted: false, reason: 'not-an-object' });
  });

  it('rejects an event missing candidateRef', () => {
    const result = processReactionEvent({ trackDnaRef: 'track-c1', reactionType: 'save' }, FIXED_NOW);
    expect(result).toEqual({ accepted: false, reason: 'missing-candidate-ref' });
  });

  it('rejects an event with an empty or whitespace-only candidateRef', () => {
    expect(processReactionEvent({ ...validEvent, candidateRef: '' }, FIXED_NOW)).toEqual({
      accepted: false,
      reason: 'missing-candidate-ref',
    });
    expect(processReactionEvent({ ...validEvent, candidateRef: '   ' }, FIXED_NOW)).toEqual({
      accepted: false,
      reason: 'missing-candidate-ref',
    });
  });

  it('rejects an event missing trackDnaRef', () => {
    const result = processReactionEvent({ candidateRef: 'c1', reactionType: 'save' }, FIXED_NOW);
    expect(result).toEqual({ accepted: false, reason: 'missing-track-dna-ref' });
  });

  it('rejects an event with an unrecognized reactionType', () => {
    const result = processReactionEvent({ ...validEvent, reactionType: 'like' }, FIXED_NOW);
    expect(result).toEqual({ accepted: false, reason: 'invalid-reaction-type' });
  });

  it('rejects an event missing reactionType entirely', () => {
    const result = processReactionEvent({ candidateRef: 'c1', trackDnaRef: 'track-c1' }, FIXED_NOW);
    expect(result).toEqual({ accepted: false, reason: 'invalid-reaction-type' });
  });

  it('never throws, regardless of how malformed the input is', () => {
    for (const badInput of [null, undefined, 42, {}, { candidateRef: 123 }, { candidateRef: 'c1', reactionType: {} }]) {
      expect(() => processReactionEvent(badInput, FIXED_NOW)).not.toThrow();
    }
  });
});

describe('processReactionEvent — valid events become LearningEvents (M7 Rule 3)', () => {
  it('produces a fully-populated LearningEvent for a valid event', () => {
    const result = processReactionEvent(validEvent, FIXED_NOW);

    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('unreachable');
    expect(result.learningEvent).toEqual({
      eventId: computeEventId('c1', 'track-c1', 'save'),
      candidateRef: 'c1',
      trackDnaRef: 'track-c1',
      reactionType: 'save',
      recordedAt: FIXED_NOW.toISOString(),
    });
  });

  it('accepts all three named reaction types', () => {
    for (const reactionType of ['save', 'reject', 'known'] as const) {
      const result = processReactionEvent({ ...validEvent, reactionType }, FIXED_NOW);
      expect(result.accepted).toBe(true);
    }
  });

  it('normalizes surrounding whitespace on ref fields (M7 Rule 4: normalisér)', () => {
    const result = processReactionEvent({ candidateRef: '  c1  ', trackDnaRef: '  track-c1  ', reactionType: 'save' }, FIXED_NOW);
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('unreachable');
    expect(result.learningEvent.candidateRef).toBe('c1');
    expect(result.learningEvent.trackDnaRef).toBe('track-c1');
  });

  it('ignores unrecognized extra fields rather than rejecting the event (M7 Rule 7: minimal metadata is normal)', () => {
    const result = processReactionEvent({ ...validEvent, sessionRef: 'unexpected', score: 999 }, FIXED_NOW);
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('unreachable');
    expect(Object.keys(result.learningEvent).sort()).toEqual(['candidateRef', 'eventId', 'reactionType', 'recordedAt', 'trackDnaRef']);
  });
});

describe('processReactionEvent — UserDNA is never touched (M7 Rule 1)', () => {
  it('the LearningEvent shape carries no DNA/signal data of any kind', () => {
    const result = processReactionEvent(validEvent, FIXED_NOW);
    expect(result.accepted).toBe(true);
    if (!result.accepted) throw new Error('unreachable');

    const keys = Object.keys(result.learningEvent);
    expect(keys).not.toContain('signals');
    expect(keys).not.toContain('userDna');
    expect(keys.sort()).toEqual(['candidateRef', 'eventId', 'reactionType', 'recordedAt', 'trackDnaRef']);
  });

  it('processing many events in sequence never accumulates or mutates any shared state', () => {
    const events = [
      { candidateRef: 'c1', trackDnaRef: 't1', reactionType: 'save' },
      { candidateRef: 'c2', trackDnaRef: 't2', reactionType: 'reject' },
      { candidateRef: 'c1', trackDnaRef: 't1', reactionType: 'save' },
    ];
    const results = events.map((event) => processReactionEvent(event, FIXED_NOW));

    expect(results.every((result) => result.accepted)).toBe(true);
    // The two identical reactions produce the same eventId, independent of position in the sequence.
    const firstResult = results[0];
    const thirdResult = results[2];
    if (!firstResult.accepted || !thirdResult.accepted) throw new Error('unreachable');
    expect(thirdResult.learningEvent.eventId).toBe(firstResult.learningEvent.eventId);
  });
});
