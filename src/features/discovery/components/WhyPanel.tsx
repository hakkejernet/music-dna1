interface Props {
  open: boolean;
  onClose: () => void;
  explanations: string[];
}

export const WhyPanel = ({ open, onClose, explanations }: Props) => {
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
        {explanations.length === 0 ? (
          <p className="why-panel__empty">Ingen forklaring tilgængelig for denne anbefaling endnu.</p>
        ) : (
          <ul className="why-panel__reasons">
            {explanations.map((explanation) => (
              <li key={explanation}>{explanation}</li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
};
