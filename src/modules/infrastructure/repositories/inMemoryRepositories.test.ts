import { describe, expect, it } from 'vitest';
import type { LearningEvent } from '../../feedbackPipeline';
import type { Repository } from '../../persistence';
import { validateSignalVector, type TrackDNA } from '../../trackDna';
import type { UserDNA } from '../../userDna';
import { InMemoryLearningEventRepository } from './inMemoryLearningEventRepository';
import { InMemoryTrackDnaRepository } from './inMemoryTrackDnaRepository';
import { InMemoryUserDnaRepository } from './inMemoryUserDnaRepository';

/**
 * One shared contract test suite, run identically against three
 * different concrete repository classes (M9 Rule 5: repositories are
 * swappable — this is the executable proof: the exact same test logic,
 * unmodified, passes against all three without ever branching on which
 * one it's given).
 */
const runRepositoryContractTests = <T>(
  name: string,
  createRepository: () => Repository<T>,
  itemA: T,
  itemB: T,
  idOf: (item: T) => string,
  mutateInPlace: (item: T) => void,
): void => {
  describe(`${name} — repository contract`, () => {
    it('save() then getById() returns a deeply-equal, but distinct, object', async () => {
      const repository = createRepository();
      await repository.save(itemA);
      const found = await repository.getById(idOf(itemA));

      expect(found).toEqual(itemA);
      expect(found).not.toBe(itemA);
    });

    it('getById() returns null for an id that was never saved', async () => {
      const repository = createRepository();
      expect(await repository.getById('never-saved')).toBeNull();
    });

    it('mutating the caller\'s object after save() never affects what is stored (M9 Rule 7)', async () => {
      const repository = createRepository();
      const original = structuredCloneLike(itemA);
      const snapshotBeforeMutation = structuredCloneLike(original);

      await repository.save(original);
      mutateInPlace(original);

      expect(await repository.getById(idOf(itemA))).toEqual(snapshotBeforeMutation);
    });

    it('mutating a previously-returned object never affects a later read (M9 Rule 7)', async () => {
      const repository = createRepository();
      await repository.save(itemA);

      const firstRead = await repository.getById(idOf(itemA));
      if (!firstRead) throw new Error('unreachable');
      mutateInPlace(firstRead);

      const secondRead = await repository.getById(idOf(itemA));
      expect(secondRead).toEqual(itemA);
    });

    it('getAll() returns defensive copies too — mutating one result never affects a later getAll()', async () => {
      const repository = createRepository();
      await repository.save(itemA);

      const [firstResult] = await repository.getAll();
      mutateInPlace(firstResult);

      const [secondResult] = await repository.getAll();
      expect(secondResult).toEqual(itemA);
    });

    it('is deterministic: repeated reads with no intervening writes return equal results every time (M9 Rule 6)', async () => {
      const repository = createRepository();
      await repository.save(itemA);

      const first = await repository.getById(idOf(itemA));
      const second = await repository.getById(idOf(itemA));
      const third = await repository.getById(idOf(itemA));

      expect(first).toEqual(second);
      expect(second).toEqual(third);
    });

    it('getAll() reflects every distinct item saved, and only those', async () => {
      const repository = createRepository();
      await repository.save(itemA);
      await repository.save(itemB);

      const all = await repository.getAll();
      expect(all).toHaveLength(2);
      expect(all.find((item) => idOf(item) === idOf(itemA))).toEqual(itemA);
      expect(all.find((item) => idOf(item) === idOf(itemB))).toEqual(itemB);
    });

    it('saving the same id twice overwrites rather than duplicating', async () => {
      const repository = createRepository();
      await repository.save(itemA);
      await repository.save(itemA);

      expect(await repository.getAll()).toHaveLength(1);
    });

    it('each repository instance owns its own, independent state — no shared/global store (M9 Rule 8)', async () => {
      const repositoryOne = createRepository();
      const repositoryTwo = createRepository();

      await repositoryOne.save(itemA);

      expect(await repositoryOne.getById(idOf(itemA))).toEqual(itemA);
      expect(await repositoryTwo.getById(idOf(itemA))).toBeNull();
      expect(await repositoryTwo.getAll()).toEqual([]);
    });
  });
};

/** A tiny, dependency-free deep-copy used only to build test fixtures/snapshots — deliberately not importing the module under test's own `deepClone`, so the tests don't validate themselves in a circle. */
const structuredCloneLike = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const NOW = '2026-01-01T00:00:00.000Z';

const userDnaA: UserDNA = {
  userId: 'user-a',
  signals: validateSignalVector({ mainstream: { value: 0.5, confidence: 0.5 } }),
  coldStart: true,
  sourceLibrarySnapshotRef: null,
  version: 1,
  updatedAt: NOW,
};
const userDnaB: UserDNA = { ...userDnaA, userId: 'user-b' };

runRepositoryContractTests<UserDNA>(
  'InMemoryUserDnaRepository',
  () => new InMemoryUserDnaRepository(),
  userDnaA,
  userDnaB,
  (item) => item.userId,
  (item) => {
    item.signals.mainstream.value = 0.999;
    item.version = 999;
  },
);

const trackDnaA: TrackDNA = {
  trackId: 'track-a',
  signals: validateSignalVector({ mainstream: { value: 0.5, confidence: 0.5 } }),
  sourceCandidateRef: 'candidate-a',
  enrichmentCompleteness: 0.5,
};
const trackDnaB: TrackDNA = { ...trackDnaA, trackId: 'track-b', sourceCandidateRef: 'candidate-b' };

runRepositoryContractTests<TrackDNA>(
  'InMemoryTrackDnaRepository',
  () => new InMemoryTrackDnaRepository(),
  trackDnaA,
  trackDnaB,
  (item) => item.trackId,
  (item) => {
    item.signals.mainstream.value = 0.999;
    item.enrichmentCompleteness = 0.999;
  },
);

const learningEventA: LearningEvent = {
  eventId: 'evt-a',
  candidateRef: 'candidate-a',
  trackDnaRef: 'track-a',
  reactionType: 'save',
  recordedAt: NOW,
};
const learningEventB: LearningEvent = { ...learningEventA, eventId: 'evt-b', candidateRef: 'candidate-b' };

runRepositoryContractTests<LearningEvent>(
  'InMemoryLearningEventRepository',
  () => new InMemoryLearningEventRepository(),
  learningEventA,
  learningEventB,
  (item) => item.eventId,
  (item) => {
    item.reactionType = 'reject';
  },
);
