import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LastFmSimilarArtist, LastFmSimilarTrack, LastFmTrack } from '../../lastfm';
import type { SpotifyArtist, SpotifyTrack } from '../../spotify';

const { getTopArtists } = vi.hoisted(() => ({ getTopArtists: vi.fn<(limit?: number) => Promise<SpotifyArtist[]>>() }));
vi.mock('../../spotify', () => ({ getTopArtists }));

const { getSimilarArtists, getSimilarTracks, getTopTracksForArtist, getTopTags } = vi.hoisted(() => ({
  getSimilarArtists: vi.fn<(artistName: string) => Promise<LastFmSimilarArtist[]>>(),
  getSimilarTracks: vi.fn<(artistName: string, trackName: string) => Promise<LastFmSimilarTrack[]>>(),
  getTopTracksForArtist: vi.fn<(artistName: string) => Promise<LastFmTrack[]>>(),
  getTopTags: vi.fn<(artistName: string) => Promise<string[]>>(),
}));
vi.mock('../../lastfm', () => ({ getSimilarArtists, getSimilarTracks, getTopTracksForArtist, getTopTags }));

const { getAllArtists, getAllTracks } = vi.hoisted(() => ({
  getAllArtists: vi.fn<() => Promise<SpotifyArtist[]>>(),
  getAllTracks: vi.fn<() => Promise<SpotifyTrack[]>>(),
}));
vi.mock('../../storage', () => ({ getAllArtists, getAllTracks }));

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

const similarTrack = (name: string, artistName: string, match: number): LastFmSimilarTrack => ({
  name,
  artistName,
  mbid: null,
  match,
  url: `https://last.fm/${artistName}/${name}`,
});

const spotifyTrack = (id: string, name: string, artistName: string): SpotifyTrack => ({
  id,
  name,
  durationMs: 200_000,
  explicit: false,
  popularity: 50,
  isrc: null,
  previewUrl: null,
  albumId: `album-${id}`,
  albumName: 'Album',
  albumImages: [],
  releaseDate: null,
  releaseDatePrecision: null,
  artists: [{ id: `spotify-${artistName}`, name: artistName }],
  addedAt: null,
  playlistIds: [],
});

beforeEach(() => {
  vi.resetAllMocks();
  // M28 default: an empty local library, i.e. "never synced" — every
  // pre-existing test in this file exercises exactly the pre-M28 seed
  // set unless it explicitly overrides this.
  getAllArtists.mockResolvedValue([]);
  // M30 default: no synced tracks either, so buildTrackSimilarityIndex()
  // is a no-op and no candidate ever gets a trackSimilarityMatch, unless
  // a test explicitly overrides this.
  getAllTracks.mockResolvedValue([]);
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
            rawMetadata: {
              tags: ['dream pop', 'post-rock'],
              playcount: 500_000,
              listeners: 500_000,
              similarArtistMatch: 0.9,
              seedArtist: 'Radiohead',
              similarArtist: 'Sigur Ros',
            },
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

describe('LastFmCandidateProvider — expanded candidate pool (M21)', () => {
  it('asks Spotify for more than 3 seed artists', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getTopArtists).toHaveBeenCalledWith(expect.any(Number));
    const requestedSeedCount = getTopArtists.mock.calls[0]?.[0];
    expect(requestedSeedCount).toBeGreaterThan(3);
  });

  it('draws candidates from every seed artist, not just the first few, once there are more than 3', async () => {
    const seedArtists = Array.from({ length: 10 }, (_, i) => spotifyArtist(`Seed${i}`));
    getTopArtists.mockResolvedValue(seedArtists);
    getSimilarArtists.mockImplementation(async (seedName: string) => [similarArtist(`SimilarTo-${seedName}`, 0.5)]);
    getTopTracksForArtist.mockImplementation(async (artistName: string) => [
      lastFmTrack(`track-${artistName}`, `Track by ${artistName}`, artistName, 100),
    ]);
    getTopTags.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 100 });

    // One unique similar artist (and therefore one candidate track) per
    // seed — with 10 seeds now requested (up from 3), all 10 must show
    // up as distinct candidates, proving the wider seed set actually
    // reaches the returned pool rather than being discarded somewhere.
    expect(candidates).toHaveLength(10);
    const artistNames = new Set(candidates.map((candidate) => candidate.artists[0]));
    expect(artistNames.size).toBe(10);
  });
});

describe('LastFmCandidateProvider — widens seeds with the local library (M28)', () => {
  it('seeds from local library artists in addition to Spotify top artists', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getAllArtists.mockResolvedValue([spotifyArtist('Boards of Canada')]);
    getSimilarArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    const calledWith = getSimilarArtists.mock.calls.map((call) => call[0]);
    expect(calledWith).toContain('Radiohead');
    expect(calledWith).toContain('Boards of Canada');
  });

  it('behaves identically to before M28 when the local library is empty (never synced)', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getAllArtists.mockResolvedValue([]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarArtists).toHaveBeenCalledTimes(1);
    expect(getSimilarArtists).toHaveBeenCalledWith('Radiohead');
    expect(candidates).toHaveLength(1);
  });

  it('still seeds from Spotify top artists when the local library lookup rejects', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getAllArtists.mockRejectedValue(new Error('indexedDB unavailable'));
    getSimilarArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarArtists).toHaveBeenCalledWith('Radiohead');
  });

  it('does not double-count a library artist that case-insensitively matches an existing top artist', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getAllArtists.mockResolvedValue([spotifyArtist('radiohead')]);
    getSimilarArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarArtists).toHaveBeenCalledTimes(1);
  });

  it('caps the combined seed count at MAX_TOTAL_SEED_ARTISTS while always keeping every Spotify top artist', async () => {
    const topArtists = Array.from({ length: 10 }, (_, i) => spotifyArtist(`Top${i}`));
    const libraryArtists = Array.from({ length: 50 }, (_, i) => spotifyArtist(`Library${i}`));
    getTopArtists.mockResolvedValue(topArtists);
    getAllArtists.mockResolvedValue(libraryArtists);
    getSimilarArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarArtists).toHaveBeenCalledTimes(30);
    const calledWith = getSimilarArtists.mock.calls.map((call) => call[0]);
    for (const topArtist of topArtists) {
      expect(calledWith).toContain(topArtist.name);
    }
  });

  it('returns an empty array when both Spotify top artists and the local library are empty', async () => {
    getTopArtists.mockResolvedValue([]);
    getAllArtists.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(candidates).toEqual([]);
    expect(getSimilarArtists).not.toHaveBeenCalled();
  });
});

describe('LastFmCandidateProvider — attaches track-level similarity from the local library (M30)', () => {
  it('attaches trackSimilarityMatch when a candidate matches a similar-track result for a synced library track', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([spotifyTrack('lib-1', 'Karma Police', 'Radiohead')]);
    getSimilarTracks.mockResolvedValue([similarTrack('Svefn-g-englar', 'Sigur Ros', 0.8)]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarTracks).toHaveBeenCalledWith('Radiohead', 'Karma Police');
    expect((candidates[0].contributions[0].rawMetadata as { trackSimilarityMatch?: number }).trackSimilarityMatch).toBe(0.8);
  });

  it('leaves rawMetadata untouched when no candidate matches any similar-track result', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([spotifyTrack('lib-1', 'Karma Police', 'Radiohead')]);
    getSimilarTracks.mockResolvedValue([similarTrack('Some Other Song', 'Some Other Artist', 0.8)]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect((candidates[0].contributions[0].rawMetadata as { trackSimilarityMatch?: number }).trackSimilarityMatch).toBeUndefined();
  });

  it('is a full no-op when the local library has never been synced (empty getAllTracks)', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarTracks).not.toHaveBeenCalled();
    expect((candidates[0].contributions[0].rawMetadata as { trackSimilarityMatch?: number }).trackSimilarityMatch).toBeUndefined();
  });

  it('degrades to a full no-op, without throwing, when getAllTracks rejects', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockRejectedValue(new Error('indexedDB unavailable'));

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(candidates).toHaveLength(1);
    expect(getSimilarTracks).not.toHaveBeenCalled();
  });

  it('isolates one failing seed track from the others', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([
      spotifyTrack('lib-1', 'Failing Seed', 'Radiohead'),
      spotifyTrack('lib-2', 'Working Seed', 'Radiohead'),
    ]);
    getSimilarTracks.mockImplementation(async (_artist: string, track: string) => {
      if (track === 'Failing Seed') throw new Error('lastfm down');
      return [similarTrack('Svefn-g-englar', 'Sigur Ros', 0.6)];
    });

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    const candidates = await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect((candidates[0].contributions[0].rawMetadata as { trackSimilarityMatch?: number }).trackSimilarityMatch).toBe(0.6);
  });

  it('caps the number of similarity seed tracks queried at MAX_SIMILARITY_SEED_TRACKS', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue(Array.from({ length: 50 }, (_, i) => spotifyTrack(`lib-${i}`, `Track ${i}`, 'Radiohead')));
    getSimilarTracks.mockResolvedValue([]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarTracks).toHaveBeenCalledTimes(15);
  });

  it('skips a seed track with no listed artist', async () => {
    getTopArtists.mockResolvedValue([spotifyArtist('Radiohead')]);
    getSimilarArtists.mockResolvedValue([similarArtist('Sigur Ros', 0.9)]);
    getTopTracksForArtist.mockResolvedValue([lastFmTrack('track-svefn', 'Svefn-g-englar', 'Sigur Ros', 500_000)]);
    getTopTags.mockResolvedValue([]);
    getAllTracks.mockResolvedValue([{ ...spotifyTrack('lib-1', 'No Artist Track', 'Radiohead'), artists: [] }]);

    const { LastFmCandidateProvider } = await import('./lastFmCandidateProvider');
    await new LastFmCandidateProvider().fetchCandidates({ limit: 10 });

    expect(getSimilarTracks).not.toHaveBeenCalled();
  });
});
