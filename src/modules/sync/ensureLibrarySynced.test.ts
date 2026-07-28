import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getMeta } = vi.hoisted(() => ({ getMeta: vi.fn<(key: string) => Promise<string | number | undefined>>() }));
vi.mock('../storage', () => ({ getMeta }));

const { runFullSync } = vi.hoisted(() => ({ runFullSync: vi.fn<() => Promise<void>>() }));
vi.mock('./syncService', () => ({ runFullSync }));

/** Lets pending microtasks (the fire-and-forget async IIFE inside ensureLibrarySynced) settle before assertions run. */
const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  getMeta.mockResolvedValue(undefined);
  runFullSync.mockResolvedValue(undefined);
});

describe('ensureLibrarySynced — starts a sync only when the library has never been synced (idempotent by contract)', () => {
  it('starts runFullSync when lastSyncedAt is unset', async () => {
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(undefined);

    ensureLibrarySynced();
    await flushMicrotasks();

    expect(runFullSync).toHaveBeenCalledTimes(1);
  });

  it('does not start a sync when lastSyncedAt is already set', async () => {
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(1700000000000);

    ensureLibrarySynced();
    await flushMicrotasks();

    expect(runFullSync).not.toHaveBeenCalled();
  });

  it('is safe to call multiple times — every call after the first is a no-op', async () => {
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(undefined);

    ensureLibrarySynced();
    ensureLibrarySynced();
    ensureLibrarySynced();
    await flushMicrotasks();

    expect(runFullSync).toHaveBeenCalledTimes(1);
  });

  it('is safe under React StrictMode-style synchronous double-invocation — the guard is set before any await', async () => {
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(undefined);

    // StrictMode invokes an effect, its cleanup, and the effect again,
    // synchronously in the same tick — simulated here as two calls with
    // no await in between.
    ensureLibrarySynced();
    ensureLibrarySynced();
    await flushMicrotasks();

    expect(runFullSync).toHaveBeenCalledTimes(1);
    expect(getMeta).toHaveBeenCalledTimes(1);
  });

  it('never starts a second, concurrent runFullSync() even if the first has not resolved yet', async () => {
    let resolveFirstSync!: () => void;
    runFullSync.mockImplementation(() => new Promise((resolve) => { resolveFirstSync = resolve; }));
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(undefined);

    ensureLibrarySynced();
    await flushMicrotasks();
    ensureLibrarySynced(); // simulates a remount (e.g. navigating between routes) while the first sync is still in flight
    await flushMicrotasks();

    expect(runFullSync).toHaveBeenCalledTimes(1);
    resolveFirstSync();
  });

  it('never throws — a runFullSync() failure is caught and logged, not propagated', async () => {
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(undefined);
    runFullSync.mockRejectedValue(new Error('spotify unreachable'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(() => ensureLibrarySynced()).not.toThrow();
    await flushMicrotasks();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns void, never a Promise a caller could await or branch on', async () => {
    const { ensureLibrarySynced } = await import('./ensureLibrarySynced');
    getMeta.mockResolvedValue(undefined);

    expect(ensureLibrarySynced()).toBeUndefined();
  });
});
