import { getMeta } from '../storage';
import { runFullSync } from './syncService';

/**
 * Module-level, not component-level: this flag is what makes the
 * idempotency guarantee below belong to this function itself, not to
 * whichever component happens to call it. It persists for the life of
 * this module instance (i.e. the whole browser tab session) — a fresh
 * page load is a fresh module instance, and therefore a legitimate
 * fresh attempt.
 */
let syncTriggered = false;

/**
 * Starts a full library sync at most once per page load, if (and only
 * if) the library has never been synced before (`getMeta('lastSyncedAt')`
 * is unset). Intended to be called from the authenticated application
 * bootstrap (e.g. `RequireAuth`) — see App.tsx.
 *
 * Contract (guaranteed by this function itself, not by caller discipline
 * or component lifecycle):
 * - Safe to call multiple times: every call after the first is a no-op.
 * - Safe under React StrictMode's double-invoked effects: the guard is
 *   set synchronously, before any `await`, so two calls in the same
 *   tick still only start one sync.
 * - Safe across component remounts (e.g. navigating between routes
 *   that each independently gate on authentication): the guard is
 *   module state, not component state, so it survives unmount/remount.
 * - Never starts a second, concurrent `runFullSync()` — at most one
 *   sync is ever in flight per page load, regardless of how many times
 *   or from how many call sites this function is invoked.
 *
 * Fire-and-forget by design (returns `void`, not a Promise): a sync
 * failure is caught and logged here, never thrown to the caller — the
 * caller (an authenticated route rendering immediately) must never be
 * blocked or broken by this. `runFullSync()` itself is completely
 * unmodified; this only decides *whether* and *when* to call it.
 */
export const ensureLibrarySynced = (): void => {
  if (syncTriggered) return;
  syncTriggered = true;

  void (async () => {
    try {
      const lastSyncedAt = await getMeta('lastSyncedAt');
      if (!lastSyncedAt) await runFullSync();
    } catch (error) {
      console.warn('[bootstrap] Kunne ikke synkronisere biblioteket automatisk:', error);
    }
  })();
};
