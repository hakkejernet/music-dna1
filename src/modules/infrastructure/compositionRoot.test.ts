import { describe, expect, it } from 'vitest';
import { LearnFromReaction, LoadUserDna, PersistLearningEvent, SaveUserDna } from '../applicationLayer';
import type { LearningEvent } from '../feedbackPipeline';
import { validateSignalVector, type TrackDNA } from '../trackDna';
import type { UserDNA } from '../userDna';
import { buildAppContext } from './compositionRoot';

describe('buildAppContext — Composition Root builds the whole system (M11 Rule 3)', () => {
  it('constructs all three repositories and all four use cases', () => {
    const appContext = buildAppContext();

    expect(appContext.repositories.userDnaRepository).toBeDefined();
    expect(appContext.repositories.trackDnaRepository).toBeDefined();
    expect(appContext.repositories.learningEventRepository).toBeDefined();

    expect(appContext.useCases.loadUserDna).toBeInstanceOf(LoadUserDna);
    expect(appContext.useCases.saveUserDna).toBeInstanceOf(SaveUserDna);
    expect(appContext.useCases.persistLearningEvent).toBeInstanceOf(PersistLearningEvent);
    expect(appContext.useCases.learnFromReaction).toBeInstanceOf(LearnFromReaction);
  });

  it('wires the same repository instances into both the raw repositories map and the use cases that need them', async () => {
    const appContext = buildAppContext();
    const userDna: UserDNA = {
      userId: 'user-1',
      signals: validateSignalVector({}),
      coldStart: true,
      sourceLibrarySnapshotRef: null,
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    // Saved through the use case, read back through the raw repository
    // — only possible if they share the same underlying instance.
    await appContext.useCases.saveUserDna.execute(userDna);
    expect(await appContext.repositories.userDnaRepository.getById('user-1')).toEqual(userDna);
  });
});

describe('buildAppContext — no singleton, fresh graph every call (M11 Rule 5)', () => {
  it('two calls produce two fully independent object graphs', async () => {
    const first = buildAppContext();
    const second = buildAppContext();

    expect(first.repositories.userDnaRepository).not.toBe(second.repositories.userDnaRepository);
    expect(first.useCases.learnFromReaction).not.toBe(second.useCases.learnFromReaction);

    const userDna: UserDNA = {
      userId: 'user-1',
      signals: validateSignalVector({}),
      coldStart: true,
      sourceLibrarySnapshotRef: null,
      version: 1,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await first.repositories.userDnaRepository.save(userDna);

    // Saving into the first graph must never leak into the second.
    expect(await second.repositories.userDnaRepository.getById('user-1')).toBeNull();
  });
});

describe('AppContext — describes dependencies only, not runtime state (M11 Rule 6)', () => {
  it('has exactly the two wiring groups (repositories, useCases) and nothing else', () => {
    const appContext = buildAppContext();
    expect(Object.keys(appContext).sort()).toEqual(['repositories', 'useCases']);
    expect(Object.keys(appContext.repositories).sort()).toEqual(['learningEventRepository', 'trackDnaRepository', 'userDnaRepository']);
    expect(Object.keys(appContext.useCases).sort()).toEqual(['learnFromReaction', 'loadUserDna', 'persistLearningEvent', 'saveUserDna']);
  });
});

describe('buildAppContext — the whole system starts with one wiring function (M11 DoD)', () => {
  it('runs a full load → learn → save workflow using only what buildAppContext() returns', async () => {
    const appContext = buildAppContext();

    const initialUserDna: UserDNA = {
      userId: 'user-1',
      signals: validateSignalVector({ mainstream: { value: 0.2, confidence: 0.2 } }),
      coldStart: true,
      sourceLibrarySnapshotRef: null,
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    await appContext.useCases.saveUserDna.execute(initialUserDna);

    const trackDna: TrackDNA = {
      trackId: 'track-1',
      signals: validateSignalVector({ mainstream: { value: 1, confidence: 1 } }),
      sourceCandidateRef: 'candidate-1',
      enrichmentCompleteness: 1,
    };
    await appContext.repositories.trackDnaRepository.save(trackDna);

    const learningEvent: LearningEvent = {
      eventId: 'evt-1',
      candidateRef: 'candidate-1',
      trackDnaRef: 'track-1',
      reactionType: 'save',
      recordedAt: '2026-01-01T00:00:00.000Z',
    };
    await appContext.useCases.learnFromReaction.execute('user-1', learningEvent);

    const reloaded = await appContext.useCases.loadUserDna.execute('user-1');
    expect(reloaded?.signals.mainstream.value).toBeGreaterThan(initialUserDna.signals.mainstream.value);
    expect(reloaded?.coldStart).toBe(false);
  });
});
