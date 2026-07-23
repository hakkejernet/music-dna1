import { describe, expect, it } from 'vitest';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure } from '../../domainErrors';
import type { RecommendationMemoryRepository } from '../../persistence';
import type { RecommendationMemoryEntry } from '../../recommendationMemory';
import { failure, success, type Result } from '../../result';
import { RecordRecommendationOutcome } from './recordRecommendationOutcome';

const NOW = new Date('2026-01-01T00:00:00.000Z');

class FakeRecommendationMemoryRepository implements RecommendationMemoryRepository {
  public putCalls: RecommendationMemoryEntry[] = [];
  private stored: RecommendationMemoryEntry | null;
  private readonly failNextGet: RepositoryFailure | null;
  private readonly failNextPut: RepositoryFailure | null;

  constructor(stored: RecommendationMemoryEntry | null = null, options: { failNextGet?: RepositoryFailure; failNextPut?: RepositoryFailure } = {}) {
    this.stored = stored;
    this.failNextGet = options.failNextGet ?? null;
    this.failNextPut = options.failNextPut ?? null;
  }

  async get(): Promise<Result<RecommendationMemoryEntry | null, RepositoryFailure>> {
    if (this.failNextGet) return failure(this.failNextGet);
    return success(this.stored);
  }

  async put(entry: RecommendationMemoryEntry): Promise<Result<void, RepositoryFailure>> {
    if (this.failNextPut) return failure(this.failNextPut);
    this.putCalls.push(entry);
    this.stored = entry;
    return success(undefined);
  }
}

describe('RecordRecommendationOutcome — the write side of Recommendation Memory (M29)', () => {
  it('writes a new entry when none existed', async () => {
    const repository = new FakeRecommendationMemoryRepository(null);
    const useCase = new RecordRecommendationOutcome(repository);

    const result = await useCase.execute('c1', 'reject', NOW);

    expect(result.success).toBe(true);
    expect(repository.putCalls).toHaveLength(1);
    expect(repository.putCalls[0].candidateId).toBe('c1');
    expect(repository.putCalls[0].lastOutcome).toBe('reject');
  });

  it('overwrites an existing non-save entry normally', async () => {
    const existing: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'known', lastOutcomeAt: '2025-01-01T00:00:00.000Z', suppressedUntil: '2025-01-31T00:00:00.000Z' };
    const repository = new FakeRecommendationMemoryRepository(existing);
    const useCase = new RecordRecommendationOutcome(repository);

    const result = await useCase.execute('c1', 'reject', NOW);

    expect(result.success).toBe(true);
    expect(repository.putCalls).toHaveLength(1);
    expect(repository.putCalls[0].lastOutcome).toBe('reject');
  });

  it('ignores the write entirely when the existing entry is a save — ownership is immutable (M29 Rule 2)', async () => {
    const existing: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'save', lastOutcomeAt: '2025-01-01T00:00:00.000Z', suppressedUntil: null };
    const repository = new FakeRecommendationMemoryRepository(existing);
    const useCase = new RecordRecommendationOutcome(repository);

    const result = await useCase.execute('c1', 'reject', NOW);

    expect(result).toEqual(success(undefined));
    expect(repository.putCalls).toHaveLength(0);
  });

  it('propagates a get() failure without ever calling put()', async () => {
    const theFailure = repositoryFailure('RecommendationMemoryRepository.get', 'simulated outage');
    const repository = new FakeRecommendationMemoryRepository(null, { failNextGet: theFailure });
    const useCase = new RecordRecommendationOutcome(repository);

    const result = await useCase.execute('c1', 'reject', NOW);

    expect(result).toEqual(failure(theFailure));
    expect(repository.putCalls).toHaveLength(0);
  });

  it('propagates a put() failure unchanged', async () => {
    const theFailure = repositoryFailure('RecommendationMemoryRepository.put', 'simulated outage');
    const repository = new FakeRecommendationMemoryRepository(null, { failNextPut: theFailure });
    const useCase = new RecordRecommendationOutcome(repository);

    const result = await useCase.execute('c1', 'reject', NOW);

    expect(result).toEqual(failure(theFailure));
  });
});
