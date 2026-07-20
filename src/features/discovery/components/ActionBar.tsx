interface Props {
  onSave: () => void;
  onSkip: () => void;
  onKnown: () => void;
  spotifyHref: string | null;
}

/** Product Sprint 1 Rule 3 — exactly these four actions, nothing else (no "why" toggle, no reject-reason step). */
export const ActionBar = ({ onSave, onSkip, onKnown, spotifyHref }: Props) => (
  <div className="action-bar">
    <div className="action-bar__row">
      <button type="button" className="action-btn action-btn--save" onClick={onSave}>
        <span aria-hidden="true">❤️</span> Gem
      </button>
      <button type="button" className="action-btn action-btn--skip" onClick={onSkip}>
        <span aria-hidden="true">❌</span> Spring over
      </button>
      <button type="button" className="action-btn action-btn--known" onClick={onKnown}>
        <span aria-hidden="true">👀</span> Kender allerede
      </button>
      {spotifyHref ? (
        <a className="action-btn action-btn--spotify" href={spotifyHref} target="_blank" rel="noopener noreferrer">
          <span aria-hidden="true">▶</span> Åbn i Spotify
        </a>
      ) : (
        <span className="action-btn action-btn--spotify action-btn--disabled" aria-disabled="true">
          <span aria-hidden="true">▶</span> Åbn i Spotify
        </span>
      )}
    </div>
  </div>
);
