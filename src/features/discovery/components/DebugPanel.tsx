import type { RecommendationDiagnostics } from '../../../modules/diagnostics';

interface Props {
  open: boolean;
  onClose: () => void;
  diagnostics: RecommendationDiagnostics;
  /** Scopes granted to the current Spotify token, or null if not logged in — read separately from RecommendationDiagnostics since it's auth state, not a recommendation-pipeline result. */
  scopes: string[] | null;
}

const fmt = (value: number | null): string => (value === null ? '–' : String(value));
const yesNo = (value: boolean): string => (value ? 'Ja' : 'Nej');
const list = (values: string[]): string => (values.length === 0 ? '–' : values.join(', '));

/**
 * Diagnostic panel for the recommendation pipeline — not a product
 * feature. Shows exactly what modules/diagnostics recorded during the most
 * recent loadRecommendationQueue() run, so a "0 recommendations" can be
 * traced to its real cause without console access. Activated via
 * ?debug=1 (see src/lib/debugMode.ts) so it also works on a deployed
 * production build where there's no way to attach a browser console
 * (e.g. iPhone) — hidden from normal users because the query param is
 * never present unless someone deliberately adds it.
 */
export const DebugPanel = ({ open, onClose, diagnostics, scopes }: Props) => {
  if (!open) return null;

  const { spotify, lastfm, queue, fallbackReason, topRecommendations } = diagnostics;

  return (
    <div className="debug-panel-overlay" onClick={onClose}>
      <aside className="debug-panel" onClick={(event) => event.stopPropagation()}>
        <div className="debug-panel__header">
          <h3>🐛 Debug: recommendation-flow</h3>
          <button type="button" className="debug-panel__close" onClick={onClose} aria-label="Luk">
            ✕
          </button>
        </div>

        <section className="debug-panel__section">
          <h4>Provider status</h4>

          <h5>Spotify</h5>
          <dl className="debug-panel__list">
            <dt>Login</dt>
            <dd>{spotify.loginOk ? '✅ Login OK' : `❌ ${spotify.error ?? 'Login fejlede'}`}</dd>
            <dt>Token scopes</dt>
            <dd>{scopes === null ? '–' : list(scopes)}</dd>
            <dt>Top artists fundet</dt>
            <dd>{fmt(spotify.topArtistsFound)}</dd>
            <dt>seedArtistNames</dt>
            <dd>{list(spotify.seedArtistNames)}</dd>
          </dl>

          {spotify.topArtistsDebug && (
            <>
              <h5>GET /me/top/artists — rå data</h5>
              <dl className="debug-panel__list">
                <dt>HTTP status</dt>
                <dd>{fmt(spotify.topArtistsDebug.httpStatus)}</dd>
                <dt>Items i svar</dt>
                <dd>{fmt(spotify.topArtistsDebug.itemCount)}</dd>
                <dt>Første artist</dt>
                <dd>
                  {spotify.topArtistsDebug.firstArtist
                    ? `${spotify.topArtistsDebug.firstArtist.name ?? '–'} (id: ${spotify.topArtistsDebug.firstArtist.id ?? '–'}) — felter: ${list(spotify.topArtistsDebug.firstArtist.fields)}`
                    : '–'}
                </dd>
              </dl>

              {spotify.topArtistsDebug.parseError && (
                <div className="debug-panel__error">
                  <p>
                    <strong>Parse-fejl:</strong> {spotify.topArtistsDebug.parseError.message}
                  </p>
                  <p>{spotify.topArtistsDebug.parseError.location}</p>
                  {spotify.topArtistsDebug.parseError.stack && (
                    <pre className="debug-panel__stack">{spotify.topArtistsDebug.parseError.stack}</pre>
                  )}
                </div>
              )}

              {spotify.seedArtistNames.length === 0 && spotify.topArtistsDebug.emptySeedReason && (
                <p className="debug-panel__empty-reason">
                  Tomme seedArtistNames fordi: {spotify.topArtistsDebug.emptySeedReason}
                </p>
              )}
            </>
          )}

          <h5>Last.fm</h5>
          <dl className="debug-panel__list">
            <dt>API key fundet</dt>
            <dd>{yesNo(lastfm.apiKeyPresent)}</dd>
            <dt>artist.getsimilar kald</dt>
            <dd>{yesNo(lastfm.apiCallMade)}</dd>
            <dt>candidateArtists</dt>
            <dd>{fmt(lastfm.similarArtistsFound)}</dd>
            <dt>topTracks</dt>
            <dd>{fmt(lastfm.topTracksFound)}</dd>
            <dt>Recommendations bygget</dt>
            <dd>{fmt(lastfm.recommendationsBuilt)}</dd>
          </dl>
        </section>

        <section className="debug-panel__section">
          <h4>Queue</h4>
          <dl className="debug-panel__list">
            <dt>Recommendations før ranking</dt>
            <dd>{queue ? queue.beforeRanking : '–'}</dd>
            <dt>Recommendations efter ranking</dt>
            <dd>{queue ? queue.afterRanking : '–'}</dd>
            <dt>Recommendations i queue</dt>
            <dd>{queue ? queue.inQueue : '–'}</dd>
            <dt>Kilde</dt>
            <dd>{queue ? (queue.source === 'lastfm' ? 'Last.fm' : 'Ingen resultater') : '–'}</dd>
          </dl>
        </section>

        {fallbackReason && (
          <section className="debug-panel__section debug-panel__section--warning">
            <h4>Fallback årsag</h4>
            <p>{fallbackReason}</p>
          </section>
        )}

        <section className="debug-panel__section">
          <h4>Første 10 recommendations</h4>
          {topRecommendations.length === 0 ? (
            <p className="debug-panel__empty">Ingen.</p>
          ) : (
            <ol className="debug-panel__tracklist">
              {topRecommendations.map((entry) => (
                <li key={entry}>{entry}</li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
};
