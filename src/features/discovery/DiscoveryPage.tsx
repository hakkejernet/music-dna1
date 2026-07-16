import { useState } from 'react';
import { createMockRecommendations, getPrimaryGenre, RecommendationQueue } from '../../modules/recommendations';
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
  const [queue] = useState(() => new RecommendationQueue(createMockRecommendations()));
  const [current, setCurrent] = useState(() => queue.current());
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  const advance = (actionKey: keyof typeof ACTION_LABELS) => {
    setLastAction(ACTION_LABELS[actionKey]);
    setWhyOpen(false);
    setCurrent(queue.advance());
  };

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
