import { useEffect, useState } from 'react';
import { isDebugModeEnabled } from '../../lib/debugMode';
import { getRecommendationDiagnostics, type RecommendationDiagnostics } from '../../modules/diagnostics';
import { getSavedCount, rejectRecommendation, saveRecommendation } from '../../modules/history';
import type { RankedRecommendation } from '../../modules/ranking';
import { getPrimaryGenre, loadRecommendationQueue, RecommendationQueue } from '../../modules/recommendations';
import { getGrantedScopes } from '../../modules/spotify';
import { getInstantSpotifyUrl, resolveSpotifyTrackUrl } from '../../modules/spotifyLink';
import { useAuth } from '../auth/AuthContext';
import { ActionBar } from './components/ActionBar';
import { DebugPanel } from './components/DebugPanel';
import { DiscoveryCard } from './components/DiscoveryCard';
import { OpenInSpotifyButton } from './components/OpenInSpotifyButton';
import { RejectReasonPanel } from './components/RejectReasonPanel';
import { WhyPanel } from './components/WhyPanel';

const ACTION_LABELS = {
  save: 'Gemt ❤️',
  reject: 'Afvist ❌',
  known: 'Kendte allerede 👀',
  next: 'Sprunget over ➡',
} as const;

type SimpleActionKey = 'save' | 'known' | 'next';

export const DiscoveryPage = () => {
  const { logout } = useAuth();
  const [queue, setQueue] = useState<RecommendationQueue<RankedRecommendation> | null>(null);
  const [current, setCurrent] = useState<RankedRecommendation | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [rejectPanelOpen, setRejectPanelOpen] = useState(false);
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<RecommendationDiagnostics | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [loaded, savedTotal] = await Promise.all([loadRecommendationQueue(), getSavedCount()]);
      if (cancelled) return;
      setQueue(loaded);
      setCurrent(loaded.current());
      setSavedCount(savedTotal);
      setDiagnostics(getRecommendationDiagnostics());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!current) {
      setSpotifyUrl(null);
      return;
    }

    const title = current.track.name;
    const artist = current.track.artists[0]?.name ?? '';
    // Instant, always-valid fallback first — a real href must be ready
    // before any click, or mobile Safari blocks the async-resolved one.
    setSpotifyUrl(getInstantSpotifyUrl(title, artist, current.spotifyTrackId));

    let cancelled = false;
    void resolveSpotifyTrackUrl(title, artist, current.spotifyTrackId).then((result) => {
      if (!cancelled) setSpotifyUrl(result.url);
    });
    return () => {
      cancelled = true;
    };
  }, [current]);

  const finishAction = (actionKey: keyof typeof ACTION_LABELS, next: RankedRecommendation | null) => {
    setLastAction(ACTION_LABELS[actionKey]);
    setWhyOpen(false);
    setCurrent(next);
  };

  const handleAction = async (actionKey: SimpleActionKey) => {
    if (!queue || !current) return;

    let next: RankedRecommendation | null;
    if (actionKey === 'save') {
      await saveRecommendation(current);
      queue.remove(current.id);
      setSavedCount((count) => count + 1);
      next = queue.current();
    } else {
      next = queue.advance();
    }

    finishAction(actionKey, next);
  };

  const handleRejectResolved = async (reason: string | null) => {
    setRejectPanelOpen(false);
    if (!queue || !current) return;
    await rejectRecommendation(current, reason);
    finishAction('reject', queue.advance());
  };

  // Debug diagnostics — not a product feature, just visibility into why the
  // recommendation pipeline produced what it did. Activated via ?debug=1
  // (see src/lib/debugMode.ts) so it also works on a deployed production
  // build — never shown to a normal user, since that query param is never
  // present unless someone deliberately adds it.
  const debugOverlay = isDebugModeEnabled() && diagnostics && (
    <>
      <button type="button" className="debug-toggle" onClick={() => setDebugOpen(true)}>
        🐛 Debug
      </button>
      <DebugPanel open={debugOpen} onClose={() => setDebugOpen(false)} diagnostics={diagnostics} scopes={getGrantedScopes()} />
    </>
  );

  if (!queue) {
    return (
      <div className="dashboard-status">
        Finder ny musik til dig...
        {debugOverlay}
      </div>
    );
  }

  if (queue.isEmpty() || !current) {
    return (
      <div className="dashboard-status">
        <h2>Ingen anbefalinger endnu</h2>
        <p>Recommendation-køen er tom lige nu.</p>
        {debugOverlay}
      </div>
    );
  }

  return (
    <div className="discovery">
      <header className="discovery__header">
        <div>
          <h1>Discovery</h1>
          <p className="discovery__subtitle">
            Ny musik fra din recommendation-kø — ikke dit eget bibliotek.
          </p>
        </div>
        <div className="discovery__header-actions">
          <span className="discovery__saved-count">❤️ {savedCount} gemt</span>
          <button type="button" onClick={logout}>
            Log ud
          </button>
        </div>
      </header>

      {lastAction && <p className="discovery__last-action">Sidste handling: {lastAction}</p>}

      <DiscoveryCard track={current.track} genre={getPrimaryGenre(current)} />

      {spotifyUrl && <OpenInSpotifyButton href={spotifyUrl} />}

      <ActionBar
        onSave={() => void handleAction('save')}
        onReject={() => setRejectPanelOpen(true)}
        onKnown={() => void handleAction('known')}
        onNext={() => void handleAction('next')}
        onWhy={() => setWhyOpen(true)}
      />

      <WhyPanel open={whyOpen} onClose={() => setWhyOpen(false)} explanations={current.explanations} />
      <RejectReasonPanel open={rejectPanelOpen} onResolve={(reason) => void handleRejectResolved(reason)} />
      {debugOverlay}
    </div>
  );
};
