import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppContext } from '../../AppContextProvider';
import type { CandidateAuditEntry } from '../../modules/applicationLayer';
import { processReactionEvent, type LearningEvent } from '../../modules/feedbackPipeline';
import { buildLibrarySnapshot } from '../../modules/infrastructure';
import { RecommendationQueue } from '../../modules/queue';
import type { ReactionType } from '../../modules/queue';
import type { EnrichedCandidate } from '../../modules/enrichment';
import { getCurrentUser, SpotifyAuthError } from '../../modules/spotify';
import { getInstantSpotifyUrl, resolveSpotifyTrackUrl } from '../../modules/spotifyLink';
import { useAuth } from '../auth/AuthContext';
import { ActionBar } from './components/ActionBar';
import { buildCandidateAuditSummary } from './candidateAuditSummary';
import { RecommendationCard } from './components/RecommendationCard';
import { clearDiscoverySession, loadDiscoverySession, saveDiscoverySession } from './discoverySessionStorage';
import { classifyEvidence } from './evidenceTier';

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
  // TEMPORARY — one-time candidate-quality audit (Danish-recommendation-dominance investigation). Captured once, from the initial load only (never from fetchNextBatch's refills). Remove alongside the rest of the block marked TEMPORARY in this file.
  const [candidateAuditEntries, setCandidateAuditEntries] = useState<readonly CandidateAuditEntry[] | null>(null);

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        setUserId(user.id);

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

        // TEMPORARY — one-time candidate-quality audit, see state declaration above.
        if (result.value.candidateAuditEntries) setCandidateAuditEntries(result.value.candidateAuditEntries);
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

  // TEMPORARY — one-time candidate-quality audit, see state declaration above.
  const candidateAuditSummary = useMemo(() => (candidateAuditEntries ? buildCandidateAuditSummary(candidateAuditEntries) : null), [candidateAuditEntries]);

  // ============================================================
  // TEMPORARY — one-time candidate-quality audit on-page report
  // (Danish-recommendation-dominance investigation). Renders every field
  // requested for the first CANDIDATE_AUDIT_SIZE (100) candidates of the
  // fully ranked pool, plus the requested summary statistics, since
  // devtools isn't reachable while testing on iPad. Remove this block,
  // the candidateAuditEntries state + its capture above, and
  // candidateAuditSummary.ts once the investigation concludes.
  // ============================================================
  const candidateAuditPanel = candidateAuditEntries && candidateAuditSummary && (
    <div style={{ background: '#222', color: '#0ff', padding: '0.75rem', margin: '0.5rem 0', fontFamily: 'monospace', fontSize: '0.78rem', overflowX: 'auto' }}>
      <strong>DEBUG: Candidate-quality audit — first {candidateAuditEntries.length} ranked candidates (temporary)</strong>

      <div style={{ marginTop: '0.5rem' }}>
        <div>Danish: {candidateAuditSummary.danishPercent}% — International: {candidateAuditSummary.internationalPercent}% — Unknown (no tags): {candidateAuditSummary.unknownPercent}%</div>
        <div style={{ marginTop: '0.25rem' }}>Ranking factors among Danish candidates that survived into the queue (nonzero-score count):</div>
        <div>{candidateAuditSummary.rankingFactorsAmongDanishSurvivors.map((f) => `${f.bucket}=${f.nonzeroCount}`).join(', ')}</div>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <strong>Top {candidateAuditSummary.topSeedArtists.length} seed artists by candidate count</strong>
        <table style={{ width: '100%', marginTop: '0.25rem', borderCollapse: 'collapse' }}>
          <tbody>
            {candidateAuditSummary.topSeedArtists.map((s) => (
              <tr key={s.seedArtist} style={{ borderBottom: '1px solid #444' }}>
                <td style={{ padding: '0.1rem 0.5rem 0.1rem 0' }}>{s.seedArtist}</td>
                <td style={{ padding: '0.1rem 0', textAlign: 'right' }}>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <strong>Seeds that produced Danish-classified candidates</strong>
        <table style={{ width: '100%', marginTop: '0.25rem', borderCollapse: 'collapse' }}>
          <tbody>
            {candidateAuditSummary.seedsThatProducedDanishArtists.length === 0 ? (
              <tr>
                <td>(none)</td>
              </tr>
            ) : (
              candidateAuditSummary.seedsThatProducedDanishArtists.map((s) => (
                <tr key={s.seedArtist} style={{ borderBottom: '1px solid #444' }}>
                  <td style={{ padding: '0.1rem 0.5rem 0.1rem 0' }}>{s.seedArtist}</td>
                  <td style={{ padding: '0.1rem 0', textAlign: 'right' }}>{s.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.5rem' }}>
        <strong>Providers that produced Danish-classified candidates</strong>
        <table style={{ width: '100%', marginTop: '0.25rem', borderCollapse: 'collapse' }}>
          <tbody>
            {candidateAuditSummary.providersThatProducedDanishArtists.length === 0 ? (
              <tr>
                <td>(none)</td>
              </tr>
            ) : (
              candidateAuditSummary.providersThatProducedDanishArtists.map((p) => (
                <tr key={p.provider} style={{ borderBottom: '1px solid #444' }}>
                  <td style={{ padding: '0.1rem 0.5rem 0.1rem 0' }}>{p.provider}</td>
                  <td style={{ padding: '0.1rem 0', textAlign: 'right' }}>{p.count}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <strong>All {candidateAuditEntries.length} candidates</strong>
        <table style={{ width: '100%', marginTop: '0.25rem', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #666', textAlign: 'left' }}>
              <th>#</th>
              <th>Queue?</th>
              <th>Title</th>
              <th>Artist</th>
              <th>Country</th>
              <th>Score</th>
              <th>Genre</th>
              <th>Main.</th>
              <th>Expl.</th>
              <th>Dur.</th>
              <th>TrackSim</th>
              <th>Provider(s)</th>
              <th>Similarity chain</th>
              <th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {candidateAuditEntries.map((entry) => (
              <tr key={`${entry.rankPosition}-${entry.title}`} style={{ borderBottom: '1px solid #333' }}>
                <td>{entry.rankPosition}</td>
                <td>{entry.survivedToQueue ? 'yes' : 'no'}</td>
                <td>{entry.title}</td>
                <td>{entry.artist}</td>
                <td style={{ color: entry.countryLanguage === 'danish' ? '#f80' : undefined }}>{entry.countryLanguage}</td>
                <td>{entry.score.toFixed(1)}</td>
                <td>{entry.scoreBreakdown.genreMatch.toFixed(2)}</td>
                <td>{entry.scoreBreakdown.mainstreamMatch.toFixed(2)}</td>
                <td>{entry.scoreBreakdown.explicitMatch.toFixed(2)}</td>
                <td>{entry.scoreBreakdown.durationMatch.toFixed(2)}</td>
                <td>{entry.scoreBreakdown.trackSimilarityMatch.toFixed(2)}</td>
                <td>{entry.providers.join('+')}</td>
                <td style={{ wordBreak: 'break-word' }}>{entry.similarityChain}</td>
                <td style={{ wordBreak: 'break-word' }}>{entry.tags.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  // ============================================================
  // END TEMPORARY candidate-audit panel.
  // ============================================================

  if (loadError) {
    return (
      <div className="dashboard-status">
        {candidateAuditPanel}
        <h2>Noget gik galt</h2>
        <p>{loadError}</p>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="dashboard-status">
        {candidateAuditPanel}
        Finder ny musik til dig...
      </div>
    );
  }

  if (!current || !currentCandidate) {
    return (
      <div className="dashboard-status">
        {candidateAuditPanel}
        <h2>Jeg har ikke flere gode forslag lige nu.</h2>
      </div>
    );
  }

  return (
    <div className="discovery">
      {candidateAuditPanel}
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
