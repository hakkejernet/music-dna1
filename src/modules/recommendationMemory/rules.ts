import type { RecommendationMemoryEntry, RecommendationOutcome } from './types';

/**
 * Fixed, documented, undertuned retention windows — not derived from any
 * real usage data (the same "simplest correct implementation, not a
 * tuned model" posture as every other constant in this codebase, e.g.
 * M2's cold-start confidence, M26's popularity reference ceiling).
 * `save` has no window at all: ownership, not a decaying preference.
 */
const REJECTED_RETENTION_DAYS = 60;
const KNOWN_RETENTION_DAYS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const addDays = (date: Date, days: number): Date => new Date(date.getTime() + days * MS_PER_DAY);

/**
 * The one place M29 Rule 2's immutability requirement is enforced:
 * ownership (a `save` outcome) is permanent, so once `existing.lastOutcome`
 * is `'save'`, no later call may replace it — this returns `null` to mean
 * "ignore this write" rather than computing a new entry. Every other
 * existing outcome (including a prior `reject` or `known`) is always
 * freely replaceable; only `save` is immutable.
 *
 * Pure and deterministic: `now` is an explicit parameter, never sampled
 * internally (M29 Rule 3 — the same convention every domain function in
 * this codebase already follows, from buildColdStartUserDna onward).
 */
export const buildMemoryEntry = (
  existing: RecommendationMemoryEntry | null,
  candidateId: string,
  outcome: RecommendationOutcome,
  now: Date,
): RecommendationMemoryEntry | null => {
  if (existing?.lastOutcome === 'save') return null;

  const suppressedUntil =
    outcome === 'save'
      ? null
      : outcome === 'reject'
        ? addDays(now, REJECTED_RETENTION_DAYS).toISOString()
        : addDays(now, KNOWN_RETENTION_DAYS).toISOString();

  return { candidateId, lastOutcome: outcome, lastOutcomeAt: now.toISOString(), suppressedUntil };
};

/**
 * `null`/missing entry is never suppressed — the same "missing data must
 * never act like a bad match" posture used throughout this codebase (M1
 * onward), applied here to exposure history instead of signal confidence.
 * `suppressedUntil === null` means permanent (a `save` entry); otherwise
 * suppressed only while `now` is strictly before that timestamp — the
 * boundary instant itself is not suppressed, so a window fully elapses
 * at its own end, not one tick after.
 */
export const isSuppressed = (entry: RecommendationMemoryEntry | null, now: Date): boolean => {
  if (entry === null) return false;
  if (entry.suppressedUntil === null) return true;
  return now < new Date(entry.suppressedUntil);
};
