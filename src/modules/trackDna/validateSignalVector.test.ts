import { describe, expect, it } from 'vitest';
import { SIGNAL_CATALOG } from './signalCatalog';
import { validateSignalVector } from './validateSignalVector';

const catalogKeys = SIGNAL_CATALOG.map((definition) => definition.signalKey);

describe('SIGNAL_CATALOG', () => {
  it('has no duplicate signal keys', () => {
    expect(new Set(catalogKeys).size).toBe(catalogKeys.length);
  });

  it('gives every signal a non-empty key and a real description', () => {
    for (const definition of SIGNAL_CATALOG) {
      expect(definition.signalKey.length).toBeGreaterThan(0);
      expect(definition.description.length).toBeGreaterThan(10);
    }
  });

  it('stays within the ~15-20 MVP range (TDS ADR-10)', () => {
    expect(SIGNAL_CATALOG.length).toBeGreaterThanOrEqual(15);
    expect(SIGNAL_CATALOG.length).toBeLessThanOrEqual(20);
  });
});

describe('validateSignalVector', () => {
  it('preserves a fully-populated, well-formed input exactly', () => {
    const fullInput: Record<string, { value: number; confidence: number }> = {};
    for (const key of catalogKeys) {
      fullInput[key] = { value: 0.75, confidence: 0.9 };
    }

    const result = validateSignalVector(fullInput);

    expect(Object.keys(result)).toHaveLength(catalogKeys.length);
    for (const key of catalogKeys) {
      expect(result[key]).toEqual({ value: 0.75, confidence: 0.9 });
    }
  });

  it('turns an empty object into a valid schema with zero confidence everywhere, never throwing', () => {
    const result = validateSignalVector({});

    expect(Object.keys(result)).toHaveLength(catalogKeys.length);
    for (const key of catalogKeys) {
      expect(result[key].confidence).toBe(0);
      expect(Number.isFinite(result[key].value)).toBe(true);
    }
  });

  it.each([null, undefined, 'not an object', 42, [], () => {}])(
    'degrades non-object input (%p) to the same safe default, never throwing',
    (badInput) => {
      const result = validateSignalVector(badInput);
      expect(Object.keys(result)).toHaveLength(catalogKeys.length);
      for (const key of catalogKeys) {
        expect(result[key].confidence).toBe(0);
      }
    },
  );

  it('degrades only the malformed fields, leaving valid fields in the same input untouched', () => {
    // Mirrors v1's `artist.followers.total` crash class: one bad field
    // must never take down the rest of the object.
    const partial = {
      energy: { value: 0.8, confidence: 0.6 }, // valid
      tempo: { value: 'fast', confidence: 0.5 }, // wrong type on value
      valence: { value: 5, confidence: 0.5 }, // out of [0, 1] range
      danceability: { value: 0.5 }, // missing confidence entirely
      mainstream: null, // not even an object
    };

    const result = validateSignalVector(partial);

    expect(Object.keys(result)).toHaveLength(catalogKeys.length);
    expect(result.energy).toEqual({ value: 0.8, confidence: 0.6 });
    expect(result.tempo.confidence).toBe(0);
    expect(result.valence.confidence).toBe(0);
    expect(result.danceability.confidence).toBe(0);
    expect(result.mainstream.confidence).toBe(0);
    // A signal never mentioned in the input must still appear with a default.
    expect(result.rock.confidence).toBe(0);
  });

  it('ignores unknown/extra keys instead of leaking them into the output', () => {
    const result = validateSignalVector({ thisSignalDoesNotExist: { value: 1, confidence: 1 } });
    expect('thisSignalDoesNotExist' in result).toBe(false);
    expect(Object.keys(result)).toHaveLength(catalogKeys.length);
  });

  it('accepts values exactly at the range boundaries (0 and 1) as valid, not malformed', () => {
    const result = validateSignalVector({
      energy: { value: 0, confidence: 1 },
      tempo: { value: 1, confidence: 0.5 },
    });
    expect(result.energy).toEqual({ value: 0, confidence: 1 });
    expect(result.tempo).toEqual({ value: 1, confidence: 0.5 });
  });
});
