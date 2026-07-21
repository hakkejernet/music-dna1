import { getTopTags, getSimilarArtists, getTopTracksForArtist } from '../../lastfm';
import { getTopArtists } from '../../spotify';
import type { Candidate, CandidateProvider, CandidateRequest } from '../../candidateProviders';

/**
 * M21: raised from 3/5/5. The old values bounded the entire candidate
 * universe to at most 3 × 5 × 5 = 75 unique raw candidates, ever, for a
 * given user — every one of them already the "most similar" artists to
 * only 3 seeds, so once M19's exclusion-based refill exhausted that
 * fixed set (in practice within a handful of batches), there was
 * nothing broader left to draw from; whatever was still available near
 * the end was, by construction, the least-similar tail of an already
 * narrow set, which is what read as declining quality rather than a
 * separate ranking defect (Ranking Engine is unchanged — this is a
 * candidate-supply problem, not a scoring one). More seeds (Rule 3) and
 * a wider net per seed now bound the universe at up to 10 × 8 × 8 = 640
 * raw candidates before dedup — enough variety that a session should
 * exhaust it far less often.
 */
const MAX_SEED_ARTISTS = 10;
const MAX_SIMILAR_PER_SEED = 8;
const MAX_TRACKS_PER_ARTIST = 8;

interface CandidateArtist {
  name: string;
  match: number;
}

/**
 * Product Sprint 1's real `CandidateProvider`: the first (and only)
 * concrete implementation of the interface M3 defined but never filled
 * in. Self-contained on purpose — "Spotify Library → Candidate Provider"
 * is one arrow, so this provider reads the user's Spotify top artists
 * itself (via `modules/spotify`, already-real) rather than requiring a
 * caller to pass seed data through `CandidateRequest`, which stays
 * exactly `{ limit }` (M3's interface is unchanged — no architecture
 * change was needed to wire this in).
 *
 * Built on the same, already-proven-real Last.fm data source M15
 * established (`modules/lastfm`) — this is not a new provider *source*,
 * only the new-architecture adapter for it, since `CandidateProvider`
 * (M3) and the old `RecommendationProvider` (v1) are structurally
 * unrelated interfaces.
 *
 * Never throws (matches every other real provider in this codebase): a
 * failure anywhere in the chain degrades to an empty result, which the
 * CandidateAggregator (M3 Rule 5) already treats as this provider's own,
 * isolated failure — never a fabricated candidate (Sprint 1 Rule 7 /
 * M15 ADR-precedent).
 */
export class LastFmCandidateProvider implements CandidateProvider {
  readonly providerName = 'lastfm';

  async fetchCandidates(request: CandidateRequest): Promise<Candidate[]> {
    try {
      const topArtists = await getTopArtists(MAX_SEED_ARTISTS);
      if (topArtists.length === 0) return [];

      const candidateArtists = await this.findCandidateArtists(topArtists.map((artist) => artist.name));
      if (candidateArtists.length === 0) return [];

      const candidates = await this.collectCandidates(candidateArtists);
      return candidates.slice(0, request.limit);
    } catch {
      return [];
    }
  }

  /** Similar artists per seed, merged and deduplicated by name (keeping the best match) — same shape as the old, already-proven LastFmRecommendationProvider logic (M15). */
  private async findCandidateArtists(seedNames: string[]): Promise<CandidateArtist[]> {
    const results = await Promise.allSettled(seedNames.map((seed) => getSimilarArtists(seed)));

    const byName = new Map<string, CandidateArtist>();
    for (const result of results) {
      if (result.status === 'rejected') continue;
      for (const artist of result.value.slice(0, MAX_SIMILAR_PER_SEED)) {
        const key = artist.name.toLowerCase();
        const existing = byName.get(key);
        if (!existing || artist.match > existing.match) {
          byName.set(key, { name: artist.name, match: artist.match });
        }
      }
    }
    return [...byName.values()];
  }

  /**
   * Top tracks + genre tags per candidate artist, mapped straight to
   * `Candidate`. Tags are fetched alongside tracks so `rawMetadata.tags`
   * is populated for `tagBasedEnricher` (M4) — without this, every
   * candidate would enrich to a fully neutral TrackDNA and "why this
   * track" would never have anything real to say (Sprint 1 Rule 4).
   * `explicit` is deliberately left off `rawMetadata`: Last.fm exposes no
   * such field, so `explicitMetadataEnricher` stays at its own neutral
   * default for every candidate from this provider — a known limitation,
   * not something faked here.
   */
  private async collectCandidates(candidateArtists: CandidateArtist[]): Promise<Candidate[]> {
    const results = await Promise.allSettled(
      candidateArtists.map(async (artist) => {
        const [tracks, tags] = await Promise.all([
          getTopTracksForArtist(artist.name),
          getTopTags(artist.name).catch(() => []),
        ]);
        return { artist, tracks, tags };
      }),
    );

    const byCandidateId = new Map<string, Candidate>();
    for (const result of results) {
      if (result.status === 'rejected') continue;
      const { artist, tracks, tags } = result.value;
      for (const track of tracks.slice(0, MAX_TRACKS_PER_ARTIST)) {
        const candidateId = `lastfm-${track.id}`;
        if (byCandidateId.has(candidateId)) continue;
        byCandidateId.set(candidateId, {
          candidateId,
          title: track.name,
          artists: [track.artistName],
          contributions: [
            {
              providerName: this.providerName,
              externalIds: { lastfmTrackId: track.id },
              rawMetadata: { tags, playcount: track.playcount, listeners: track.listeners, similarArtistMatch: artist.match },
            },
          ],
        });
      }
    }
    return [...byCandidateId.values()];
  }
}
