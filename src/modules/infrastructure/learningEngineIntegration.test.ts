import { describe, expect, it } from 'vitest';
import type { LearningEvent } from '../feedbackPipeline';
import { DEFAULT_LEARNING_STRATEGIES, learn } from '../learningEngine';
import { validateSignalVector, type TrackDNA } from '../trackDna';
import type { UserDNA } from '../userDna';
import { InMemoryUserDnaRepository } from './repositories/inMemoryUserDnaRepository';

/**
 * Demonstrates M9 Rule 5 ("Learning Engine må kun kende interfacet")
 * from the other direction: `learningEngine` (M8) needs no code change
 * and no import of `persistence` or `infrastructure` at all to be used
 * together with a repository — the composition (load → learn → save)
 * happens entirely from *this* module's side, through the repository
 * interface alone. `learningEngine/`'s own source files import nothing
 * from `persistence/` or `infrastructure/` (verified by inspection —
 * see Review Report); this test is the executable half of that proof.
 */
describe('InMemoryUserDnaRepository composed with learningEngine.learn()', () => {
  it('loads a UserDNA, learns from an event, and saves the result — with learn() untouched by persistence concerns', async () => {
    const repository = new InMemoryUserDnaRepository();
    const initialUserDna: UserDNA = {
      userId: 'user-1',
      signals: validateSignalVector({ mainstream: { value: 0.2, confidence: 0.2 } }),
      coldStart: true,
      sourceLibrarySnapshotRef: null,
      version: 1,
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    await repository.save(initialUserDna);

    const trackDna: TrackDNA = {
      trackId: 'track-1',
      signals: validateSignalVector({ mainstream: { value: 1, confidence: 1 } }),
      sourceCandidateRef: 'candidate-1',
      enrichmentCompleteness: 1,
    };
    const learningEvent: LearningEvent = {
      eventId: 'evt-1',
      candidateRef: 'candidate-1',
      trackDnaRef: 'track-1',
      reactionType: 'save',
      recordedAt: '2026-01-01T00:00:00.000Z',
    };

    const loadedResult = await repository.getById('user-1');
    if (!loadedResult.success || !loadedResult.value) throw new Error('unreachable');
    const loaded = loadedResult.value;

    const updated = learn(DEFAULT_LEARNING_STRATEGIES, loaded, learningEvent, trackDna);
    await repository.save(updated);

    const reloadedResult = await repository.getById('user-1');
    if (!reloadedResult.success) throw new Error('unreachable');
    const reloaded = reloadedResult.value;

    expect(reloaded?.signals.mainstream.value).toBeGreaterThan(initialUserDna.signals.mainstream.value);
    expect(reloaded?.coldStart).toBe(false);
    expect(reloaded?.version).toBe(2);
  });
});
