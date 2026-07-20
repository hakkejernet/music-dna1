interface Props {
  title: string;
  artists: string[];
  why: string[];
}

const NO_SIGNAL_YET = 'Ikke nok data endnu til en detaljeret forklaring.';

/**
 * Product Sprint 1 Rule 2: exactly one recommendation, no list, no grid.
 * Rule 4: a short "why this" explanation, max 2 lines, built only from
 * `RankedCandidate.explanations` (rankingEngine's own `ScoreBreakdown`
 * output, M5) — never generated text. `why` is already capped to at
 * most 2 entries by the caller; this component just renders whatever it
 * was given, or the one fixed, hardcoded fallback line when ranking had
 * no non-zero signal to report (itself not AI-generated — a plain
 * static string).
 */
export const RecommendationCard = ({ title, artists, why }: Props) => (
  <div className="discovery-card">
    <div className="discovery-card__info">
      <h2 className="discovery-card__title">{title}</h2>
      <p className="discovery-card__artist">{artists.join(', ')}</p>
    </div>
    <p className="discovery-card__why">{why.length > 0 ? why.join(' · ') : NO_SIGNAL_YET}</p>
  </div>
);
