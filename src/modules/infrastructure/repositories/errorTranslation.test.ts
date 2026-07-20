import { describe, expect, it } from 'vitest';
import type { UserDNA } from '../../userDna';
import { InMemoryLearningEventRepository } from './inMemoryLearningEventRepository';
import { InMemoryTrackDnaRepository } from './inMemoryTrackDnaRepository';
import { InMemoryUserDnaRepository } from './inMemoryUserDnaRepository';

/**
 * Proves M12 Rule 7 ("Infrastructure må oversætte tekniske fejl til
 * domænefejl") with a *real* thrown technical error, not a contrived
 * one: `deepClone()`'s `JSON.stringify` genuinely throws
 * `TypeError: Converting circular structure to JSON` on a circular
 * object graph. Under normal InMemory operation this path is
 * essentially unreachable (a `Map` never throws), but the contract
 * must hold for *any* implementation, including a future one that can
 * genuinely fail — this is what proves the try/catch in
 * `runRepositoryOperation()` is real, working code, not dead
 * defensive scaffolding.
 */
const makeCircularUserDna = (): UserDNA => {
  const circular: Record<string, unknown> = { userId: 'user-1' };
  circular.self = circular;
  return circular as unknown as UserDNA;
};

describe('InMemoryUserDnaRepository — translates a real technical failure into RepositoryFailure (M12 Rule 7)', () => {
  it('save() catches the JSON.stringify failure and returns Failure(RepositoryFailure), never a raw thrown TypeError', async () => {
    const repository = new InMemoryUserDnaRepository();

    const result = await repository.save(makeCircularUserDna());

    expect(result.success).toBe(false);
    if (result.success) throw new Error('unreachable');
    expect(result.error).toEqual({
      type: 'RepositoryFailure',
      operation: 'UserDnaRepository.save',
      reason: expect.stringContaining('circular'),
    });
  });

  it('never lets the raw exception escape — save() does not reject or throw', async () => {
    const repository = new InMemoryUserDnaRepository();
    await expect(repository.save(makeCircularUserDna())).resolves.toBeDefined();
  });

  it('getById() on a store containing no bad data still succeeds normally afterward — one failed save does not corrupt the repository', async () => {
    const repository = new InMemoryUserDnaRepository();
    await repository.save(makeCircularUserDna());

    const result = await repository.getById('user-1');
    expect(result).toEqual({ success: true, value: null });
  });
});

describe('InMemoryTrackDnaRepository / InMemoryLearningEventRepository — same translation, same shared mechanism', () => {
  it('TrackDnaRepository.save() translates a circular-structure failure the same way', async () => {
    const repository = new InMemoryTrackDnaRepository();
    const circular: Record<string, unknown> = { trackId: 'track-1' };
    circular.self = circular;

    const result = await repository.save(circular as never);

    expect(result).toEqual({
      success: false,
      error: { type: 'RepositoryFailure', operation: 'TrackDnaRepository.save', reason: expect.stringContaining('circular') },
    });
  });

  it('LearningEventRepository.save() translates a circular-structure failure the same way', async () => {
    const repository = new InMemoryLearningEventRepository();
    const circular: Record<string, unknown> = { eventId: 'evt-1' };
    circular.self = circular;

    const result = await repository.save(circular as never);

    expect(result).toEqual({
      success: false,
      error: { type: 'RepositoryFailure', operation: 'LearningEventRepository.save', reason: expect.stringContaining('circular') },
    });
  });
});
