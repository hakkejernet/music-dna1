import { describe, expect, it } from 'vitest';
import type { LearningEvent } from '../../feedbackPipeline';
import { DEFAULT_LEARNING_STRATEGIES, learn, type LearningStrategy } from '../../learningEngine';
import { InMemoryLearningEventRepository, InMemoryTrackDnaRepository, InMemoryUserDnaRepository } from '../../persistence';
import type { LearningEventRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { validateSignalVector, type TrackDNA } from '../../trackDna';
import type { UserDNA } from '../../userDna';
import { LearnFromReaction } from './learnFromReaction';

const RECORDED_AT = '2026-01-01T00:00:00.000Z';

const buildUserDna = (userId: string): UserDNA => ({
  userId,
  signals: validateSignalVector({ mainstream: { value: 0.2, confidence: 0.2 } }),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: '2025-01-01T00:00:00.000Z',
});

const buildTrackDna = (trackId: string): TrackDNA => ({
  trackId,
  signals: validateSignalVector({ mainstream: { value: 1, confidence: 1 } }),
  sourceCandidateRef: 'candidate-1',
  enrichmentCompleteness: 1,
});

const buildLearningEvent = (overrides: Partial<LearningEvent> = {}): LearningEvent => ({
  eventId: 'evt-1',
  candidateRef: 'candidate-1',
  trackDnaRef: 'track-1',
  reactionType: 'save',
  recordedAt: RECORDED_AT,
  ...overrides,
});

class FakeUserDnaRepository implements UserDnaRepository {
  public getByIdCalls: string[] = [];
  public saveCalls: UserDNA[] = [];
  private readonly fixed: UserDNA | null;

  constructor(fixed: UserDNA | null) {
    this.fixed = fixed;
  }

  async save(item: UserDNA): Promise<void> {
    this.saveCalls.push(item);
  }

  async getById(id: string): Promise<UserDNA | null> {
    this.getByIdCalls.push(id);
    return this.fixed;
  }

  async getAll(): Promise<UserDNA[]> {
    return this.fixed ? [this.fixed] : [];
  }
}

class FakeTrackDnaRepository implements TrackDnaRepository {
  public getByIdCalls: string[] = [];
  private readonly fixed: TrackDNA | null;

  constructor(fixed: TrackDNA | null) {
    this.fixed = fixed;
  }

  async save(): Promise<void> {
    throw new Error('not used in this test');
  }

  async getById(id: string): Promise<TrackDNA | null> {
    this.getByIdCalls.push(id);
    return this.fixed;
  }

  async getAll(): Promise<TrackDNA[]> {
    return this.fixed ? [this.fixed] : [];
  }
}

class FakeLearningEventRepository implements LearningEventRepository {
  public saveCalls: LearningEvent[] = [];

  async save(item: LearningEvent): Promise<void> {
    this.saveCalls.push(item);
  }

  async getById(id: string): Promise<LearningEvent | null> {
    return this.saveCalls.find((item) => item.eventId === id) ?? null;
  }

  async getAll(): Promise<LearningEvent[]> {
    return this.saveCalls;
  }
}

describe('LearnFromReaction — dependency injection (M10 Rule 4/5)', () => {
  it('loads UserDNA and TrackDNA from exactly the injected repositories, using the ids the event names', async () => {
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const userDnaRepository = new FakeUserDnaRepository(userDna);
    const trackDnaRepository = new FakeTrackDnaRepository(trackDna);
    const learningEventRepository = new FakeLearningEventRepository();

    const useCase = new LearnFromReaction(userDnaRepository, trackDnaRepository, learningEventRepository, DEFAULT_LEARNING_STRATEGIES);
    await useCase.execute('user-1', buildLearningEvent({ trackDnaRef: 'track-1' }));

    expect(userDnaRepository.getByIdCalls).toEqual(['user-1']);
    expect(trackDnaRepository.getByIdCalls).toEqual(['track-1']);
  });

  it('saves both the updated UserDNA and the LearningEvent, through the injected repositories', async () => {
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const userDnaRepository = new FakeUserDnaRepository(userDna);
    const learningEventRepository = new FakeLearningEventRepository();
    const learningEvent = buildLearningEvent();

    const useCase = new LearnFromReaction(userDnaRepository, new FakeTrackDnaRepository(trackDna), learningEventRepository, DEFAULT_LEARNING_STRATEGIES);
    await useCase.execute('user-1', learningEvent);

    expect(userDnaRepository.saveCalls).toHaveLength(1);
    expect(learningEventRepository.saveCalls).toEqual([learningEvent]);
  });
});

describe('LearnFromReaction — no domain logic in the Application Layer (M10 Rule 1)', () => {
  it('produces exactly what calling learningEngine.learn() directly would produce — the workflow adds no logic of its own', async () => {
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const learningEvent = buildLearningEvent();

    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(trackDna),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
    );
    const resultFromUseCase = await useCase.execute('user-1', learningEvent);

    const resultFromDirectCall = learn(DEFAULT_LEARNING_STRATEGIES, userDna, learningEvent, trackDna);

    expect(resultFromUseCase).toEqual(resultFromDirectCall);
  });

  it('a custom, non-default strategy list is honored verbatim — no hardcoded signal knowledge in the workflow itself', async () => {
    const fixedResultStrategy: LearningStrategy = {
      strategyName: 'FixedResult',
      ownedSignals: ['mainstream'],
      learn: () => ({ mainstream: { value: 0.42, confidence: 0.9 } }),
    };
    const userDna = buildUserDna('user-1');

    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      [fixedResultStrategy],
    );
    const result = await useCase.execute('user-1', buildLearningEvent());

    expect(result.signals.mainstream).toEqual({ value: 0.42, confidence: 0.9 });
  });
});

describe('LearnFromReaction — Learning Engine is unchanged, only called (M10 Rule 3)', () => {
  it('imports and calls learningEngine.learn() without modification — verified by identical output to a direct call', async () => {
    // Same assertion as the "no domain logic" test above, phrased for
    // this specific DoD requirement: the workflow is a thin caller of
    // M8's own, untouched function, not a reimplementation of it.
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const learningEvent = buildLearningEvent();

    const direct = learn(DEFAULT_LEARNING_STRATEGIES, userDna, learningEvent, trackDna);
    const viaUseCase = await new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(trackDna),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
    ).execute('user-1', learningEvent);

    expect(viaUseCase).toEqual(direct);
  });
});

describe('LearnFromReaction — missing data is handled the same way M8 already does (M10 Rule 1, M8 Rule 7)', () => {
  it('passes null through to learn() when no TrackDNA is found, rather than special-casing it', async () => {
    const userDna = buildUserDna('user-1');
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(null),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
    );

    const result = await useCase.execute('user-1', buildLearningEvent());

    // Identical to what learn() itself does with trackDna = null (M8's own, already-proven behavior).
    expect(result.signals).toEqual(userDna.signals);
  });

  it('throws a clear, simple error when no UserDNA exists for the user — simple propagation, not a fallback (M10 Rule 9)', async () => {
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
    );

    await expect(useCase.execute('missing-user', buildLearningEvent())).rejects.toThrow(/missing-user/);
  });
});

describe('LearnFromReaction — no mutation (M10 Rule 7)', () => {
  it('never mutates the input UserDNA or LearningEvent', async () => {
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const learningEvent = buildLearningEvent();
    const userDnaBefore = JSON.parse(JSON.stringify(userDna));
    const eventBefore = JSON.parse(JSON.stringify(learningEvent));

    await new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(trackDna),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
    ).execute('user-1', learningEvent);

    expect(userDna).toEqual(userDnaBefore);
    expect(learningEvent).toEqual(eventBefore);
  });
});

describe('LearnFromReaction — end-to-end with the real InMemory repositories (M9)', () => {
  it('runs the full load → learn → save workflow against real InMemory repositories', async () => {
    const userDnaRepository = new InMemoryUserDnaRepository();
    const trackDnaRepository = new InMemoryTrackDnaRepository();
    const learningEventRepository = new InMemoryLearningEventRepository();

    const initialUserDna = buildUserDna('user-1');
    await userDnaRepository.save(initialUserDna);
    await trackDnaRepository.save(buildTrackDna('track-1'));

    const learningEvent = buildLearningEvent();
    const useCase = new LearnFromReaction(userDnaRepository, trackDnaRepository, learningEventRepository, DEFAULT_LEARNING_STRATEGIES);
    const result = await useCase.execute('user-1', learningEvent);

    const reloadedUserDna = await userDnaRepository.getById('user-1');
    const persistedEvent = await learningEventRepository.getById('evt-1');

    expect(reloadedUserDna).toEqual(result);
    expect(reloadedUserDna?.signals.mainstream.value).toBeGreaterThan(initialUserDna.signals.mainstream.value);
    expect(reloadedUserDna?.coldStart).toBe(false);
    expect(persistedEvent).toEqual(learningEvent);
  });
});
