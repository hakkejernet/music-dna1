import type { EnrichedCandidate } from '../../modules/enrichment';
import type { RankedCandidate } from '../../modules/rankingEngine';

const STORAGE_KEY = 'music-dna:discovery-session:v1';

/** M20 Rule 4 — a session older than this is treated as if it never existed. */
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Everything needed to resume Discovery exactly where the user left
 * off: the ranked queue's own state (`items` + `cursor`, mirroring
 * `RecommendationQueue.toSnapshot()`/`restore()`), the display data for
 * those candidates (`enriched`, since `RankedCandidate` alone carries no
 * title/artists), and every candidate ever shown this session (so
 * M19's refill mechanism keeps excluding them after a reload, not just
 * within one page load).
 */
export interface DiscoverySessionSnapshot {
  userId: string;
  items: RankedCandidate[];
  cursor: number;
  enriched: Array<[string, EnrichedCandidate]>;
  shownCandidateIds: string[];
  savedAt: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

/** Deliberately conservative: any shape mismatch is treated the same as "no session" (M20 Rule 3) rather than risking a crash on a malformed or hand-edited localStorage value. */
const isValidSnapshot = (value: unknown): value is DiscoverySessionSnapshot =>
  isRecord(value) &&
  typeof value.userId === 'string' &&
  Array.isArray(value.items) &&
  typeof value.cursor === 'number' &&
  Array.isArray(value.enriched) &&
  Array.isArray(value.shownCandidateIds) &&
  typeof value.savedAt === 'string';

export const saveDiscoverySession = (snapshot: Omit<DiscoverySessionSnapshot, 'savedAt'>, now: Date): void => {
  const withTimestamp: DiscoverySessionSnapshot = { ...snapshot, savedAt: now.toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(withTimestamp));
};

export const clearDiscoverySession = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

/**
 * Returns the stored session only if it exists, parses, has the
 * expected shape, and is younger than the 24-hour TTL (M20 Rule 4) —
 * an expired or invalid entry is cleared here and `null` is returned,
 * so the caller always sees a clean "start a new session" signal
 * rather than having to check expiry itself.
 */
export const loadDiscoverySession = (now: Date): DiscoverySessionSnapshot | null => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    clearDiscoverySession();
    return null;
  }

  if (!isValidSnapshot(parsed)) {
    clearDiscoverySession();
    return null;
  }

  const age = now.getTime() - new Date(parsed.savedAt).getTime();
  if (!Number.isFinite(age) || age > SESSION_TTL_MS) {
    clearDiscoverySession();
    return null;
  }

  return parsed;
};
