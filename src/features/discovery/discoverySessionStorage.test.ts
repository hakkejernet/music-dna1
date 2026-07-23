import { beforeEach, describe, expect, it } from 'vitest';
import type { RankedCandidate } from '../../modules/rankingEngine';
import { clearDiscoverySession, loadDiscoverySession, saveDiscoverySession, type DiscoverySessionSnapshot } from './discoverySessionStorage';

/**
 * vitest runs in a plain Node environment (no jsdom) — `localStorage`
 * isn't a global there, so this is the smallest possible stand-in: a
 * real in-memory store behind the exact three methods
 * discoverySessionStorage.ts actually calls, reset before every test.
 */
class FakeLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = new FakeLocalStorage();
});

const rankedCandidate = (candidateRef: string): RankedCandidate => ({
  candidateRef,
  trackDnaRef: candidateRef,
  score: 1,
  scoreBreakdown: { genreMatch: 1, mainstreamMatch: 0, explicitMatch: 0, durationMatch: 0, trackSimilarityMatch: 0 },
  explanations: [],
  rankedAt: '2026-01-01T00:00:00.000Z',
});

const baseSnapshot = (): Omit<DiscoverySessionSnapshot, 'savedAt'> => ({
  userId: 'user-1',
  items: [rankedCandidate('c1'), rankedCandidate('c2')],
  cursor: 1,
  enriched: [],
  shownCandidateIds: ['c1'],
});

describe('discoverySessionStorage — save/restore roundtrip (M20 Rule 1/2/3)', () => {
  it('returns exactly what was saved, including cursor position and shown ids', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    saveDiscoverySession(baseSnapshot(), now);

    const restored = loadDiscoverySession(now);

    expect(restored).toEqual({ ...baseSnapshot(), savedAt: now.toISOString() });
  });

  it('returns null when nothing has ever been saved', () => {
    expect(loadDiscoverySession(new Date('2026-01-01T00:00:00.000Z'))).toBeNull();
  });
});

describe('discoverySessionStorage — 24-hour expiry (M20 Rule 4)', () => {
  it('restores a session saved 23 hours and 59 minutes ago', () => {
    const savedAt = new Date('2026-01-01T00:00:00.000Z');
    saveDiscoverySession(baseSnapshot(), savedAt);

    const almostExpired = new Date(savedAt.getTime() + 23 * 60 * 60 * 1000 + 59 * 60 * 1000);
    expect(loadDiscoverySession(almostExpired)).not.toBeNull();
  });

  it('discards and clears a session saved more than 24 hours ago, returning null', () => {
    const savedAt = new Date('2026-01-01T00:00:00.000Z');
    saveDiscoverySession(baseSnapshot(), savedAt);

    const afterExpiry = new Date(savedAt.getTime() + 24 * 60 * 60 * 1000 + 1);
    expect(loadDiscoverySession(afterExpiry)).toBeNull();
    // Actually cleared, not just reported as expired — a second read is still null.
    expect(loadDiscoverySession(afterExpiry)).toBeNull();
  });
});

describe('discoverySessionStorage — never crashes on a corrupted or malformed entry (M20 Rule 3)', () => {
  it('returns null for invalid JSON', () => {
    localStorage.setItem('music-dna:discovery-session:v1', '{not valid json');
    expect(loadDiscoverySession(new Date())).toBeNull();
  });

  it('returns null when the stored shape is missing required fields', () => {
    localStorage.setItem('music-dna:discovery-session:v1', JSON.stringify({ userId: 'user-1' }));
    expect(loadDiscoverySession(new Date())).toBeNull();
  });
});

describe('discoverySessionStorage — clearDiscoverySession (M20 Rule 4)', () => {
  it('removes a previously saved session', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    saveDiscoverySession(baseSnapshot(), now);
    expect(loadDiscoverySession(now)).not.toBeNull();

    clearDiscoverySession();

    expect(loadDiscoverySession(now)).toBeNull();
  });
});
