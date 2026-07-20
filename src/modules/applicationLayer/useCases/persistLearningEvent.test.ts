import { describe, expect, it } from 'vitest';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure } from '../../domainErrors';
import type { LearningEvent } from '../../feedbackPipeline';
import { buildAppContext } from '../../infrastructure';
import type { LearningEventRepository } from '../../persistence';
import { failure, success, type Result } from '../../result';
import { PersistLearningEvent } from './persistLearningEvent';

const buildLearningEvent = (eventId: string): LearningEvent => ({
  eventId,
  candidateRef: 'candidate-1',
  trackDnaRef: 'track-1',
  reactionType: 'save',
  recordedAt: '2026-01-01T00:00:00.000Z',
});

class FakeLearningEventRepository implements LearningEventRepository {
  public savedItems: LearningEvent[] = [];
  private readonly failNextSave: RepositoryFailure | null;

  constructor(failNextSave: RepositoryFailure | null = null) {
    this.failNextSave = failNextSave;
  }

  async save(item: LearningEvent): Promise<Result<void, RepositoryFailure>> {
    if (this.failNextSave) return failure(this.failNextSave);
    this.savedItems.push(item);
    return success(undefined);
  }

  async getById(id: string): Promise<Result<LearningEvent | null, RepositoryFailure>> {
    return success(this.savedItems.find((item) => item.eventId === id) ?? null);
  }

  async getAll(): Promise<Result<LearningEvent[], RepositoryFailure>> {
    return success(this.savedItems);
  }
}

describe('PersistLearningEvent — dependency injection, no domain logic (M10 Rule 1/2/4)', () => {
  it('passes the given LearningEvent straight through to the injected repository, unmodified', async () => {
    const fakeRepository = new FakeLearningEventRepository();
    const learningEvent = buildLearningEvent('evt-1');

    const result = await new PersistLearningEvent(fakeRepository).execute(learningEvent);

    expect(result).toEqual(success(undefined));
    expect(fakeRepository.savedItems).toEqual([learningEvent]);
  });

  it('never mutates the LearningEvent it was given (M10 Rule 7)', async () => {
    const learningEvent = buildLearningEvent('evt-1');
    const before = JSON.parse(JSON.stringify(learningEvent));

    await new PersistLearningEvent(new FakeLearningEventRepository()).execute(learningEvent);

    expect(learningEvent).toEqual(before);
  });
});

describe('PersistLearningEvent — error propagation (M12 Rule 4)', () => {
  it('propagates a RepositoryFailure unchanged, never swallowing it', async () => {
    const theFailure = repositoryFailure('LearningEventRepository.save', 'simulated storage outage');
    const useCase = new PersistLearningEvent(new FakeLearningEventRepository(theFailure));

    expect(await useCase.execute(buildLearningEvent('evt-1'))).toEqual(failure(theFailure));
  });
});

describe('PersistLearningEvent — repository swappability (M10 Rule 4, M11 Rule 4/8)', () => {
  it('works identically against a fake and against the real repository the Composition Root wires (M11)', async () => {
    const learningEvent = buildLearningEvent('evt-1');

    const fakeRepository = new FakeLearningEventRepository();
    await new PersistLearningEvent(fakeRepository).execute(learningEvent);

    // Only buildAppContext() names a concrete implementation — this
    // test never imports InMemoryLearningEventRepository directly.
    const { repositories } = buildAppContext();
    await new PersistLearningEvent(repositories.learningEventRepository).execute(learningEvent);

    expect(await repositories.learningEventRepository.getById('evt-1')).toEqual(success(learningEvent));
    expect(fakeRepository.savedItems[0]).toEqual(learningEvent);
  });
});
