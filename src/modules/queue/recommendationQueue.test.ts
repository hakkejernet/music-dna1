import { describe, expect, it } from 'vitest';
import type { RankedCandidate } from '../rankingEngine';
import { RecommendationQueue } from './recommendationQueue';

const makeRanked = (candidateRef: string, score: number): RankedCandidate => ({
  candidateRef,
  trackDnaRef: `track-${candidateRef}`,
  score,
  scoreBreakdown: { genreMatch: 0, mainstreamMatch: 0, explicitMatch: 0, durationMatch: 0 },
  explanations: [],
  rankedAt: '2026-01-01T00:00:00.000Z',
});

const THREE_RANKED = [makeRanked('c1', 90), makeRanked('c2', 70), makeRanked('c3', 50)];

describe('RecommendationQueue — immutability (M6 Rule 8)', () => {
  it('next() never mutates the queue it was called on — it returns a new instance', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const before = queue.current();

    const advanced = queue.next();

    expect(queue.current()).toEqual(before);
    expect(queue).not.toBe(advanced);
    expect(advanced.current()).not.toEqual(before);
  });

  it('react() never mutates the queue it was called on — it returns a new instance via the result', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const before = queue.current();

    const { queue: nextQueue } = queue.react('save');

    expect(queue.current()).toEqual(before);
    expect(queue).not.toBe(nextQueue);
  });

  it('mutating the array passed to create() afterward never affects the queue', () => {
    const items = [makeRanked('c1', 90), makeRanked('c2', 70)];
    const queue = RecommendationQueue.create(items);

    items.push(makeRanked('intruder', 999));
    items[0] = makeRanked('replaced', 1);

    expect(queue.current()?.candidateRef).toBe('c1');
    expect(queue.remaining()).toBe(2);
  });

  it('never mutates any RankedCandidate it holds', () => {
    const ranked = makeRanked('c1', 90);
    const before = JSON.parse(JSON.stringify(ranked));
    const queue = RecommendationQueue.create([ranked]);

    queue.next();
    queue.react('reject');

    expect(ranked).toEqual(before);
  });
});

describe('RecommendationQueue — determinism (M6 Rule 3)', () => {
  it('produces identical results for two independently-built queues driven through the same actions', () => {
    const driveThroughAll = (queue: RecommendationQueue): Array<string | null> => {
      const seen: Array<string | null> = [];
      let current = queue;
      for (let i = 0; i < THREE_RANKED.length + 1; i += 1) {
        seen.push(current.current()?.candidateRef ?? null);
        current = current.next();
      }
      return seen;
    };

    const queueA = RecommendationQueue.create(THREE_RANKED);
    const queueB = RecommendationQueue.create(THREE_RANKED);

    expect(driveThroughAll(queueA)).toEqual(driveThroughAll(queueB));
  });
});

describe('RecommendationQueue — navigation (M6 Rule 6)', () => {
  it('current() starts at the first item in the given (already-ranked) order', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    expect(queue.current()?.candidateRef).toBe('c1');
  });

  it('peek() shows the next item without advancing', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    expect(queue.peek()?.candidateRef).toBe('c2');
    expect(queue.current()?.candidateRef).toBe('c1');
  });

  it('next() advances exactly one position at a time, in order', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const afterOne = queue.next();
    const afterTwo = afterOne.next();

    expect(afterOne.current()?.candidateRef).toBe('c2');
    expect(afterTwo.current()?.candidateRef).toBe('c3');
  });

  it('remaining() counts current plus everything still ahead', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    expect(queue.remaining()).toBe(3);
    expect(queue.next().remaining()).toBe(2);
    expect(queue.next().next().next().remaining()).toBe(0);
  });

  it('never wraps back to the start once exhausted (non-cyclic)', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const exhausted = queue.next().next().next();

    expect(exhausted.current()).toBeNull();
    expect(exhausted.next().current()).toBeNull();
    expect(exhausted.next().remaining()).toBe(0);
  });
});

describe('RecommendationQueue — empty queue is normal (M6 Rule 7)', () => {
  it('current(), peek() are null and remaining() is 0 for an empty queue — never a throw', () => {
    const queue = RecommendationQueue.create([]);

    expect(() => queue.current()).not.toThrow();
    expect(queue.current()).toBeNull();
    expect(queue.peek()).toBeNull();
    expect(queue.remaining()).toBe(0);
  });

  it('next() on an empty queue stays empty rather than throwing or wrapping', () => {
    const queue = RecommendationQueue.create([]);
    expect(() => queue.next()).not.toThrow();
    expect(queue.next().current()).toBeNull();
  });

  it('react() on an empty queue returns a null event and an unchanged queue, never a throw', () => {
    const queue = RecommendationQueue.create([]);
    const result = queue.react('save');

    expect(result.event).toBeNull();
    expect(result.queue.remaining()).toBe(0);
  });

  it('an exhausted (non-empty-origin) queue behaves identically to a truly empty one', () => {
    const queue = RecommendationQueue.create([makeRanked('c1', 90)]).next();
    const result = queue.react('known');

    expect(result.event).toBeNull();
    expect(result.queue.current()).toBeNull();
  });
});

describe('RecommendationQueue — feedback is returned only as events (M6 Rule 5)', () => {
  it('react() returns a plain event describing the reaction, nothing more', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const { event } = queue.react('save');

    expect(event).toEqual({ candidateRef: 'c1', trackDnaRef: 'track-c1', reactionType: 'save' });
  });

  it('supports all three named reaction types identically at the queue level', () => {
    for (const reactionType of ['save', 'reject', 'known'] as const) {
      const queue = RecommendationQueue.create(THREE_RANKED);
      const { event } = queue.react(reactionType);
      expect(event?.reactionType).toBe(reactionType);
    }
  });

  it('reacting advances past the reacted-to candidate — a decided candidate is never shown again this session', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const { queue: afterReaction } = queue.react('reject');

    expect(afterReaction.current()?.candidateRef).toBe('c2');
  });

  it('the returned event carries no score, breakdown, or DNA data — only identity and the reaction itself', () => {
    const queue = RecommendationQueue.create(THREE_RANKED);
    const { event } = queue.react('save');

    expect(Object.keys(event ?? {}).sort()).toEqual(['candidateRef', 'reactionType', 'trackDnaRef']);
  });
});
