import { describe, expect, it } from 'vitest';
import { InMemoryUserDnaRepository } from '../../persistence';
import type { UserDnaRepository } from '../../persistence';
import { validateSignalVector } from '../../trackDna';
import type { UserDNA } from '../../userDna';
import { LoadUserDna } from './loadUserDna';

const buildUserDna = (userId: string): UserDNA => ({
  userId,
  signals: validateSignalVector({}),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

/** A minimal, hand-rolled fake — nothing shared with `persistence`'s own implementations — proving `LoadUserDna` depends only on the interface (M10 Rule 4/6/8). */
class FakeUserDnaRepository implements UserDnaRepository {
  public getByIdCalls: string[] = [];
  private readonly fixed: UserDNA | null;

  constructor(fixed: UserDNA | null) {
    this.fixed = fixed;
  }

  async save(): Promise<void> {
    throw new Error('not used in this test');
  }

  async getById(id: string): Promise<UserDNA | null> {
    this.getByIdCalls.push(id);
    return this.fixed;
  }

  async getAll(): Promise<UserDNA[]> {
    return this.fixed ? [this.fixed] : [];
  }
}

describe('LoadUserDna — dependency injection (M10 Rule 4/5)', () => {
  it('delegates entirely to whatever repository was injected, calling it with the given userId', async () => {
    const fixedUserDna = buildUserDna('user-1');
    const fakeRepository = new FakeUserDnaRepository(fixedUserDna);
    const useCase = new LoadUserDna(fakeRepository);

    const result = await useCase.execute('user-1');

    expect(result).toEqual(fixedUserDna);
    expect(fakeRepository.getByIdCalls).toEqual(['user-1']);
  });

  it('returns null when the injected repository has nothing for that id', async () => {
    const useCase = new LoadUserDna(new FakeUserDnaRepository(null));
    expect(await useCase.execute('unknown-user')).toBeNull();
  });
});

describe('LoadUserDna — repository swappability (M10 Rule 4)', () => {
  it('behaves identically whether given a hand-rolled fake or the real InMemoryUserDnaRepository (M9)', async () => {
    const userDna = buildUserDna('user-1');

    const inMemoryRepository = new InMemoryUserDnaRepository();
    await inMemoryRepository.save(userDna);

    const fakeRepository = new FakeUserDnaRepository(userDna);

    const resultFromInMemory = await new LoadUserDna(inMemoryRepository).execute('user-1');
    const resultFromFake = await new LoadUserDna(fakeRepository).execute('user-1');

    expect(resultFromInMemory).toEqual(resultFromFake);
  });
});
