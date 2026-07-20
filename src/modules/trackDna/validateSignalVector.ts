import { SIGNAL_CATALOG } from './signalCatalog';
import type { SignalReading, SignalVector } from './types';

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const midpoint = (min: number, max: number): number => min + (max - min) / 2;

/** True only if the raw candidate reading is a well-formed, in-range SignalReading. */
const isValidReading = (raw: unknown, min: number, max: number): raw is SignalReading => {
  if (!isPlainRecord(raw)) return false;
  const { value, confidence } = raw;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return false;
  if (typeof confidence !== 'number' || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) return false;
  return true;
};

/**
 * Normalizes arbitrary, possibly partial or malformed input into a
 * schema-correct SignalVector — one entry per SIGNAL_CATALOG key, never
 * more, never fewer. Never throws, regardless of what's passed in.
 *
 * Per signal: a well-formed, in-range reading is kept as-is; anything
 * else (missing, wrong type, out of range, or the whole input not even
 * being an object) degrades independently to a neutral default —
 * {value: midpoint of the signal's range, confidence: 0} — never a
 * fatal error for the other signals. This is the direct fix for the
 * class of bug behind v1's `artist.followers.total` crash: a missing or
 * unexpected field on one property must never take down everything
 * built on top of it.
 */
export const validateSignalVector = (input: unknown): SignalVector => {
  const source = isPlainRecord(input) ? input : {};

  const result: SignalVector = {};
  for (const definition of SIGNAL_CATALOG) {
    const [min, max] = definition.valueRange;
    const raw = source[definition.signalKey];
    result[definition.signalKey] = isValidReading(raw, min, max)
      ? { value: raw.value, confidence: raw.confidence }
      : { value: midpoint(min, max), confidence: 0 };
  }
  return result;
};
