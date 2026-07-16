import type { PopularityBucket } from '../../../modules/analysis';

interface Props {
  buckets: PopularityBucket[];
}

export const PopularitySpectrum = ({ buckets }: Props) => (
  <section className="panel">
    <h2>Mainstream vs. undergrund</h2>
    <ul className="bar-list">
      {buckets.map((bucket) => (
        <li key={bucket.label} className="bar-list__item">
          <span className="bar-list__label">{bucket.label}</span>
          <div className="bar-list__track">
            <div className="bar-list__fill bar-list__fill--warm" style={{ width: `${bucket.percentage}%` }} />
          </div>
          <span className="bar-list__value">{bucket.percentage}%</span>
        </li>
      ))}
    </ul>
  </section>
);
