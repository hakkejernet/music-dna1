import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../AppContextProvider';
import { processReactionEvent, type LearningEvent } from '../../modules/feedbackPipeline';
import { buildLibrarySnapshot } from '../../modules/infrastructure';
import { RecommendationQueue } from '../../modules/queue';
import type { ReactionType } from '../../modules/queue';
import type { EnrichedCandidate } from '../../modules/enrichment';
import { getCurrentUser, getSpotifyRequestLog, SpotifyAuthError, type SpotifyRequestDiagnostics } from '../../modules/spotify';
import { getInstantSpotifyUrl, resolveSpotifyTrackUrl } from '../../modules/spotifyLink';
import { useAuth } from '../auth/AuthContext';
import { ActionBar } from './components/ActionBar';
import { RecommendationCard } from './components/RecommendationCard';
import { clearDiscoverySession, loadDiscoverySession, saveDiscoverySession } from './discoverySessionStorage';
import { classifyEvidence } from './evidenceTier';
import { analyzeLibraryArtistComposition, type LibraryCompositionSummary } from './libraryCompositionAnalysis';

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
  // TEMPORARY — manual-evaluation diagnostic state (see libraryCompositionAnalysis.ts). Remove alongside the rest of the block marked TEMPORARY in this file.
  const [libraryComposition, setLibraryComposition] = useState<LibraryCompositionSummary | null>(null);
  // TEMPORARY — Concern B (403-on-/me) diagnostic state (see modules/spotify/client.ts's request log). Remove alongside the rest of the block marked TEMPORARY in this file.
  const [requestLog, setRequestLog] = useState<readonly SpotifyRequestDiagnostics[]>([]);

  // M19: every candidate ever included in a batch this session — save
  // and reject are both reactions to a candidate that was necessarily
  // shown first, so this one set covers "already shown", "rejected",
  // and "saved" at once. A ref, not state: read at fetch time, never
  // needs to trigger a render itself.
  const shownCandidateIds = useRef<Set<string>>(new Set());

  /** M20: writes the session that `loadDiscoverySession()` will look for on the next visit — everything Rule 2 asks for, plus the userId a restore must match. */
  const persistSession = (forUserId: string, queueToSave: RecommendationQueue, enrichedMap: ReadonlyMap<string, EnrichedCandidate>) => {
    const { items, cursor } = queueToSave.toSnapshot();
    saveDiscoverySession(
      { userId: forUserId, items: [...items], cursor, enriched: [...enrichedMap], shownCandidateIds: [...shownCandidateIds.current] },
      new Date(),
    );
  };

  /**
   * TEMPORARY — Concern B diagnostic: modules/spotify/client.ts's request
   * log is a module-level singleton mutated by every spotifyGet() call
   * from *any* component — including RequireAuth's independent
   * ensureLibrarySynced() → runFullSync() chain, which this page never
   * calls itself. Polling is the simplest way to reflect those
   * externally-caused mutations on-page without threading a callback
   * through modules/spotify. Remove alongside the rest of the block
   * marked TEMPORARY in this file.
   */
  useEffect(() => {
    const interval = setInterval(() => setRequestLog(getSpotifyRequestLog()), 500);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        setUserId(user.id);

        // TEMPORARY — manual-evaluation diagnostic (see
        // libraryCompositionAnalysis.ts). Fire-and-forget: never
        // awaited, never blocks the page, and the function itself
        // never throws — same posture as recordReaction below.
        // Rendered on-page (see libraryComposition state + the
        // TEMPORARY block in the JSX below) rather than console.table,
        // since devtools isn't available while testing on iPad.
        void analyzeLibraryArtistComposition(user.id).then((summary) => {
          if (!cancelled) setLibraryComposition(summary);
        });

        // M20 Rule 3: resume exactly where the user left off if a valid,
        // non-expired session exists for this same Spotify user — a
        // stored session for a different account (same browser, a
        // different login) is not "valid" for this user and falls
        // through to a fresh fetch below, same as no session at all.
        const restored = loadDiscoverySession(new Date());
        if (restored && restored.userId === user.id) {
          const restoredQueue = RecommendationQueue.restore(restored.items, restored.cursor);

          // M22: a session saved while the queue was already exhausted
          // (e.g. a refill that genuinely found nothing left, M19 Rule 7)
          // must not be resurrected as a dead end with no way forward —
          // discard it and fall through to a fresh fetch below, exactly
          // as if no session had been found at all.
          if (restoredQueue.current() !== null) {
            if (cancelled) return;
            shownCandidateIds.current = new Set(restored.shownCandidateIds);
            setEnrichedById(new Map(restored.enriched));
            setQueue(restoredQueue);
            return;
          }
          clearDiscoverySession();
        }

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
        const enrichedMap = new Map(result.value.enrichedCandidates.map((enriched) => [enriched.candidate.candidateId, enriched]));
        setQueue(result.value.queue);
        setEnrichedById(enrichedMap);
        persistSession(user.id, result.value.queue, enrichedMap);
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
   * M29: independent of `recordReaction`/UserDNA — this only ever touches
   * Recommendation Memory. Fire-and-forget, same posture as `recordReaction`:
   * never blocks or alters what the user already sees.
   */
  const recordRecommendationOutcome = (candidateId: string, outcome: LearningEvent['reactionType'], now: Date) => {
    void appContext.useCases.recordRecommendationOutcome.execute(candidateId, outcome, now).then((result) => {
      if (!result.success) {
        console.warn('[discovery] Kunne ikke gemme recommendation-outcome:', result.error);
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
      const mergedEnriched = new Map([...enrichedById, ...result.value.enrichedCandidates.map((e) => [e.candidate.candidateId, e] as const)]);
      setQueue(result.value.queue);
      setEnrichedById(mergedEnriched);
      persistSession(user.id, result.value.queue, mergedEnriched);
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
      const now = new Date();
      const feedback = processReactionEvent(event, now);
      if (feedback.accepted) {
        recordReaction(feedback.learningEvent);
        recordRecommendationOutcome(feedback.learningEvent.candidateRef, feedback.learningEvent.reactionType, now);
      }
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
      // M20 Rule 1: persist after every action so a reload resumes here, not from scratch.
      if (userId) persistSession(userId, nextQueue, enrichedById);
    }
  };

  const why = useMemo(() => current?.explanations.slice(0, 2) ?? [], [current]);
  /** M25: how much evidence backed this recommendation's score — never how confident the system is that it's a good song (VISION.md). */
  const evidenceTier = useMemo(() => classifyEvidence(current?.score ?? 0), [current]);

  // ============================================================
  // TEMPORARY — on-page rendering of the M31-era manual-evaluation
  // diagnostic (libraryCompositionAnalysis.ts), swapped in for
  // console.table because devtools isn't reachable while testing on
  // iPad. Read-only presentation of already-computed values — remove
  // this block, the libraryComposition state above, and the `.then`
  // wiring in the load effect once the investigation concludes.
  // ============================================================
  const debugPanel = libraryComposition && (
    <div style={{ background: '#222', color: '#0f0', padding: '0.75rem', margin: '0.5rem 0', fontFamily: 'monospace', fontSize: '0.85rem', overflowX: 'auto' }}>
      <strong>DEBUG: Library artist composition (temporary)</strong>
      <table style={{ width: '100%', marginTop: '0.5rem', borderCollapse: 'collapse' }}>
        <tbody>
          {Object.entries(libraryComposition).map(([field, value]) => (
            <tr key={field} style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0' }}>{field}</td>
              <td style={{ padding: '0.15rem 0', textAlign: 'right' }}>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  // ============================================================
  // END TEMPORARY on-page debug panel.
  // ============================================================

  // ============================================================
  // TEMPORARY — Concern B (403-on-/me) on-page diagnostic. Renders every
  // Spotify request this page session has made — success or failure,
  // from this component or any other (e.g. RequireAuth's
  // ensureLibrarySynced()) — captured by modules/spotify/client.ts's
  // request log, since devtools isn't reachable while testing on iPad.
  // The point is comparing outcomes across endpoints in the same
  // session (e.g. does /me/playlists succeed while /me returns 403).
  // Remove this block, the requestLog state and polling effect above,
  // once the 403 investigation concludes.
  // ============================================================
  const requestDiagnosticsPanel = requestLog.length > 0 && (
    <div style={{ background: '#222', color: '#f80', padding: '0.75rem', margin: '0.5rem 0', fontFamily: 'monospace', fontSize: '0.85rem', overflowX: 'auto' }}>
      <strong>DEBUG: Spotify request log, most recent first (temporary)</strong>
      {[...requestLog].reverse().map((entry) => (
        <table key={`${entry.timestamp}-${entry.url}`} style={{ width: '100%', marginTop: '0.5rem', borderCollapse: 'collapse', borderBottom: '2px solid #663' }}>
          <tbody>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>timestamp</td>
              <td style={{ padding: '0.15rem 0' }}>{new Date(entry.timestamp).toISOString()}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>url</td>
              <td style={{ padding: '0.15rem 0', wordBreak: 'break-all' }}>{entry.url}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>ok</td>
              <td style={{ padding: '0.15rem 0', color: entry.ok ? '#0f0' : '#f80' }}>{String(entry.ok)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>status</td>
              <td style={{ padding: '0.15rem 0' }}>{entry.status}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>statusText</td>
              <td style={{ padding: '0.15rem 0' }}>{entry.statusText}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>authorizationHeaderAttached</td>
              <td style={{ padding: '0.15rem 0' }}>{String(entry.authorizationHeaderAttached)}</td>
            </tr>
            <tr style={{ borderBottom: '1px solid #444' }}>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>headers</td>
              <td style={{ padding: '0.15rem 0', wordBreak: 'break-all' }}>
                {Object.entries(entry.headers).map(([key, value]) => (
                  <div key={key}>
                    {key}: {value}
                  </div>
                ))}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '0.15rem 0.5rem 0.15rem 0', verticalAlign: 'top' }}>body</td>
              <td style={{ padding: '0.15rem 0', wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}>{entry.body || '(empty)'}</td>
            </tr>
          </tbody>
        </table>
      ))}
    </div>
  );
  // ============================================================
  // END TEMPORARY request-diagnostics panel.
  // ============================================================

  if (loadError) {
    return (
      <div className="dashboard-status">
        {debugPanel}
        {requestDiagnosticsPanel}
        <h2>Noget gik galt</h2>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="dashboard-status">
        {debugPanel}
        {requestDiagnosticsPanel}
        Finder ny musik til dig...
      </div>
    );
  }

  if (!current || !currentCandidate) {
    return (
      <div className="dashboard-status">
        {debugPanel}
        {requestDiagnosticsPanel}
        <h2>Jeg har ikke flere gode forslag lige nu.</h2>
      </div>
    );
  }

  return (
    <div className="discovery">
      {debugPanel}
      {requestDiagnosticsPanel}
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

      <RecommendationCard title={currentCandidate.title} artists={currentCandidate.artists} why={why} evidenceTier={evidenceTier} />

      <ActionBar
        onSave={() => handleReaction('save')}
        onSkip={() => handleReaction('reject')}
        onKnown={() => handleReaction('known')}
        spotifyHref={spotifyUrl}
      />
    </div>
  );
};
