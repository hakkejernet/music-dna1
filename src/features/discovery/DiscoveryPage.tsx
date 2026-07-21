import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../AppContextProvider';
import { processReactionEvent, type LearningEvent } from '../../modules/feedbackPipeline';
import { buildLibrarySnapshot } from '../../modules/infrastructure';
import { RecommendationQueue } from '../../modules/queue';
import type { ReactionType } from '../../modules/queue';
import type { EnrichedCandidate } from '../../modules/enrichment';
import { getCurrentUser, SpotifyAuthError } from '../../modules/spotify';
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

  // M19: every candidate ever included in a batch this session — save
  // and reject are both reactions to a candidate that was necessarily
  // shown first, so this one set covers "already shown", "rejected",
  // and "saved" at once. A ref, not state: read at fetch time, never
  // needs to trigger a render itself.
  const shownCandidateIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
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
        for (const enriched of result.value.enrichedCandidates) {
          shownCandidateIds.current.add(enriched.candidate.candidateId);
        }
        setQueue(result.value.queue);
        setEnrichedById(new Map(result.value.enrichedCandidates.map((enriched) => [enriched.candidate.candidateId, enriched])));
      } catch (error) {
        // Bugfix M16: without this, any thrown error in the load chain
        // (e.g. getCurrentUser() on an expired/missing Spotify session)
        // left the promise silently rejected and the page stuck forever
        // on "Finder ny musik til dig..." — loading must always end in
        // either content or an error state, never neither.
        if (cancelled) return;

        // M17: an expired/invalid Spotify session is not a generic
        // failure — it's the one error condition RequireAuth already
        // knows how to recover from (it shows LoginScreen once
        // isAuthenticated flips to false). Every other error still gets
        // the M16 "Noget gik galt" fallback unchanged.
        if (error instanceof SpotifyAuthError) {
          logout();
          return;
        }

        console.warn('[discovery] Kunne ikke indlæse anbefalinger:', error);
        setLoadError(error instanceof Error ? error.message : 'Der opstod en uventet fejl under indlæsning af anbefalinger.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [appContext, logout]);

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

  /**
   * M19: fetches a fresh batch that excludes every candidate already
   * shown this session (buildDiscoveryQueue.execute()'s excludeCandidateIds),
   * so a refill never reproduces the same songs. Used only when the
   * current queue has just run out — mirrors the initial load effect's
   * own error handling so an auth failure here still returns the user
   * to LoginScreen instead of a dead-end error screen.
   */
  const fetchNextBatch = async () => {
    try {
      const user = await getCurrentUser();
      setUserId(user.id);

      const snapshot = await buildLibrarySnapshot();
      const result = await appContext.useCases.buildDiscoveryQueue.execute(user.id, snapshot, DISCOVERY_LIMIT, new Date(), shownCandidateIds.current);

      if (!result.success) {
        setLoadError(result.error.reason);
        return;
      }
      for (const enriched of result.value.enrichedCandidates) {
        shownCandidateIds.current.add(enriched.candidate.candidateId);
      }
      setQueue(result.value.queue);
      setEnrichedById((previous) => new Map([...previous, ...result.value.enrichedCandidates.map((e) => [e.candidate.candidateId, e] as const)]));
    } catch (error) {
      if (error instanceof SpotifyAuthError) {
        logout();
        return;
      }
      console.warn('[discovery] Kunne ikke indlæse en ny batch:', error);
      setLoadError(error instanceof Error ? error.message : 'Der opstod en uventet fejl under indlæsning af anbefalinger.');
    }
  };

  const handleReaction = (reactionType: ReactionType) => {
    if (!queue) return;
    const { event, queue: nextQueue } = queue.react(reactionType);
    setLastAction(ACTION_LABELS[reactionType]);

    if (event) {
      const feedback = processReactionEvent(event, new Date());
      if (feedback.accepted) recordReaction(feedback.learningEvent);
    }

    if (nextQueue.current() === null) {
      // The batch just ran out — refill instead of showing the "no more
      // recommendations" dead end. Keep the existing loading state
      // (queue === null) visible during the refetch, exactly like the
      // initial load, rather than flashing the empty-queue message first.
      setQueue(null);
      void fetchNextBatch();
    } else {
      setQueue(nextQueue);
    }
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
