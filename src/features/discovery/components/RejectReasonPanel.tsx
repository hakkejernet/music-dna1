import { useEffect, useRef } from 'react';

const REJECT_REASONS = [
  'For poppet',
  'For hård',
  'Forkert stemning',
  'Kendte allerede sangen',
  'Kan ikke lide kunstneren',
  'Kan ikke lide vokalen',
  'Dårlig produktion',
  'Andet',
];

const AUTO_DISMISS_MS = 5000;

interface Props {
  open: boolean;
  /** Called exactly once per open: with the picked reason, or null for a plain rejection (timeout / click outside / ✕). */
  onResolve: (reason: string | null) => void;
}

export const RejectReasonPanel = ({ open, onResolve }: Props) => {
  const onResolveRef = useRef(onResolve);
  onResolveRef.current = onResolve;

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onResolveRef.current(null), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  return (
    <div className="reject-panel-overlay" onClick={() => onResolve(null)}>
      <aside className="reject-panel" onClick={(event) => event.stopPropagation()}>
        <div className="reject-panel__header">
          <h3>Hvorfor afviser du den?</h3>
          <button type="button" className="reject-panel__close" onClick={() => onResolve(null)} aria-label="Luk">
            ✕
          </button>
        </div>
        <div className="reject-panel__reasons">
          {REJECT_REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              className="reject-panel__reason"
              onClick={() => onResolve(reason)}
            >
              {reason}
            </button>
          ))}
        </div>
      </aside>
    </div>
  );
};
