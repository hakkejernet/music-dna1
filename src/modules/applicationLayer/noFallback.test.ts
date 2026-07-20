import { describe, expect, it } from 'vitest';
import { userDnaNotFound } from '../domainErrors';
import { buildAppContext } from '../infrastructure';
import type { LearningEvent } from '../feedbackPipeline';

const buildLearningEvent = (overrides: Partial<LearningEvent> = {}): LearningEvent => ({
  eventId: 'evt-1',
  candidateRef: 'candidate-1',
  trackDnaRef: 'track-1',
  reactionType: 'save',
  recordedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

/**
 * M12's own success measure, made explicit as a standalone test
 * (beyond the per-file propagation tests already in each use case's
 * own test file): no fallback data, no mock data, no default user,
 * no synthetic recommendation list — a missing UserDNA surfaces as a
 * real, typed failure the caller must handle, never something that
 * quietly looks like success.
 */
describe('No fallback exists anywhere in the Application Layer (M12 Rule 6)', () => {
  it('a user with no UserDNA at all gets a real Failure — never a freshly-invented "default user" profile', async () => {
    const { useCases } = buildAppContext();

    const result = await useCases.learnFromReaction.execute('brand-new-user-never-seen-before', buildLearningEvent());

    expect(result).toEqual({ success: false, error: userDnaNotFound('brand-new-user-never-seen-before') });
  });

  it('an empty system has no synthetic data anywhere — getAll() on every repository is a real, empty Success, not a placeholder list', async () => {
    const { repositories } = buildAppContext();

    expect(await repositories.userDnaRepository.getAll()).toEqual({ success: true, value: [] });
    expect(await repositories.trackDnaRepository.getAll()).toEqual({ success: true, value: [] });
    expect(await repositories.learningEventRepository.getAll()).toEqual({ success: true, value: [] });
  });

  it('LoadUserDna never substitutes a value for a user that was never saved — it reports Success(null), not an invented profile', async () => {
    const { useCases } = buildAppContext();

    const result = await useCases.loadUserDna.execute('never-saved-user');

    expect(result).toEqual({ success: true, value: null });
  });
});

/**
 * M12 Rule 3's contract, verified structurally at runtime rather than
 * only at the type level: every repository method resolves to a plain
 * object with a boolean `success` discriminant — never a bare `null`,
 * `undefined`, or unwrapped value slipping through as a stand-in for
 * "it failed" or "it wasn't found".
 */
describe('Result contracts — repositories never return null/undefined directly (M12 Rule 3)', () => {
  it('every repository operation resolves to an object with an explicit success discriminant, never a bare null/undefined', async () => {
    const { repositories } = buildAppContext();
    const operations: Array<Promise<unknown>> = [
      repositories.userDnaRepository.getById('missing'),
      repositories.userDnaRepository.getAll(),
      repositories.trackDnaRepository.getById('missing'),
      repositories.trackDnaRepository.getAll(),
      repositories.learningEventRepository.getById('missing'),
      repositories.learningEventRepository.getAll(),
    ];

    for (const operation of operations) {
      const result = await operation;
      expect(result).not.toBeNull();
      expect(result).not.toBeUndefined();
      expect(typeof (result as { success: unknown }).success).toBe('boolean');
    }
  });
});
