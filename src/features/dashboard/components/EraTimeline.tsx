import type { DecadeShare } from '../../../modules/analysis';

interface Props {
  decades: DecadeShare[];
}

export const EraTimeline = ({ decades }: Props) => (
  <section className="panel">
    <h2>Æra-fordeling</h2>
    {decades.length === 0 ? (
      <p className="panel__empty">Ingen udgivelsesdatoer fundet endnu.</p>
    ) : (
      <ul className="bar-list">
        {decades.map((decade) => (
          <li key={decade.decade} className="bar-list__item">
            <span className="bar-list__label">{decade.decade}</span>
            <div className="bar-list__track">
              <div className="bar-list__fill bar-list__fill--alt" style={{ width: `${decade.percentage}%` }} />
            </div>
            <span className="bar-list__value">{decade.percentage}%</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
