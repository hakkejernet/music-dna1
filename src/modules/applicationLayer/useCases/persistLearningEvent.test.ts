import { describe, expect, it } from 'vitest';
import type { LearningEvent } from '../../feedbackPipeline';
import { InMemoryLearningEventRepository } from '../../persistence';
import type { LearningEventRepository } from '../../persistence';
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

  async save(item: LearningEvent): Promise<void> {
    this.savedItems.push(item);
  }

  async getById(id: string): Promise<LearningEvent | null> {
    return this.savedItems.find((item) => item.eventId === id) ?? null;
  }

  async getAll(): Promise<LearningEvent[]> {
    return this.savedItems;
  }
}

describe('PersistLearningEvent — dependency injection, no domain logic (M10 Rule 1/2/4)', () => {
  it('passes the given LearningEvent straight through to the injected repository, unmodified', async () => {
    const fakeRepository = new FakeLearningEventRepository();
    const learningEvent = buildLearningEvent('evt-1');

    await new PersistLearningEvent(fakeRepository).execute(learningEvent);

    expect(fakeRepository.savedItems).toEqual([learningEvent]);
  });

  it('never mutates the LearningEvent it was given (M10 Rule 7)', async () => {
    const learningEvent = buildLearningEvent('evt-1');
    const before = JSON.parse(JSON.stringify(learningEvent));

    await new PersistLearningEvent(new FakeLearningEventRepository()).execute(learningEvent);

    expect(learningEvent).toEqual(before);
  });
});

describe('PersistLearningEvent — repository swappability (M10 Rule 4)', () => {
  it('works identically against a fake and against the real InMemoryLearningEventRepository (M9)', async () => {
    const learningEvent = buildLearningEvent('evt-1');

    const fakeRepository = new FakeLearningEventRepository();
    await new PersistLearningEvent(fakeRepository).execute(learningEvent);

    const inMemoryRepository = new InMemoryLearningEventRepository();
    await new PersistLearningEvent(inMemoryRepository).execute(learningEvent);

    expect(await inMemoryRepository.getById('evt-1')).toEqual(learningEvent);
    expect(fakeRepository.savedItems[0]).toEqual(learningEvent);
  });
});
