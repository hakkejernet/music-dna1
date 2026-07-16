export interface LastFmSimilarArtist {
  name: string;
  mbid: string | null;
  /** 0–1 similarity score as reported by Last.fm. */
  match: number;
  url: string;
}

export interface LastFmImage {
  url: string;
  size: string;
}

export interface LastFmTrack {
  /** mbid when Last.fm has one, otherwise a slug derived from artist+track name. */
  id: string;
  name: string;
  artistName: string;
  artistMbid: string | null;
  playcount: number;
  listeners: number;
  url: string;
  images: LastFmImage[];
}
