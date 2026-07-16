import { classifyLastFmFailure, updateLastFmDiagnostics } from '../diagnostics';
import { getSimilarArtists, getTopTracksForArtist } from '../lastfm';
import type { LastFmTrack } from '../lastfm';
import { hasLastfmApiKey } from '../../lib/env';
import type { SpotifyTrack } from '../spotify/types';
import type { Recommendation, RecommendationProvider, UserProfile } from './types';

const MAX_SEED_ARTISTS = 3;
const MAX_SIMILAR_PER_SEED = 5;
const MAX_TRACKS_PER_ARTIST = 5;

/** Rough, non-scientific 0–100 spread from raw playcount — descriptive metadata only, not the recommendation score. */
const popularityFromPlaycount = (playcount: number): number =>
  Math.max(0, Math.min(100, Math.round(Math.log10(playcount + 1) * 14)));

const toSpotifyTrackShape = (track: LastFmTrack): SpotifyTrack => ({
  id: track.id,
  name: track.name,
  durationMs: 0,
  explicit: false,
  popularity: popularityFromPlaycount(track.playcount),
  isrc: null,
  previewUrl: null,
  albumId: `lastfm-${track.artistMbid ?? track.artistName}`,
  albumName: 'Ukendt album',
  albumImages: track.images.map((image) => ({ url: image.url, width: null, height: null })),
  releaseDate: null,
  releaseDatePrecision: null,
  artists: [{ id: track.artistMbid ?? `lastfm-artist-${track.artistName}`, name: track.artistName }],
  addedAt: null,
  playlistIds: [],
});

interface CandidateArtist {
  name: string;
  match: number;
  seed: string;
}

/**
 * First real (non-mock) RecommendationProvider. Not perfect, just working:
 * no caching, no cross-source fusion, no retry/backoff. Fully independent
 * of Spotify at runtime — it only reads artist *names* off UserProfile
 * (already fetched from Spotify's top-artists call elsewhere) and talks to
 * Last.fm from here on. If a call for one artist fails, that artist is
 * skipped and the rest continue — this returns as many recommendations as
 * it can get, not all-or-nothing.
 *
 * Every stage also reports into modules/diagnostics (see DebugPanel) so a
 * silent "0 recommendations" can be traced back to its actual cause instead
 * of guessed at — this never changes the resilient skip-and-continue
 * behavior above, it only records what happened.
 */
export class LastFmRecommendationProvider implements RecommendationProvider {
  async getRecommendations(user: UserProfile): Promise<Recommendation[]> {
    updateLastFmDiagnostics({ apiKeyPresent: hasLastfmApiKey() });

    try {
      const seedNames = user.seedArtistNames.slice(0, MAX_SEED_ARTISTS);
      if (seedNames.length === 0) {
        console.warn('[LastFmRecommendationProvider] Ingen seed-kunstnere tilgængelige — springer Last.fm-kald over.');
        return [];
      }

      const candidateArtists = await this.findCandidateArtists(seedNames);
      if (candidateArtists.length === 0) {
        console.warn('[LastFmRecommendationProvider] Last.fm fandt ingen lignende kunstnere for nogen af seeds.');
        return [];
      }

      const recommendations = await this.collectRecommendations(candidateArtists);
      updateLastFmDiagnostics({ recommendationsBuilt: recommendations.length });
      return recommendations;
    } catch (error) {
      updateLastFmDiagnostics({ error: classifyLastFmFailure(error) });
      console.warn('[LastFmRecommendationProvider] Uventet fejl, returnerer ingen anbefalinger:', error);
      return [];
    }
  }

  /** Similar artists per seed, merged and deduplicated by name (keeping the best match). */
  private async findCandidateArtists(seedNames: string[]): Promise<CandidateArtist[]> {
    updateLastFmDiagnostics({ apiCallMade: true });

    const results = await Promise.allSettled(
      seedNames.map(async (seed) => ({ seed, similar: await getSimilarArtists(seed) })),
    );

    let firstError: unknown = null;
    const byName = new Map<string, CandidateArtist>();
    for (const result of results) {
      if (result.status === 'rejected') {
        firstError ??= result.reason;
        console.warn('[LastFmRecommendationProvider] artist.getsimilar fejlede for en seed-kunstner:', result.reason);
        continue;
      }
      const { seed, similar } = result.value;
      for (const artist of similar.slice(0, MAX_SIMILAR_PER_SEED)) {
        const key = artist.name.toLowerCase();
        const existing = byName.get(key);
        if (!existing || artist.match > existing.match) {
          byName.set(key, { name: artist.name, match: artist.match, seed });
        }
      }
    }

    const candidates = [...byName.values()];
    updateLastFmDiagnostics({
      similarArtistsFound: candidates.length,
      error: candidates.length === 0 && firstError ? classifyLastFmFailure(firstError) : null,
    });
    return candidates;
  }

  /** Top tracks per candidate artist, mapped to Recommendation and deduplicated by track id. */
  private async collectRecommendations(candidates: CandidateArtist[]): Promise<Recommendation[]> {
    const results = await Promise.allSettled(
      candidates.map(async (candidate) => ({ candidate, tracks: await getTopTracksForArtist(candidate.name) })),
    );

    let firstError: unknown = null;
    let topTracksTotal = 0;
    const byTrackId = new Map<string, Recommendation>();
    for (const result of results) {
      if (result.status === 'rejected') {
        firstError ??= result.reason;
        console.warn('[LastFmRecommendationProvider] artist.gettoptracks fejlede for en kandidat-kunstner:', result.reason);
        continue;
      }
      const { candidate, tracks } = result.value;
      topTracksTotal += tracks.length;
      for (const track of tracks.slice(0, MAX_TRACKS_PER_ARTIST)) {
        const recommendation: Recommendation = {
          id: `lastfm-rec-${track.id}`,
          track: toSpotifyTrackShape(track),
          source: 'lastfm',
          score: candidate.match,
          reasons: [`Ligner ${candidate.seed} på Last.fm`],
          genres: [],
          // Last.fm never gives us a real Spotify ID (mbid or synthetic slug only) —
          // modules/spotifyLink resolves+caches one on demand when the user acts on this card.
          spotifyTrackId: null,
        };
        const existing = byTrackId.get(recommendation.track.id);
        if (!existing || recommendation.score > existing.score) {
          byTrackId.set(recommendation.track.id, recommendation);
        }
      }
    }

    updateLastFmDiagnostics({
      topTracksFound: topTracksTotal,
      error: byTrackId.size === 0 && firstError ? classifyLastFmFailure(firstError) : null,
    });
    return [...byTrackId.values()];
  }
}
