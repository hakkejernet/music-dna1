import { useEffect, useState } from 'react';
import { getPrimaryGenre, loadRecommendationQueue, RecommendationQueue } from '../../modules/recommendations';
import type { Recommendation } from '../../modules/recommendations';
import { useAuth } from '../auth/AuthContext';
import { ActionBar } from './components/ActionBar';
import { DiscoveryCard } from './components/DiscoveryCard';
import { WhyPanel } from './components/WhyPanel';

const ACTION_LABELS = {
  save: 'Gemt ❤️',
  reject: 'Afvist ❌',
  known: 'Kendte allerede 👀',
  next: 'Sprunget over ➡',
} as const;

export const DiscoveryPage = () => {
  const { logout } = useAuth();
  const [queue, setQueue] = useState<RecommendationQueue | null>(null);
  const [current, setCurrent] = useState<Recommendation | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const loaded = await loadRecommendationQueue();
      if (cancelled) return;
      setQueue(loaded);
      setCurrent(loaded.current());
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const advance = (actionKey: keyof typeof ACTION_LABELS) => {
    if (!queue) return;
    setLastAction(ACTION_LABELS[actionKey]);
    setWhyOpen(false);
    setCurrent(queue.advance());
  };

  if (!queue) {
    return <div className="dashboard-status">Finder ny musik til dig...</div>;
  }

  if (queue.isEmpty() || !current) {
    return (
      <div className="dashboard-status">
        <h2>Ingen anbefalinger endnu</h2>
        <p>Recommendation-køen er tom lige nu.</p>
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
        <button type="button" onClick={logout}>
          Log ud
        </button>
      </header>

      {lastAction && <p className="discovery__last-action">Sidste handling: {lastAction}</p>}

      <DiscoveryCard track={current.track} genre={getPrimaryGenre(current)} />

      <ActionBar
        onSave={() => advance('save')}
        onReject={() => advance('reject')}
        onKnown={() => advance('known')}
        onNext={() => advance('next')}
        onWhy={() => setWhyOpen(true)}
      />

      <WhyPanel open={whyOpen} onClose={() => setWhyOpen(false)} />
    </div>
  );
};
