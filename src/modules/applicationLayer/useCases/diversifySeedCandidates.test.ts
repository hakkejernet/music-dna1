import { describe, expect, it } from 'vitest';
import type { Candidate } from '../../candidateProviders';
import { diversifySeedCandidates } from './diversifySeedCandidates';

const candidateWithSeed = (candidateId: string, seedArtist: string | null): Candidate => ({
  candidateId,
  title: candidateId,
  artists: [candidateId],
  contributions: [
    {
      providerName: 'lastfm',
      externalIds: {},
      rawMetadata: seedArtist === null ? {} : { seedArtist },
    },
  ],
});

describe('diversifySeedCandidates — per-seed-artist cap, selecting a target-sized pool (M32)', () => {
  it('keeps everything, uncapped, when the pool is already at or below the target size', () => {
    const candidates = [candidateWithSeed('c1', 'Seed A'), candidateWithSeed('c2', 'Seed A'), candidateWithSeed('c3', 'Seed A')];

    const result = diversifySeedCandidates(candidates, 3, 10);

    expect(result).toHaveLength(3);
    expect(new Set(result.map((c) => c.candidateId))).toEqual(new Set(['c1', 'c2', 'c3']));
  });

  it('caps a dominant seed at maxPerSeed and fills the rest of the target from other seeds first', () => {
    // 20 candidates from one seed, 3 from another. Target pool size 6.
    const dominant = Array.from({ length: 20 }, (_, i) => candidateWithSeed(`dom-${i}`, 'Dominant'));
    const other = ['o1', 'o2', 'o3'].map((id) => candidateWithSeed(id, 'Other'));
    const candidates = [...dominant, ...other];

    const result = diversifySeedCandidates(candidates, 3, 6);

    const fromDominant = result.filter((c) => c.candidateId.startsWith('dom-'));
    const fromOther = result.filter((c) => c.candidateId.startsWith('o'));
    expect(result).toHaveLength(6);
    // Both seeds get their full 3-candidate cap — Dominant's 17 excess
    // candidates are genuinely excluded, not just reordered, because the
    // target (6) is smaller than the pool (23) and Other's full
    // (below-cap) supply already fills the remainder.
    expect(fromDominant).toHaveLength(3);
    expect(fromOther).toHaveLength(3);
  });

  it('never lets a dominant seed exceed the cap when enough other seeds exist to fill the target', () => {
    const seeds = Array.from({ length: 10 }, (_, i) => `Seed ${i}`);
    // One seed has 50 candidates; the other 9 have 3 each (27 total).
    const candidates = [
      ...Array.from({ length: 50 }, (_, i) => candidateWithSeed(`big-${i}`, seeds[0])),
      ...seeds.slice(1).flatMap((seed, seedIndex) => Array.from({ length: 3 }, (_, i) => candidateWithSeed(`s${seedIndex}-${i}`, seed))),
    ];

    const result = diversifySeedCandidates(candidates, 3, 30);

    const fromBig = result.filter((c) => c.candidateId.startsWith('big-'));
    expect(result).toHaveLength(30);
    expect(fromBig.length).toBeLessThanOrEqual(3);
  });

  it('backfills round-robin from remaining seeds, distributing surplus evenly rather than dumping it on the first seed with room', () => {
    // Three seeds with 10 candidates each (30 total), target 18. After
    // the capped first pass (3 per seed = 9), 9 more slots must come
    // from backfill — round-robin means each seed contributes exactly 3
    // more (6 total each), not one seed alone supplying all 9.
    const seeds = ['A', 'B', 'C'];
    const candidates = seeds.flatMap((seed, seedIndex) => Array.from({ length: 10 }, (_, i) => candidateWithSeed(`s${seedIndex}-${i}`, seed)));

    const result = diversifySeedCandidates(candidates, 3, 18);
    const countBySeedIndex = [0, 1, 2].map((seedIndex) => result.filter((c) => c.candidateId.startsWith(`s${seedIndex}-`)).length);

    expect(result).toHaveLength(18);
    expect(countBySeedIndex).toEqual([6, 6, 6]);
  });

  it('keeps every candidate from a seed that naturally produces fewer than the cap', () => {
    const candidates = [candidateWithSeed('c1', 'Sparse Seed'), candidateWithSeed('c2', 'Sparse Seed'), candidateWithSeed('c3', 'Other Seed')];

    const result = diversifySeedCandidates(candidates, 3, 3);

    expect(result.map((c) => c.candidateId).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('never caps a candidate whose seed artist cannot be resolved — always kept, and still counts toward the target', () => {
    const ungrouped = [candidateWithSeed('u1', null), candidateWithSeed('u2', null)];
    const seeded = Array.from({ length: 10 }, (_, i) => candidateWithSeed(`s-${i}`, 'Seed'));
    const candidates = [...ungrouped, ...seeded];

    const result = diversifySeedCandidates(candidates, 1, 4);

    expect(result.filter((c) => c.candidateId.startsWith('u'))).toHaveLength(2);
    expect(result).toHaveLength(4);
  });

  it('never reduces the pool below the target when enough candidates exist to fill it', () => {
    const candidates = Array.from({ length: 50 }, (_, i) => candidateWithSeed(`c${i}`, `Seed ${i % 5}`));

    const result = diversifySeedCandidates(candidates, 3, 20);

    expect(result).toHaveLength(20);
  });

  it('groups seed names case-insensitively', () => {
    // 4 case-variants of the same seed, capped to 3, plus one candidate
    // from a genuinely different seed — target 4 total.
    const candidates = [
      candidateWithSeed('c1', 'Beyoncé'),
      candidateWithSeed('c2', 'beyoncé'),
      candidateWithSeed('c3', 'BEYONCÉ'),
      candidateWithSeed('c4', 'BeyoncÉ'),
      candidateWithSeed('c5', 'Adele'),
    ];

    const result = diversifySeedCandidates(candidates, 3, 4);

    const fromBeyonce = result.filter((c) => c.candidateId !== 'c5');
    expect(result).toHaveLength(4);
    expect(fromBeyonce).toHaveLength(3);
    expect(result.map((c) => c.candidateId)).toContain('c5');
  });

  it('is deterministic — the same input always produces the same output', () => {
    const candidates = [candidateWithSeed('c1', 'A'), candidateWithSeed('c2', 'A'), candidateWithSeed('c3', 'A'), candidateWithSeed('c4', 'B')];

    const first = diversifySeedCandidates(candidates, 2, 3);
    const second = diversifySeedCandidates(candidates, 2, 3);
    expect(first).toEqual(second);
  });

  it('returns an empty array for an empty candidate pool', () => {
    expect(diversifySeedCandidates([], 3, 10)).toEqual([]);
  });

  it('returns an empty array when targetPoolSize is 0', () => {
    const candidates = [candidateWithSeed('c1', 'A')];
    expect(diversifySeedCandidates(candidates, 3, 0)).toEqual([]);
  });
});
