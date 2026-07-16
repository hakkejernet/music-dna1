import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { shuffle } from '../../lib/shuffle';
import type { SpotifyArtist, SpotifyTrack } from '../../modules/spotify/types';
import { getAllArtists, getAllTracks } from '../../modules/storage';
import { useAuth } from '../auth/AuthContext';
import { ActionBar } from './components/ActionBar';
import { DiscoveryCard } from './components/DiscoveryCard';
import { WhyPanel } from './components/WhyPanel';

type LoadState =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'ready'; queue: SpotifyTrack[]; artistById: Map<string, SpotifyArtist> };

const ACTION_LABELS = {
  save: 'Gemt ❤️',
  reject: 'Afvist ❌',
  known: 'Kendte allerede 👀',
  next: 'Sprunget over ➡',
} as const;

export const DiscoveryPage = () => {
  const { logout } = useAuth();
  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const [tracks, artists] = await Promise.all([getAllTracks(), getAllArtists()]);
      if (tracks.length === 0) {
        setState({ status: 'empty' });
        return;
      }
      setState({
        status: 'ready',
        queue: shuffle(tracks),
        artistById: new Map(artists.map((artist) => [artist.id, artist])),
      });
    })();
  }, []);

  const currentTrack = useMemo(() => {
    if (state.status !== 'ready') return null;
    return state.queue[currentIndex % state.queue.length];
  }, [state, currentIndex]);

  const currentGenre = useMemo(() => {
    if (state.status !== 'ready' || !currentTrack) return null;
    for (const artistRef of currentTrack.artists) {
      const genre = state.artistById.get(artistRef.id)?.genres[0];
      if (genre) return genre;
    }
    return null;
  }, [state, currentTrack]);

  const advance = useCallback((actionKey: keyof typeof ACTION_LABELS) => {
    setLastAction(ACTION_LABELS[actionKey]);
    setWhyOpen(false);
    setCurrentIndex((index) => index + 1);
  }, []);

  if (state.status === 'loading') {
    return <div className="dashboard-status">Indlæser dit bibliotek...</div>;
  }

  if (state.status === 'empty') {
    return (
      <div className="dashboard-status">
        <h2>Intet at opdage endnu</h2>
        <p>Dit bibliotek er ikke synkroniseret endnu.</p>
        <Link className="btn btn--spotify" to="/music-dna">
          Gå til Music DNA for at synkronisere
        </Link>
      </div>
    );
  }

  if (!currentTrack) return null;

  return (
    <div className="discovery">
      <header className="discovery__header">
        <div>
          <h1>Discovery</h1>
          <p className="discovery__subtitle">
            Én sang ad gangen. Ingen anbefalings-algoritme endnu — bare UI'et.
          </p>
        </div>
        <button type="button" onClick={logout}>
          Log ud
        </button>
      </header>

      {lastAction && <p className="discovery__last-action">Sidste handling: {lastAction}</p>}

      <DiscoveryCard track={currentTrack} genre={currentGenre} />

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
