import type { GenreShare } from '../../../modules/analysis';

interface Props {
  genres: GenreShare[];
}

export const GenreBreakdown = ({ genres }: Props) => (
  <section className="panel">
    <h2>Genre-fingeraftryk</h2>
    {genres.length === 0 ? (
      <p className="panel__empty">Ingen genre-data fundet endnu.</p>
    ) : (
      <ul className="bar-list">
        {genres.map((genre) => (
          <li key={genre.genre} className="bar-list__item">
            <span className="bar-list__label">{genre.genre}</span>
            <div className="bar-list__track">
              <div className="bar-list__fill" style={{ width: `${genre.percentage}%` }} />
            </div>
            <span className="bar-list__value">{genre.percentage}%</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);
