import { lastFmGet } from './client';
import type { LastFmImage, LastFmSimilarArtist, LastFmTrack } from './types';

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

interface RawSimilarArtist {
  name: string;
  mbid?: string;
  match: string;
  url: string;
}

interface RawSimilarArtistsResponse {
  similarartists?: { artist?: RawSimilarArtist[] };
}

const SIMILAR_ARTISTS_LIMIT = 5;

export const getSimilarArtists = async (artistName: string): Promise<LastFmSimilarArtist[]> => {
  const data = await lastFmGet<RawSimilarArtistsResponse>({
    method: 'artist.getsimilar',
    artist: artistName,
    autocorrect: '1',
    limit: String(SIMILAR_ARTISTS_LIMIT),
  });

  return (data.similarartists?.artist ?? []).map((artist) => ({
    name: artist.name,
    mbid: artist.mbid || null,
    match: Number(artist.match) || 0,
    url: artist.url,
  }));
};

interface RawImage {
  '#text': string;
  size: string;
}

interface RawTopTrack {
  name: string;
  playcount: string;
  listeners: string;
  mbid?: string;
  url: string;
  artist: { name: string; mbid?: string };
  image?: RawImage[];
}

interface RawTopTracksResponse {
  toptracks?: { track?: RawTopTrack[] };
}

const TOP_TRACKS_LIMIT = 5;

const mapImages = (images: RawImage[] | undefined): LastFmImage[] =>
  (images ?? []).filter((image) => image['#text']).map((image) => ({ url: image['#text'], size: image.size }));

export const getTopTracksForArtist = async (artistName: string): Promise<LastFmTrack[]> => {
  const data = await lastFmGet<RawTopTracksResponse>({
    method: 'artist.gettoptracks',
    artist: artistName,
    autocorrect: '1',
    limit: String(TOP_TRACKS_LIMIT),
  });

  return (data.toptracks?.track ?? []).map((track) => ({
    id: track.mbid || `lastfm-${slugify(track.artist.name)}-${slugify(track.name)}`,
    name: track.name,
    artistName: track.artist.name,
    artistMbid: track.artist.mbid || null,
    playcount: Number(track.playcount) || 0,
    listeners: Number(track.listeners) || 0,
    url: track.url,
    images: mapImages(track.image),
  }));
};
