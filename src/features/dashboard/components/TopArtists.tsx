import type { TopArtist } from '../../../modules/analysis';

interface Props {
  artists: TopArtist[];
}

export const TopArtists = ({ artists }: Props) => (
  <section className="panel panel--wide">
    <h2>Dine mest spillede kunstnere</h2>
    {artists.length === 0 ? (
      <p className="panel__empty">Ingen kunstnere fundet endnu.</p>
    ) : (
      <div className="artist-grid">
        {artists.map((artist) => (
          <div key={artist.id} className="artist-card">
            {artist.images[0] ? (
              <img src={artist.images[0].url} alt="" className="artist-card__image" />
            ) : (
              <div className="artist-card__image artist-card__image--placeholder" />
            )}
            <span className="artist-card__name">{artist.name}</span>
            <span className="artist-card__count">{artist.trackCount} sange</span>
            {artist.genres[0] && <span className="artist-card__genre">{artist.genres[0]}</span>}
          </div>
        ))}
      </div>
    )}
  </section>
);
