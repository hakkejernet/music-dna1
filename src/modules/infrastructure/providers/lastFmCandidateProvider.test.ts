import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastFmSimilarArtist, LastFmTrack } from '../../lastfm';
import type { SpotifyArtist } from '../../spotify';

const { getTopArtists } = vi.hoisted(() => ({ getTopArtists: vi.fn<(limit?: number) => Promise<SpotifyArtist[]>>() }));
vi.mock('../../spotify', () => ({ getTopArtists }));

const { getSimilarArtists, getTopTracksForArtist, getTopTags } = vi.hoisted(() => ({
  getSimilarArtists: vi.fn<(artistName: string) => Promise<LastFmSimilarArtist[]>>(),
  getTopTracksForArtist: vi.fn<(artistName: string) => Promise<LastFmTrack[]>>(),
  getTopTags: vi.fn<(artistName: string) => Promise<string[]>>(),
}));
vi.mock('../../lastfm', () => ({ getSimilarArtists, getTopTracksForArtist, getTopTags }));

const spotifyArtist = (name: string): SpotifyArtist => ({
  id: `spotify-${name}`,
  name,
  genres: [],
  popularity: 50,
  followers: 0,
  images: [],
});

const similarArtist = (name: string, match: number): LastFmSimilarArtist => ({ name, mbid: null, match, url: `https://last.fm/${name}` });

const lastFmTrack = (id: string, name: string, artistName: string, playcount: number): LastFmTrack => ({
  id,
  name,
  artistName,
  artistMbid: null,
  playcount,
  listeners: playcount,
  url: `https://last.fm/${id}`,
  images: [],
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe('LastFmCandidateProvider — real candidates from a real, self-contained source (Sprint 1 Rule 1/2)', () => {
  it('reads Spotify top artists itself, then builds Candidates from Last.fm similar-artist tracks, with tags in rawMetadata', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue(['dream pop', 'post-rock']);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const provider = new LastFmCandidateProvider();
    const candidates = await provider.fetchCandidates({ limit: 10 });

    expect(candidates).toEqual([
      {
        candidateId: 'lastfm-track-svefn',
        title: 'Svefn-g-englar',
        artists: ['Sigur Ros'],
        contributions: [
          {
            providerName: 'lastfm',
            externalIds: { lastfmTrackId: 'track-svefn' },
            rawMetadata: { tags: ['dream pop', 'post-rock'], playcount: 500_000, listeners: 500_000, similarArtistMatch: 0.9 },
          },
        ],
      },
    ]);
  });

  it('respects the requested limit', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([
      lastFmTrack('t1', 'Track One', 'Sigur Ros', 100),
      lastFmTrack('t2', 'Track Two', 'Sigur Ros', 90),
    ]);
    getTopTags.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 1 });

    expect(candidates).toHaveLength(1);
  });
});

describe('LastFmCandidateProvider — never fabricates candidates on failure (Sprint 1 Rule 7)', () => {
  it('returns an empty array when there are no Spotify seed artists', async () => {
    getTopArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(candidates).toEqual([]);
    expect(getSimilarArtists).not.toHaveBeenCalled();
  });

  it('returns an empty array, never throws, when Spotify itself fails', async () => {
    getTopArtists.mockRejectedValue(new Error('spotify down'));

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(candidates).toEqual([]);
  });

  it('returns an empty array, never throws, when Last.fm itself fails for every seed', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockRejectedValue(new Error('lastfm down'));

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(candidates).toEqual([]);
  });

  it('still returns candidates when the tags lookup fails for one artist — best-effort, not all-or-nothing', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockRejectedValue(new Error('tags down'));

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(candidates).toHaveLength(1);
    expect((candidates[0].contributions[0].rawMetadata as { tags: string[] }).tags).toEqual([]);
  });
});
