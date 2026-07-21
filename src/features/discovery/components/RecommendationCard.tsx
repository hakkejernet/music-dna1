import type { EvidenceTier } from '../evidenceTier';

interface Props {
  title: string;
  artists: string[];
  why: string[];
  evidenceTier: EvidenceTier;
}

/**
 * M25: one fixed, static sentence per evidence tier (VISION.md — never
 * fake certainty, describe evidence, not quality). None of these strings
 * ever say or imply a recommendation is objectively good or bad — only
 * how much signal ranking had to go on.
 */
const EVIDENCE_COPY: Record<EvidenceTier, { emoji: string; label: string; summary: string }> = {
  strong: { emoji: '🟢', label: 'Stærkt belæg', summary: 'Vi fandt flere uafhængige signaler, der understøtter denne anbefaling.' },
  some: { emoji: '🟡', label: 'Noget belæg', summary: 'Vi fandt et par signaler, der antyder, at denne kan matche din smag.' },
  weak: { emoji: '🟠', label: 'Svagt belæg', summary: 'Vi fandt kun begrænset belæg for denne anbefaling.' },
  none: {
    emoji: '⚪',
    label: 'Ikke nok belæg endnu',
    summary: 'Vi har endnu ikke nok belæg til at forklare denne anbefaling med sikkerhed. Din feedback hjælper os med at lære, om dette var et godt forslag.',
  },
};

/**
 * Product Sprint 1 Rule 2: exactly one recommendation, no list, no grid.
 * Rule 4 (M25 revision): every card shows an explicit evidence-strength
 * label plus its fixed summary sentence, and — when ranking found any
 * non-zero signal — the specific `RankedCandidate.explanations` (M5's
 * `ScoreBreakdown` output, never generated text) as supporting detail.
 * `why` is already capped to at most 2 entries by the caller.
 */
export const RecommendationCard = ({ title, artists, why, evidenceTier }: Props) => {
  const { emoji, label, summary } = EVIDENCE_COPY[evidenceTier];

  return (
    <div className="discovery-card">
      <div className="discovery-card__info">
        <h2 className="discovery-card__title">{title}</h2>
        <p className="discovery-card__artist">{artists.join(', ')}</p>
      </div>
      <p className="discovery-card__evidence-label">
        {emoji} {label}
      </p>
      <p className="discovery-card__why">
        {summary}
        {why.length > 0 ? ` ${why.join(' · ')}` : ''}
      </p>
    </div>
  );
};
