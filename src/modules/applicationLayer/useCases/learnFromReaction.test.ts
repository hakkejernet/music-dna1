import { describe, expect, it } from 'vitest';
import type { RepositoryFailure } from '../../domainErrors';
import { repositoryFailure, userDnaNotFound } from '../../domainErrors';
import type { LearningEvent } from '../../feedbackPipeline';
import { buildAppContext } from '../../infrastructure';
import { DEFAULT_LEARNING_STRATEGIES, learn, type LearningStrategy } from '../../learningEngine';
import type { Observation, ObservationSink } from '../../observability';
import type { LearningEventRepository, TrackDnaRepository, UserDnaRepository } from '../../persistence';
import { failure, success, type Result } from '../../result';
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
  private readonly failNextGetById: RepositoryFailure | null;
  private readonly failNextSave: RepositoryFailure | null;

  constructor(fixed: UserDNA | null, options: { failNextGetById?: RepositoryFailure; failNextSave?: RepositoryFailure } = {}) {
    this.fixed = fixed;
    this.failNextGetById = options.failNextGetById ?? null;
    this.failNextSave = options.failNextSave ?? null;
  }

  async save(item: UserDNA): Promise<Result<void, RepositoryFailure>> {
    if (this.failNextSave) return failure(this.failNextSave);
    this.saveCalls.push(item);
    return success(undefined);
  }

  async getById(id: string): Promise<Result<UserDNA | null, RepositoryFailure>> {
    this.getByIdCalls.push(id);
    if (this.failNextGetById) return failure(this.failNextGetById);
    return success(this.fixed);
  }

  async getAll(): Promise<Result<UserDNA[], RepositoryFailure>> {
    return success(this.fixed ? [this.fixed] : []);
  }
}

class FakeTrackDnaRepository implements TrackDnaRepository {
  public getByIdCalls: string[] = [];
  private readonly fixed: TrackDNA | null;
  private readonly failNextGetById: RepositoryFailure | null;

  constructor(fixed: TrackDNA | null, failNextGetById: RepositoryFailure | null = null) {
    this.fixed = fixed;
    this.failNextGetById = failNextGetById;
  }

  async save(): Promise<Result<void, RepositoryFailure>> {
    throw new Error('not used in this test');
  }

  async getById(id: string): Promise<Result<TrackDNA | null, RepositoryFailure>> {
    this.getByIdCalls.push(id);
    if (this.failNextGetById) return failure(this.failNextGetById);
    return success(this.fixed);
  }

  async getAll(): Promise<Result<TrackDNA[], RepositoryFailure>> {
    return success(this.fixed ? [this.fixed] : []);
  }
}

class FakeLearningEventRepository implements LearningEventRepository {
  public saveCalls: LearningEvent[] = [];
  private readonly failNextSave: RepositoryFailure | null;

  constructor(failNextSave: RepositoryFailure | null = null) {
    this.failNextSave = failNextSave;
  }

  async save(item: LearningEvent): Promise<Result<void, RepositoryFailure>> {
    if (this.failNextSave) return failure(this.failNextSave);
    this.saveCalls.push(item);
    return success(undefined);
  }

  async getById(id: string): Promise<Result<LearningEvent | null, RepositoryFailure>> {
    return success(this.saveCalls.find((item) => item.eventId === id) ?? null);
  }

  async getAll(): Promise<Result<LearningEvent[], RepositoryFailure>> {
    return success(this.saveCalls);
  }
}

/**
 * A test double proving M14 Rule 5/ADR-32 ("ObservationSink er best
 * effort"): when `throwOnRecord` is set, every `record*` call throws,
 * simulating a broken Observability implementation — used to prove that
 * `LearnFromReaction.execute()`'s own `Result` never depends on whether
 * recording succeeded.
 */
class FakeObservationSink implements ObservationSink {
  public recorded: Observation[] = [];
  private readonly throwOnRecord: boolean;

  constructor(options: { throwOnRecord?: boolean } = {}) {
    this.throwOnRecord = options.throwOnRecord ?? false;
  }

  recordRecommendationShown(input: { candidateRef: string; trackDnaRef: string; score: number; providerNames: readonly string[] }, now: Date): void {
    this.push({ type: 'RecommendationShown', ...input, observedAt: now.toISOString() });
  }

  recordRecommendationAccepted(input: { candidateRef: string; trackDnaRef: string }, now: Date): void {
    this.push({ type: 'RecommendationAccepted', ...input, observedAt: now.toISOString() });
  }

  recordRecommendationRejected(input: { candidateRef: string; trackDnaRef: string }, now: Date): void {
    this.push({ type: 'RecommendationRejected', ...input, observedAt: now.toISOString() });
  }

  recordRecommendationKnown(input: { candidateRef: string; trackDnaRef: string }, now: Date): void {
    this.push({ type: 'RecommendationKnown', ...input, observedAt: now.toISOString() });
  }

  recordLearningApplied(input: { userId: string; eventId: string; changed: boolean }, now: Date): void {
    this.push({ type: 'LearningApplied', ...input, observedAt: now.toISOString() });
  }

  recordCandidatePipelineMeasured(
    input: {
      userId: string;
      rawCandidateCount: number;
      deduplicatedCandidateCount: number;
      enrichedCandidateCount: number;
      finalRankedPoolSize: number;
      providerDiagnostics: readonly { providerName: string; diagnostics: Readonly<Record<string, number>> }[];
    },
    now: Date,
  ): void {
    this.push({ type: 'CandidatePipelineMeasured', ...input, observedAt: now.toISOString() });
  }

  getAll(): readonly Observation[] {
    return this.recorded;
  }

  private push(observation: Observation): void {
    if (this.throwOnRecord) throw new Error('simulated ObservationSink failure');
    this.recorded.push(observation);
  }
}

/** Unwraps a Result in a test, failing loudly (not silently) if it's actually a Failure — keeps the "happy path" tests readable. */
const expectSuccess = <T>(result: Result<T, unknown>): T => {
  if (!result.success) throw new Error(`expected Success, got Failure: ${JSON.stringify(result.error)}`);
  return result.value;
};

describe('LearnFromReaction — dependency injection (M10 Rule 4/5)', () => {
  it('loads UserDNA and TrackDNA from exactly the injected repositories, using the ids the event names', async () => {
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const userDnaRepository = new FakeUserDnaRepository(userDna);
    const trackDnaRepository = new FakeTrackDnaRepository(trackDna);
    const learningEventRepository = new FakeLearningEventRepository();

    const useCase = new LearnFromReaction(userDnaRepository, trackDnaRepository, learningEventRepository, DEFAULT_LEARNING_STRATEGIES, new FakeObservationSink());
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

    const useCase = new LearnFromReaction(userDnaRepository, new FakeTrackDnaRepository(trackDna), learningEventRepository, DEFAULT_LEARNING_STRATEGIES, new FakeObservationSink());
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
      new FakeObservationSink(),
    );
    const resultFromUseCase = expectSuccess(await useCase.execute('user-1', learningEvent));

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
      new FakeObservationSink(),
    );
    const result = expectSuccess(await useCase.execute('user-1', buildLearningEvent()));

    expect(result.signals.mainstream).toEqual({ value: 0.42, confidence: 0.9 });
  });
});

describe('LearnFromReaction — Learning Engine is unchanged, only called (M10 Rule 3, M12 Rule 5)', () => {
  it('imports and calls learningEngine.learn() without modification — verified by identical output to a direct call', async () => {
    // Same assertion as the "no domain logic" test above, phrased for
    // this specific DoD requirement: the workflow is a thin caller of
    // M8's own, untouched function, not a reimplementation of it.
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const learningEvent = buildLearningEvent();

    const direct = learn(DEFAULT_LEARNING_STRATEGIES, userDna, learningEvent, trackDna);
    const viaUseCase = expectSuccess(
      await new LearnFromReaction(
        new FakeUserDnaRepository(userDna),
        new FakeTrackDnaRepository(trackDna),
        new FakeLearningEventRepository(),
        DEFAULT_LEARNING_STRATEGIES,
        new FakeObservationSink(),
      ).execute('user-1', learningEvent),
    );

    expect(viaUseCase).toEqual(direct);
  });
});

describe('LearnFromReaction — missing data is handled the same way M8 already does (M10 Rule 1, M8 Rule 7, M12 Rule 5)', () => {
  it('passes null through to learn() when no TrackDNA is found, rather than special-casing it', async () => {
    const userDna = buildUserDna('user-1');
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(null),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink(),
    );

    const result = expectSuccess(await useCase.execute('user-1', buildLearningEvent()));

    // Identical to what learn() itself does with trackDna = null (M8's own, already-proven behavior).
    expect(result.signals).toEqual(userDna.signals);
  });

  it('returns Failure(UserDnaNotFound) — never a fabricated default profile — when no UserDNA exists for the user (M12 Rule 1/6)', async () => {
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink(),
    );

    const result = await useCase.execute('missing-user', buildLearningEvent());

    expect(result).toEqual(failure(userDnaNotFound('missing-user')));
  });
});

describe('LearnFromReaction — error propagation (M12 Rule 4): no logging, no retry, no recovery, no fallback', () => {
  it('propagates a UserDnaRepository.getById failure unchanged, without attempting TrackDNA lookup or any save', async () => {
    const theFailure = repositoryFailure('UserDnaRepository.getById', 'simulated outage');
    const trackDnaRepository = new FakeTrackDnaRepository(buildTrackDna('track-1'));
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(null, { failNextGetById: theFailure }),
      trackDnaRepository,
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink(),
    );

    const result = await useCase.execute('user-1', buildLearningEvent());

    expect(result).toEqual(failure(theFailure));
    // Never even reached the TrackDNA lookup — the failure stopped the workflow immediately, no partial progress.
    expect(trackDnaRepository.getByIdCalls).toEqual([]);
  });

  it('propagates a TrackDnaRepository.getById failure unchanged, without saving anything', async () => {
    const theFailure = repositoryFailure('TrackDnaRepository.getById', 'simulated outage');
    const userDnaRepository = new FakeUserDnaRepository(buildUserDna('user-1'));
    const useCase = new LearnFromReaction(
      userDnaRepository,
      new FakeTrackDnaRepository(null, theFailure),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink(),
    );

    const result = await useCase.execute('user-1', buildLearningEvent());

    expect(result).toEqual(failure(theFailure));
    expect(userDnaRepository.saveCalls).toEqual([]);
  });

  it('propagates a UserDnaRepository.save failure unchanged, without persisting the LearningEvent', async () => {
    const theFailure = repositoryFailure('UserDnaRepository.save', 'simulated outage');
    const learningEventRepository = new FakeLearningEventRepository();
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(buildUserDna('user-1'), { failNextSave: theFailure }),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      learningEventRepository,
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink(),
    );

    const result = await useCase.execute('user-1', buildLearningEvent());

    expect(result).toEqual(failure(theFailure));
    expect(learningEventRepository.saveCalls).toEqual([]);
  });

  it('propagates a LearningEventRepository.save failure unchanged, even though the UserDNA was already saved successfully', async () => {
    const theFailure = repositoryFailure('LearningEventRepository.save', 'simulated outage');
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(buildUserDna('user-1')),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(theFailure),
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink(),
    );

    const result = await useCase.execute('user-1', buildLearningEvent());

    expect(result).toEqual(failure(theFailure));
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
      new FakeObservationSink(),
    ).execute('user-1', learningEvent);

    expect(userDna).toEqual(userDnaBefore);
    expect(learningEvent).toEqual(eventBefore);
  });
});

describe('LearnFromReaction — end-to-end via the Composition Root (M11)', () => {
  it('runs the full load → learn → save workflow against the real, wired system from buildAppContext() — the whole system started with one wiring function', async () => {
    // No InMemory*Repository is named anywhere in this file — the real
    // implementations come only from buildAppContext() (M11 Rule 3/4).
    const { repositories, useCases } = buildAppContext();

    const initialUserDna = buildUserDna('user-1');
    await repositories.userDnaRepository.save(initialUserDna);
    await repositories.trackDnaRepository.save(buildTrackDna('track-1'));

    const learningEvent = buildLearningEvent();
    const result = await useCases.learnFromReaction.execute('user-1', learningEvent);
    const updatedUserDna = expectSuccess(result);

    const reloadedUserDna = expectSuccess(await repositories.userDnaRepository.getById('user-1'));
    const persistedEvent = expectSuccess(await repositories.learningEventRepository.getById('evt-1'));

    expect(reloadedUserDna).toEqual(updatedUserDna);
    expect(reloadedUserDna?.signals.mainstream.value).toBeGreaterThan(initialUserDna.signals.mainstream.value);
    expect(reloadedUserDna?.coldStart).toBe(false);
    expect(persistedEvent).toEqual(learningEvent);
  });
});

describe('LearnFromReaction — observations are produced at the natural points in the workflow (M14 Rule 3/4)', () => {
  it('records RecommendationAccepted + LearningApplied for a "save" reaction', async () => {
    const userDna = buildUserDna('user-1');
    const observationSink = new FakeObservationSink();
    const learningEvent = buildLearningEvent({ reactionType: 'save' });

    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );
    await useCase.execute('user-1', learningEvent);

    expect(observationSink.recorded).toEqual([
      { type: 'RecommendationAccepted', candidateRef: 'candidate-1', trackDnaRef: 'track-1', observedAt: RECORDED_AT },
      { type: 'LearningApplied', userId: 'user-1', eventId: 'evt-1', changed: true, observedAt: RECORDED_AT },
    ]);
  });

  it('records RecommendationRejected for a "reject" reaction', async () => {
    const userDna = buildUserDna('user-1');
    const observationSink = new FakeObservationSink();
    const learningEvent = buildLearningEvent({ reactionType: 'reject' });

    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );
    await useCase.execute('user-1', learningEvent);

    expect(observationSink.recorded[0]).toEqual({
      type: 'RecommendationRejected',
      candidateRef: 'candidate-1',
      trackDnaRef: 'track-1',
      observedAt: RECORDED_AT,
    });
  });

  it('records RecommendationKnown for a "known" reaction', async () => {
    const userDna = buildUserDna('user-1');
    const observationSink = new FakeObservationSink();
    const learningEvent = buildLearningEvent({ reactionType: 'known' });

    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );
    await useCase.execute('user-1', learningEvent);

    expect(observationSink.recorded[0]).toEqual({
      type: 'RecommendationKnown',
      candidateRef: 'candidate-1',
      trackDnaRef: 'track-1',
      observedAt: RECORDED_AT,
    });
  });

  it('records LearningApplied with changed=false when learn() produces no signal change (no matching TrackDNA)', async () => {
    const userDna = buildUserDna('user-1');
    const observationSink = new FakeObservationSink();
    // No TrackDNA is registered for 'track-1' — learn() falls back to its
    // own null-TrackDNA behavior (M8 Rule 7), which here (single
    // 'mainstream' signal, cold-start user) does not change the version.
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(null),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );
    const result = expectSuccess(await useCase.execute('user-1', buildLearningEvent()));

    expect(result.version).toBe(userDna.version);
    const learningApplied = observationSink.recorded.find((observation) => observation.type === 'LearningApplied');
    expect(learningApplied).toEqual({ type: 'LearningApplied', userId: 'user-1', eventId: 'evt-1', changed: false, observedAt: RECORDED_AT });
  });
});

describe('LearnFromReaction — no observation is produced when the use case fails (M14 Rule 4)', () => {
  it('records nothing when UserDNA is not found', async () => {
    const observationSink = new FakeObservationSink();
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(null),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );

    await useCase.execute('missing-user', buildLearningEvent());

    expect(observationSink.recorded).toEqual([]);
  });

  it('records nothing when UserDnaRepository.getById fails', async () => {
    const observationSink = new FakeObservationSink();
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(null, { failNextGetById: repositoryFailure('UserDnaRepository.getById', 'simulated outage') }),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );

    await useCase.execute('user-1', buildLearningEvent());

    expect(observationSink.recorded).toEqual([]);
  });

  it('records nothing when TrackDnaRepository.getById fails', async () => {
    const observationSink = new FakeObservationSink();
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(buildUserDna('user-1')),
      new FakeTrackDnaRepository(null, repositoryFailure('TrackDnaRepository.getById', 'simulated outage')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );

    await useCase.execute('user-1', buildLearningEvent());

    expect(observationSink.recorded).toEqual([]);
  });

  it('records nothing when UserDnaRepository.save fails', async () => {
    const observationSink = new FakeObservationSink();
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(buildUserDna('user-1'), { failNextSave: repositoryFailure('UserDnaRepository.save', 'simulated outage') }),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );

    await useCase.execute('user-1', buildLearningEvent());

    expect(observationSink.recorded).toEqual([]);
  });

  it('records nothing when LearningEventRepository.save fails, even though UserDNA was already saved', async () => {
    const observationSink = new FakeObservationSink();
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(buildUserDna('user-1')),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(repositoryFailure('LearningEventRepository.save', 'simulated outage')),
      DEFAULT_LEARNING_STRATEGIES,
      observationSink,
    );

    await useCase.execute('user-1', buildLearningEvent());

    expect(observationSink.recorded).toEqual([]);
  });
});

describe('LearnFromReaction — ObservationSink is best effort (M14 Rule 5, ADR-32)', () => {
  it('a throwing ObservationSink never changes execute()\'s own Result — the use case still returns Success', async () => {
    const userDna = buildUserDna('user-1');
    const useCase = new LearnFromReaction(
      new FakeUserDnaRepository(userDna),
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      new FakeLearningEventRepository(),
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink({ throwOnRecord: true }),
    );

    const result = await useCase.execute('user-1', buildLearningEvent());

    expect(result.success).toBe(true);
  });

  it('a throwing ObservationSink still lets the workflow persist exactly as it would with a healthy sink', async () => {
    const userDna = buildUserDna('user-1');
    const userDnaRepository = new FakeUserDnaRepository(userDna);
    const learningEventRepository = new FakeLearningEventRepository();
    const useCase = new LearnFromReaction(
      userDnaRepository,
      new FakeTrackDnaRepository(buildTrackDna('track-1')),
      learningEventRepository,
      DEFAULT_LEARNING_STRATEGIES,
      new FakeObservationSink({ throwOnRecord: true }),
    );

    await useCase.execute('user-1', buildLearningEvent());

    expect(userDnaRepository.saveCalls).toHaveLength(1);
    expect(learningEventRepository.saveCalls).toHaveLength(1);
  });
});

describe('LearnFromReaction — Learning Engine remains unchanged by the M14 integration (M14 Rule 2, M10 Rule 3)', () => {
  it('still produces byte-for-byte the same result as calling learningEngine.learn() directly, with an ObservationSink now wired in', async () => {
    // Identical assertion to the M10-era "no domain logic" test, repeated
    // here under M14 to prove that adding observability changed nothing
    // about what learn() itself computes — this use case still only
    // sequences load → learn() → save → (best-effort) record.
    const userDna = buildUserDna('user-1');
    const trackDna = buildTrackDna('track-1');
    const learningEvent = buildLearningEvent();

    const direct = learn(DEFAULT_LEARNING_STRATEGIES, userDna, learningEvent, trackDna);
    const viaUseCase = expectSuccess(
      await new LearnFromReaction(
        new FakeUserDnaRepository(userDna),
        new FakeTrackDnaRepository(trackDna),
        new FakeLearningEventRepository(),
        DEFAULT_LEARNING_STRATEGIES,
        new FakeObservationSink(),
      ).execute('user-1', learningEvent),
    );

    expect(viaUseCase).toEqual(direct);
  });
});
