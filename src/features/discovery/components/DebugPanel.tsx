import type { RecommendationDiagnostics } from '../../../modules/diagnostics';

interface Props {
  open: boolean;
  onClose: () => void;
  diagnostics: RecommendationDiagnostics;
}

const fmt = (value: number | null): string => (value === null ? '–' : String(value));
const yesNo = (value: boolean): string => (value ? 'Ja' : 'Nej');

/**
 * Dev-only diagnostic panel for the recommendation pipeline — not a
 * product feature. Shows exactly what modules/diagnostics recorded during
 * the most recent loadRecommendationQueue() run, so a "0 recommendations"
 * can be traced to its real cause (Spotify seed, Last.fm API key, a
 * specific Last.fm failure category, or a genuinely empty result) without
 * guessing. Only rendered when import.meta.env.DEV is true (see
 * DiscoveryPage) — stripped from the production build.
 */
export const DebugPanel = ({ open, onClose, diagnostics }: Props) => {
  if (!open) return null;

  const { spotify, lastfm, queue, fallbackReason } = diagnostics;

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
            <dt>Top artists fundet</dt>
            <dd>{fmt(spotify.topArtistsFound)}</dd>
          </dl>

          <h5>Last.fm</h5>
          <dl className="debug-panel__list">
            <dt>API key fundet</dt>
            <dd>{yesNo(lastfm.apiKeyPresent)}</dd>
            <dt>API kald udført</dt>
            <dd>{yesNo(lastfm.apiCallMade)}</dd>
            <dt>Lignende kunstnere</dt>
            <dd>{fmt(lastfm.similarArtistsFound)}</dd>
            <dt>Top tracks</dt>
            <dd>{fmt(lastfm.topTracksFound)}</dd>
            <dt>Recommendations bygget</dt>
            <dd>{fmt(lastfm.recommendationsBuilt)}</dd>
          </dl>
        </section>

        <section className="debug-panel__section">
          <h4>Queue</h4>
          <dl className="debug-panel__list">
            <dt>Antal Recommendations</dt>
            <dd>{queue ? queue.count : '–'}</dd>
            <dt>Kilde</dt>
            <dd>{queue ? (queue.source === 'lastfm' ? 'Last.fm' : 'Mock') : '–'}</dd>
          </dl>
        </section>

        {fallbackReason && (
          <section className="debug-panel__section debug-panel__section--warning">
            <h4>Fallback årsag</h4>
            <p>{fallbackReason}</p>
          </section>
        )}
      </aside>
    </div>
  );
};
