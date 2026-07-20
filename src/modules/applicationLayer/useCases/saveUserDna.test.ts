import { describe, expect, it } from 'vitest';
import { InMemoryUserDnaRepository } from '../../persistence';
import type { UserDnaRepository } from '../../persistence';
import { validateSignalVector } from '../../trackDna';
import type { UserDNA } from '../../userDna';
import { SaveUserDna } from './saveUserDna';

const buildUserDna = (userId: string): UserDNA => ({
  userId,
  signals: validateSignalVector({}),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
});

class FakeUserDnaRepository implements UserDnaRepository {
  public savedItems: UserDNA[] = [];

  async save(item: UserDNA): Promise<void> {
    this.savedItems.push(item);
  }

  async getById(): Promise<UserDNA | null> {
    throw new Error('not used in this test');
  }

  async getAll(): Promise<UserDNA[]> {
    return this.savedItems;
  }
}

describe('SaveUserDna — dependency injection, no domain logic (M10 Rule 1/2/4)', () => {
  it('passes the given UserDNA straight through to the injected repository, unmodified', async () => {
    const fakeRepository = new FakeUserDnaRepository();
    const useCase = new SaveUserDna(fakeRepository);
    const userDna = buildUserDna('user-1');

    await useCase.execute(userDna);

    expect(fakeRepository.savedItems).toEqual([userDna]);
  });

  it('never mutates the UserDNA it was given (M10 Rule 7)', async () => {
    const userDna = buildUserDna('user-1');
    const before = JSON.parse(JSON.stringify(userDna));

    await new SaveUserDna(new FakeUserDnaRepository()).execute(userDna);

    expect(userDna).toEqual(before);
  });
});

describe('SaveUserDna — repository swappability (M10 Rule 4)', () => {
  it('works identically against a fake and against the real InMemoryUserDnaRepository (M9)', async () => {
    const userDna = buildUserDna('user-1');

    const fakeRepository = new FakeUserDnaRepository();
    await new SaveUserDna(fakeRepository).execute(userDna);

    const inMemoryRepository = new InMemoryUserDnaRepository();
    await new SaveUserDna(inMemoryRepository).execute(userDna);

    expect(await inMemoryRepository.getById('user-1')).toEqual(userDna);
    expect(fakeRepository.savedItems[0]).toEqual(userDna);
  });
});
