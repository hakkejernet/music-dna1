import type { SpotifyArtist, SpotifyPlaylist, SpotifyTrack } from '../spotify/types';
import type { DecadeShare, GenreShare, MusicDna, PopularityBucket, TopArtist } from './types';

const TOP_GENRES_LIMIT = 15;
const TOP_ARTISTS_LIMIT = 20;

const POPULARITY_BUCKETS: Array<[label: string, min: number, max: number]> = [
  ['Undergrund (0-20)', 0, 20],
  ['Niche (21-40)', 21, 40],
  ['Voksende (41-60)', 41, 60],
  ['Populær (61-80)', 61, 80],
  ['Mainstream (81-100)', 81, 100],
];

const toDecade = (track: SpotifyTrack): string | null => {
  if (!track.releaseDate) return null;
  const year = Number.parseInt(track.releaseDate.slice(0, 4), 10);
  if (Number.isNaN(year)) return null;
  const decadeStart = Math.floor(year / 10) * 10;
  return `${decadeStart}'erne`;
};

const percentage = (part: number, total: number): number =>
  total === 0 ? 0 : Math.round((part / total) * 1000) / 10;

export const computeMusicDna = (
  tracks: SpotifyTrack[],
  artists: SpotifyArtist[],
  playlists: SpotifyPlaylist[],
): MusicDna => {
  const artistById = new Map(artists.map((artist) => [artist.id, artist]));
  const totalTracks = tracks.length;

  const genreCounts = new Map<string, number>();
  const artistTrackCounts = new Map<string, number>();
  const decadeCounts = new Map<string, number>();
  let explicitCount = 0;
  let totalDurationMs = 0;
  let totalPopularity = 0;

  for (const track of tracks) {
    totalDurationMs += track.durationMs;
    totalPopularity += track.popularity;
    if (track.explicit) explicitCount += 1;

    const decade = toDecade(track);
    if (decade) decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);

    const seenGenresForTrack = new Set<string>();
    for (const artistRef of track.artists) {
      artistTrackCounts.set(artistRef.id, (artistTrackCounts.get(artistRef.id) ?? 0) + 1);
      const artist = artistById.get(artistRef.id);
      for (const genre of artist?.genres ?? []) {
        seenGenresForTrack.add(genre);
      }
    }
    for (const genre of seenGenresForTrack) {
      genreCounts.set(genre, (genreCounts.get(genre) ?? 0) + 1);
    }
  }

  const genres: GenreShare[] = [...genreCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_GENRES_LIMIT)
    .map(([genre, count]) => ({
      genre,
      trackCount: count,
      percentage: percentage(count, totalTracks),
    }));

  const decades: DecadeShare[] = [...decadeCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([decade, count]) => ({
      decade,
      trackCount: count,
      percentage: percentage(count, totalTracks),
    }));

  const popularityBuckets: PopularityBucket[] = POPULARITY_BUCKETS.map(([label, min, max]) => {
    const count = tracks.filter((track) => track.popularity >= min && track.popularity <= max).length;
    return { label, min, max, trackCount: count, percentage: percentage(count, totalTracks) };
  });

  const topArtists: TopArtist[] = [...artistTrackCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_ARTISTS_LIMIT)
    .map(([artistId, trackCount]) => {
      const artist = artistById.get(artistId);
      return {
        id: artistId,
        name: artist?.name ?? 'Ukendt kunstner',
        trackCount,
        genres: artist?.genres ?? [],
        images: artist?.images ?? [],
      };
    });

  return {
    totalTracks,
    totalPlaylists: playlists.length,
    uniqueArtistCount: artistTrackCounts.size,
    totalListeningTimeMs: totalDurationMs,
    averageTrackDurationMs: totalTracks === 0 ? 0 : totalDurationMs / totalTracks,
    averagePopularity: totalTracks === 0 ? 0 : totalPopularity / totalTracks,
    explicitRatio: totalTracks === 0 ? 0 : explicitCount / totalTracks,
    artistDiversity: totalTracks === 0 ? 0 : artistTrackCounts.size / totalTracks,
    genres,
    decades,
    popularityBuckets,
    topArtists,
  };
};
