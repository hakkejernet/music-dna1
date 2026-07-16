import type { SpotifyTrack } from '../../../modules/spotify/types';
import { PreviewPlayer } from './PreviewPlayer';

interface Props {
  track: SpotifyTrack;
  genre: string | null;
}

export const DiscoveryCard = ({ track, genre }: Props) => {
  const cover = track.albumImages[0]?.url ?? null;
  const artistNames = track.artists.map((artist) => artist.name).join(', ');

  return (
    <div className="discovery-card">
      {cover ? (
        <img className="discovery-card__cover" src={cover} alt="" />
      ) : (
        <div className="discovery-card__cover discovery-card__cover--placeholder" />
      )}

      <div className="discovery-card__info">
        <h2 className="discovery-card__title">{track.name}</h2>
        <p className="discovery-card__artist">{artistNames}</p>
        <p className="discovery-card__album">{track.albumName}</p>
        {genre && <span className="discovery-card__genre">{genre}</span>}
      </div>

      <PreviewPlayer previewUrl={track.previewUrl} />
    </div>
  );
};
