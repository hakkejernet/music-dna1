export interface GenreShare {
  genre: string;
  trackCount: number;
  percentage: number;
}

export interface DecadeShare {
  decade: string;
  trackCount: number;
  percentage: number;
}

export interface PopularityBucket {
  label: string;
  min: number;
  max: number;
  trackCount: number;
  percentage: number;
}

export interface TopArtist {
  id: string;
  name: string;
  trackCount: number;
  genres: string[];
  images: { url: string; width: number | null; height: number | null }[];
}

export interface MusicDna {
  totalTracks: number;
  totalPlaylists: number;
  uniqueArtistCount: number;
  totalListeningTimeMs: number;
  averageTrackDurationMs: number;
  averagePopularity: number;
  explicitRatio: number;
  artistDiversity: number;
  genres: GenreShare[];
  decades: DecadeShare[];
  popularityBuckets: PopularityBucket[];
  topArtists: TopArtist[];
}
