import { describe, expect, it } from 'vitest';
import { buildMemoryEntry, isSuppressed } from './rules';
import type { RecommendationMemoryEntry } from './types';

const NOW = new Date('2026-01-01T00:00:00.000Z');

describe('buildMemoryEntry — computes the next entry, or null when ownership is immutable (M29)', () => {
  it('a save outcome, with no existing entry, is suppressed permanently (suppressedUntil: null)', () => {
    const entry = buildMemoryEntry(null, 'c1', 'save', NOW);
    expect(entry).toEqual({ candidateId: 'c1', lastOutcome: 'save', lastOutcomeAt: NOW.toISOString(), suppressedUntil: null });
  });

  it('a reject outcome is suppressed for exactly 60 days', () => {
    const entry = buildMemoryEntry(null, 'c1', 'reject', NOW);
    expect(entry?.suppressedUntil).toBe(new Date('2026-03-02T00:00:00.000Z').toISOString());
  });

  it('a known outcome is suppressed for exactly 30 days', () => {
    const entry = buildMemoryEntry(null, 'c1', 'known', NOW);
    expect(entry?.suppressedUntil).toBe(new Date('2026-01-31T00:00:00.000Z').toISOString());
  });

  it('returns null — ignoring the write — when the existing entry is already a save (ownership is immutable)', () => {
    const existing: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'save', lastOutcomeAt: '2025-06-01T00:00:00.000Z', suppressedUntil: null };
    expect(buildMemoryEntry(existing, 'c1', 'reject', NOW)).toBeNull();
    expect(buildMemoryEntry(existing, 'c1', 'known', NOW)).toBeNull();
    expect(buildMemoryEntry(existing, 'c1', 'save', NOW)).toBeNull();
  });

  it('a non-save existing entry is always freely replaceable — a repeat rejection renews the window from `now`', () => {
    const existing: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'reject', lastOutcomeAt: '2025-06-01T00:00:00.000Z', suppressedUntil: '2025-07-31T00:00:00.000Z' };
    const entry = buildMemoryEntry(existing, 'c1', 'reject', NOW);
    expect(entry?.lastOutcomeAt).toBe(NOW.toISOString());
    expect(entry?.suppressedUntil).toBe(new Date('2026-03-02T00:00:00.000Z').toISOString());
  });

  it('is deterministic — the same inputs always produce the same output', () => {
    expect(buildMemoryEntry(null, 'c1', 'reject', NOW)).toEqual(buildMemoryEntry(null, 'c1', 'reject', NOW));
  });
});

describe('isSuppressed — never suppresses missing data, permanent only for save (M29)', () => {
  it('no entry is never suppressed', () => {
    expect(isSuppressed(null, NOW)).toBe(false);
  });

  it('a save entry (suppressedUntil: null) is suppressed regardless of how far in the future `now` is', () => {
    const entry: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'save', lastOutcomeAt: NOW.toISOString(), suppressedUntil: null };
    expect(isSuppressed(entry, new Date('2099-01-01T00:00:00.000Z'))).toBe(true);
  });

  it('a reject entry is suppressed while `now` is before the window ends', () => {
    const entry: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'reject', lastOutcomeAt: NOW.toISOString(), suppressedUntil: '2026-03-02T00:00:00.000Z' };
    expect(isSuppressed(entry, new Date('2026-02-01T00:00:00.000Z'))).toBe(true);
  });

  it('a reject entry is no longer suppressed once `now` is after the window ends', () => {
    const entry: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'reject', lastOutcomeAt: NOW.toISOString(), suppressedUntil: '2026-03-02T00:00:00.000Z' };
    expect(isSuppressed(entry, new Date('2026-03-03T00:00:00.000Z'))).toBe(false);
  });

  it('is not suppressed at the exact boundary instant — the window has fully elapsed by then', () => {
    const entry: RecommendationMemoryEntry = { candidateId: 'c1', lastOutcome: 'reject', lastOutcomeAt: NOW.toISOString(), suppressedUntil: '2026-03-02T00:00:00.000Z' };
    expect(isSuppressed(entry, new Date('2026-03-02T00:00:00.000Z'))).toBe(false);
  });
});
