interface Props {
  onSave: () => void;
  onReject: () => void;
  onKnown: () => void;
  onNext: () => void;
  onWhy: () => void;
}

export const ActionBar = ({ onSave, onReject, onKnown, onNext, onWhy }: Props) => (
  <div className="action-bar">
    <div className="action-bar__row">
      <button type="button" className="action-btn action-btn--save" onClick={onSave}>
        <span aria-hidden="true">❤️</span> Gem
      </button>
      <button type="button" className="action-btn action-btn--reject" onClick={onReject}>
        <span aria-hidden="true">❌</span> Afvis
      </button>
      <button type="button" className="action-btn action-btn--known" onClick={onKnown}>
        <span aria-hidden="true">👀</span> Kendte allerede
      </button>
      <button type="button" className="action-btn action-btn--next" onClick={onNext}>
        <span aria-hidden="true">➡</span> Næste
      </button>
    </div>
    <button type="button" className="why-link" onClick={onWhy}>
      Hvorfor denne?
    </button>
  </div>
);
