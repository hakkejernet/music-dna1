import { describe, expect, it } from 'vitest';
import type { RecommendationMemoryEntry } from '../../recommendationMemory';
import { InMemoryRecommendationMemoryRepository } from './inMemoryRecommendationMemoryRepository';

const entry = (candidateId: string): RecommendationMemoryEntry => ({
  candidateId,
  lastOutcome: 'reject',
  lastOutcomeAt: '2026-01-01T00:00:00.000Z',
  suppressedUntil: '2026-03-02T00:00:00.000Z',
});

describe('InMemoryRecommendationMemoryRepository — exactly get/put, no getAll (M29)', () => {
  it('returns null for an unknown candidateId', async () => {
    const repo = new InMemoryRecommendationMemoryRepository();
    const result = await repo.get('unknown');
    expect(result).toEqual({ success: true, value: null });
  });

  it('put then get returns the same entry', async () => {
    const repo = new InMemoryRecommendationMemoryRepository();
    await repo.put(entry('c1'));
    const result = await repo.get('c1');
    expect(result).toEqual({ success: true, value: entry('c1') });
  });

  it('put overwrites any existing entry for the same candidateId', async () => {
    const repo = new InMemoryRecommendationMemoryRepository();
    await repo.put(entry('c1'));
    const updated: RecommendationMemoryEntry = { ...entry('c1'), lastOutcome: 'save', suppressedUntil: null };
    await repo.put(updated);

    const result = await repo.get('c1');
    expect(result).toEqual({ success: true, value: updated });
  });

  it('returned entries are deep-cloned — mutating the result never affects internal state', async () => {
    const repo = new InMemoryRecommendationMemoryRepository();
    await repo.put(entry('c1'));

    const first = await repo.get('c1');
    if (first.success && first.value) {
      (first.value as { lastOutcome: string }).lastOutcome = 'tampered';
    }

    const second = await repo.get('c1');
    expect(second).toEqual({ success: true, value: entry('c1') });
  });

  it('each instance owns its own store — independent of any other instance', async () => {
    const repoA = new InMemoryRecommendationMemoryRepository();
    const repoB = new InMemoryRecommendationMemoryRepository();
    await repoA.put(entry('c1'));

    expect(await repoB.get('c1')).toEqual({ success: true, value: null });
  });
});
