const PLACEHOLDER_REASONS = [
  'Matcher din musiksmag',
  'Ligner sange i din playlist',
  'Samme genre',
  'Samme stemning',
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export const WhyPanel = ({ open, onClose }: Props) => {
  if (!open) return null;

  return (
    <div className="why-panel-overlay" onClick={onClose}>
      <aside className="why-panel" onClick={(event) => event.stopPropagation()}>
        <div className="why-panel__header">
          <h3>Hvorfor denne?</h3>
          <button type="button" className="why-panel__close" onClick={onClose} aria-label="Luk">
            ✕
          </button>
        </div>
        <p className="why-panel__disclaimer">
          Der er endnu ingen rigtig anbefalings-analyse — dette er placeholder-grunde.
        </p>
        <ul className="why-panel__reasons">
          {PLACEHOLDER_REASONS.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
};
