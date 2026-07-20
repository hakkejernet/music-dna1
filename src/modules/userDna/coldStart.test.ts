import { describe, expect, it } from 'vitest';
import { buildColdStartUserDna } from './coldStart';
import type { LibrarySnapshot } from './librarySnapshot';

const FIXED_NOW = new Date('2026-01-01T00:00:00.000Z');

// Signals this milestone has no honest Spotify-derived basis for at all
// (see docs/IMPLEMENTATION_ROADMAP.md M2 Review Report) — must stay at
// confidence 0 no matter how rich the library input is.
const ALWAYS_UNKNOWN_SIGNALS = [
  'energy',
  'tempo',
  'valence',
  'acousticness',
  'danceability',
  'aggressiveness',
  'melodicStrength',
  'instrumentalness',
  'vocalMale',
  'vocalFemale',
];

const richLibrary: LibrarySnapshot = {
  topArtists: [
    { genres: ['dream pop', 'indie pop'], popularity: 40 },
    { genres: ['pop rap', 'trap'], popularity: 85 },
    { genres: ['house', 'electronic'], popularity: 60 },
  ],
  savedTracks: [
    { explicit: true, durationMs: 200_000 },
    { explicit: false, durationMs: 180_000 },
    { explicit: true, durationMs: 220_000 },
  ],
};

describe('buildColdStartUserDna — Design Principle 1 (deterministic)', () => {
  it('produces byte-identical output for identical input, called twice', () => {
    const first = buildColdStartUserDna('user-1', richLibrary, FIXED_NOW);
    const second = buildColdStartUserDna('user-1', richLibrary, FIXED_NOW);
    expect(second).toEqual(first);
  });

  it('never varies across repeated calls even for an empty library', () => {
    const empty: LibrarySnapshot = { topArtists: null, savedTracks: null };
    const first = buildColdStartUserDna('user-1', empty, FIXED_NOW);
    const second = buildColdStartUserDna('user-1', empty, FIXED_NOW);
    expect(second).toEqual(first);
  });
});

describe('buildColdStartUserDna — Design Principle 2 (low confidence, always a starting point)', () => {
  it('never assigns more than a low, fixed confidence to any computed signal', () => {
    const dna = buildColdStartUserDna('user-1', richLibrary, FIXED_NOW);
    for (const reading of Object.values(dna.signals)) {
      expect(reading.confidence).toBeLessThanOrEqual(0.2);
    }
  });

  it('marks the result as coldStart, regardless of how much library data was available', () => {
    const dna = buildColdStartUserDna('user-1', richLibrary, FIXED_NOW);
    expect(dna.coldStart).toBe(true);
  });
});

describe('buildColdStartUserDna — Design Principle 3 (unknown, never guessed)', () => {
  it('leaves every signal Spotify basic library data cannot support at zero confidence, even with a rich library', () => {
    const dna = buildColdStartUserDna('user-1', richLibrary, FIXED_NOW);
    for (const signalKey of ALWAYS_UNKNOWN_SIGNALS) {
      expect(dna.signals[signalKey].confidence).toBe(0);
    }
  });
});

describe('buildColdStartUserDna — Design Principle 4 (no single feature dependency)', () => {
  it('still computes explicitness/songLength when topArtists is missing', () => {
    const snapshot: LibrarySnapshot = { topArtists: null, savedTracks: richLibrary.savedTracks };
    const dna = buildColdStartUserDna('user-1', snapshot, FIXED_NOW);

    expect(dna.signals.explicitness.confidence).toBeGreaterThan(0);
    expect(dna.signals.songLength.confidence).toBeGreaterThan(0);
    // The artist-derived signals must degrade gracefully, not crash the rest.
    expect(dna.signals.mainstream.confidence).toBe(0);
    expect(dna.signals.pop.confidence).toBe(0);
  });

  it('still computes genre/mainstream signals when savedTracks is missing', () => {
    const snapshot: LibrarySnapshot = { topArtists: richLibrary.topArtists, savedTracks: null };
    const dna = buildColdStartUserDna('user-1', snapshot, FIXED_NOW);

    expect(dna.signals.mainstream.confidence).toBeGreaterThan(0);
    expect(dna.signals.pop.confidence).toBeGreaterThan(0);
    expect(dna.signals.explicitness.confidence).toBe(0);
    expect(dna.signals.songLength.confidence).toBe(0);
  });

  it('handles empty arrays the same way as missing data — no division-by-zero crash', () => {
    const snapshot: LibrarySnapshot = { topArtists: [], savedTracks: [] };
    expect(() => buildColdStartUserDna('user-1', snapshot, FIXED_NOW)).not.toThrow();
    const dna = buildColdStartUserDna('user-1', snapshot, FIXED_NOW);
    for (const reading of Object.values(dna.signals)) {
      expect(reading.confidence).toBe(0);
    }
  });
});

describe('buildColdStartUserDna — acceptance criteria (docs/IMPLEMENTATION_ROADMAP.md M2)', () => {
  it('gives a fully-populated UserDNA for a real library — inspectable, not just theoretically present', () => {
    const dna = buildColdStartUserDna('user-1', richLibrary, FIXED_NOW);
    expect(dna.userId).toBe('user-1');
    expect(dna.version).toBe(1);
    expect(dna.updatedAt).toBe(FIXED_NOW.toISOString());
    expect(Object.keys(dna.signals).length).toBeGreaterThan(0);
  });

  it('produces visibly different profiles for two clearly different libraries', () => {
    const rockHeavy: LibrarySnapshot = {
      topArtists: [
        { genres: ['classic rock'], popularity: 50 },
        { genres: ['hard rock'], popularity: 55 },
      ],
      savedTracks: null,
    };
    const popHeavy: LibrarySnapshot = {
      topArtists: [
        { genres: ['dance pop'], popularity: 90 },
        { genres: ['pop'], popularity: 88 },
      ],
      savedTracks: null,
    };

    const rockDna = buildColdStartUserDna('user-rock', rockHeavy, FIXED_NOW);
    const popDna = buildColdStartUserDna('user-pop', popHeavy, FIXED_NOW);

    expect(rockDna.signals.rock.value).toBeGreaterThan(popDna.signals.rock.value);
    expect(popDna.signals.pop.value).toBeGreaterThan(rockDna.signals.pop.value);
    expect(popDna.signals.mainstream.value).toBeGreaterThan(rockDna.signals.mainstream.value);
  });

  it('gives a user with a near-empty library a valid, neutral UserDNA — not an error', () => {
    const nearEmpty: LibrarySnapshot = { topArtists: [], savedTracks: null };
    const dna = buildColdStartUserDna('user-empty', nearEmpty, FIXED_NOW);

    expect(dna.userId).toBe('user-empty');
    expect(dna.coldStart).toBe(true);
    for (const reading of Object.values(dna.signals)) {
      expect(reading.confidence).toBe(0);
      expect(Number.isFinite(reading.value)).toBe(true);
    }
  });
});
