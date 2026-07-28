import { useCallback, useEffect, useState } from 'react';
import { computeMusicDna, type MusicDna } from '../../modules/analysis';
import { getAllArtists, getAllPlaylists, getAllTracks, getMeta } from '../../modules/storage';
import { runFullSync, type SyncProgress } from '../../modules/sync';
import { useAuth } from '../auth/AuthContext';
import { EraTimeline } from './components/EraTimeline';
import { GenreBreakdown } from './components/GenreBreakdown';
import { PopularitySpectrum } from './components/PopularitySpectrum';
import { StatsSummary } from './components/StatsSummary';
import { TopArtists } from './components/TopArtists';

type ViewState =
  | { status: 'checking' }
  | { status: 'syncing'; progress: SyncProgress | null }
  | { status: 'error'; message: string }
  | { status: 'ready'; dna: MusicDna; lastSyncedAt: number | null };

export const DashboardPage = () => {
  const { logout } = useAuth();
  const [state, setState] = useState<ViewState>({ status: 'checking' });

  const loadFromStorage = useCallback(async () => {
    const [tracks, artists, playlists, lastSyncedAt] = await Promise.all([
      getAllTracks(),
      getAllArtists(),
      getAllPlaylists(),
      getMeta('lastSyncedAt'),
    ]);
    const dna = computeMusicDna(tracks, artists, playlists);
    setState({
      status: 'ready',
      dna,
      lastSyncedAt: typeof lastSyncedAt === 'number' ? lastSyncedAt : null,
    });
  }, []);

  const startSync = useCallback(async () => {
    setState({ status: 'syncing', progress: null });
    try {
      await runFullSync((progress) => setState({ status: 'syncing', progress }));
      await loadFromStorage();
    } catch (error) {
      setState({ status: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }, [loadFromStorage]);

  /**
   * Deciding *whether* to start a sync is no longer this page's job —
   * that now belongs to `ensureLibrarySynced()`, called from the
   * authenticated application bootstrap (`RequireAuth` in App.tsx).
   * This page only ever reads whatever is currently in storage,
   * whether that's a fully synced library, a partially-synced one
   * (bootstrap sync still in flight), or nothing yet — the existing
   * `computeMusicDna`/`ready` rendering already handles an empty
   * result the same way it already handles a sparse one. The manual
   * "Opdater bibliotek" button below still calls `startSync()`
   * directly, unchanged — that's an explicit user action, not
   * automatic initialization.
   */
  useEffect(() => {
    void loadFromStorage();
  }, [loadFromStorage]);

  if (state.status === 'checking') {
    return <div className="dashboard-status">Indlæser...</div>;
  }

  if (state.status === 'syncing') {
    return (
      <div className="dashboard-status">
        <h2>Bygger dit Music DNA</h2>
        <p>{state.progress?.message ?? 'Starter...'}</p>
        {state.progress && state.progress.total > 1 && (
          <progress className="sync-progress" value={state.progress.completed} max={state.progress.total} />
        )}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="dashboard-status dashboard-status--error">
        <h2>Noget gik galt</h2>
        <p>{state.message}</p>
        <div className="dashboard-status__actions">
          <button type="button" onClick={() => void startSync()}>
            Prøv igen
          </button>
          <button type="button" onClick={logout}>
            Log ud
          </button>
        </div>
      </div>
    );
  }

  const { dna, lastSyncedAt } = state;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div>
          <h1>Dit Music DNA</h1>
          {lastSyncedAt && (
            <p className="dashboard__synced-at">
              Sidst opdateret {new Date(lastSyncedAt).toLocaleString('da-DK')}
            </p>
          )}
        </div>
        <div className="dashboard__actions">
          <button type="button" onClick={() => void startSync()}>
            Opdater bibliotek
          </button>
          <button type="button" onClick={logout}>
            Log ud
          </button>
        </div>
      </header>

      <StatsSummary dna={dna} />

      <div className="dashboard__grid">
        <GenreBreakdown genres={dna.genres} />
        <EraTimeline decades={dna.decades} />
        <PopularitySpectrum buckets={dna.popularityBuckets} />
        <TopArtists artists={dna.topArtists} />
      </div>
    </div>
  );
};
