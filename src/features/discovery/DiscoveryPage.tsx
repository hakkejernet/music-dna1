import { useEffect, useMemo, useState } from 'react';
import { useAppContext } from '../../AppContextProvider';
import { processReactionEvent, type LearningEvent } from '../../modules/feedbackPipeline';
import { buildLibrarySnapshot } from '../../modules/infrastructure';
import { RecommendationQueue } from '../../modules/queue';
import type { ReactionType } from '../../modules/queue';
import type { EnrichedCandidate } from '../../modules/enrichment';
import { getCurrentUser } from '../../modules/spotify';
import { getInstantSpotifyUrl, resolveSpotifyTrackUrl } from '../../modules/spotifyLink';
import { useAuth } from '../auth/AuthContext';
import { ActionBar } from './components/ActionBar';
import { RecommendationCard } from './components/RecommendationCard';

/** How many real candidates one Spotify-Library → Candidate Provider → Ranking pass fetches (Sprint 1 Rule 1) — a fixed, small batch, not a paginated feed. */
const DISCOVERY_LIMIT = 15;

const ACTION_LABELS: Record<ReactionType, string> = {
  save: 'Gemt ❤️',
  reject: 'Sprunget over ❌',
  known: 'Kendte allerede 👀',
};

export const DiscoveryPage = () => {
  const { logout } = useAuth();
  const appContext = useAppContext();

  const [userId, setUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<RecommendationQueue | null>(null);
  const [enrichedById, setEnrichedById] = useState<ReadonlyMap<string, EnrichedCandidate>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [spotifyUrl, setSpotifyUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const user = await getCurrentUser();
      if (cancelled) return;
      setUserId(user.id);

      const snapshot = await buildLibrarySnapshot();
      if (cancelled) return;

      const result = await appContext.useCases.buildDiscoveryQueue.execute(user.id, snapshot, DISCOVERY_LIMIT, new Date());
      if (cancelled) return;

      if (!result.success) {
        setLoadError(result.error.reason);
        return;
      }
      setQueue(result.value.queue);
      setEnrichedById(new Map(result.value.enrichedCandidates.map((enriched) => [enriched.candidate.candidateId, enriched])));
    })();
    return () => {
      cancelled = true;
    };
  }, [appContext]);

  const current = queue?.current() ?? null;
  const currentCandidate = current ? enrichedById.get(current.candidateRef)?.candidate ?? null : null;

  useEffect(() => {
    if (!currentCandidate) {
      setSpotifyUrl(null);
      return;
    }

    const title = currentCandidate.title;
    const artist = currentCandidate.artists[0] ?? '';
    // Instant, always-valid fallback first — a real href must be ready
    // before any click, or mobile Safari blocks the async-resolved one.
    setSpotifyUrl(getInstantSpotifyUrl(title, artist, null));

    let cancelled = false;
    void resolveSpotifyTrackUrl(title, artist, null).then((resolved) => {
      if (!cancelled) setSpotifyUrl(resolved.url);
    });
    return () => {
      cancelled = true;
    };
  }, [currentCandidate]);

  const recordReaction = (learningEvent: LearningEvent) => {
    if (!userId) return;
    // Best effort (Sprint 1 Rule 6/7, ADR-32): learning and observability
    // never block or alter what the user already sees — the queue has
    // already advanced locally by the time this runs.
    void appContext.useCases.learnFromReaction.execute(userId, learningEvent).then((result) => {
      if (!result.success) {
        console.warn('[discovery] Kunne ikke lære af reaktionen:', result.error);
      }
    });
  };

  const handleReaction = (reactionType: ReactionType) => {
    if (!queue) return;
    const { event, queue: nextQueue } = queue.react(reactionType);
    setQueue(nextQueue);
    setLastAction(ACTION_LABELS[reactionType]);

    if (!event) return;
    const feedback = processReactionEvent(event, new Date());
    if (feedback.accepted) recordReaction(feedback.learningEvent);
  };

  const why = useMemo(() => current?.explanations.slice(0, 2) ?? [], [current]);

  if (loadError) {
    return (
      <div className="dashboard-status">
        <h2>Noget gik galt</h2>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!queue) {
    return <div className="dashboard-status">Finder ny musik til dig...</div>;
  }

  if (!current || !currentCandidate) {
    return (
      <div className="dashboard-status">
        <h2>Jeg har ikke flere gode forslag lige nu.</h2>
      </div>
    );
  }

  return (
    <div className="discovery">
      <header className="discovery__header">
        <div>
          <h1>Discovery</h1>
        </div>
        <div className="discovery__header-actions">
          <button type="button" onClick={logout}>
            Log ud
          </button>
        </div>
      </header>

      {lastAction && <p className="discovery__last-action">Sidste handling: {lastAction}</p>}

      <RecommendationCard title={currentCandidate.title} artists={currentCandidate.artists} why={why} />

      <ActionBar
        onSave={() => handleReaction('save')}
        onSkip={() => handleReaction('reject')}
        onKnown={() => handleReaction('known')}
        spotifyHref={spotifyUrl}
      />
    </div>
  );
};
