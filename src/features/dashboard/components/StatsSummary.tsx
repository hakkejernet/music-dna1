import type { MusicDna } from '../../../modules/analysis';
import { formatDuration, formatPercent } from '../../../lib/format';

interface Props {
  dna: MusicDna;
}

const StatTile = ({ label, value }: { label: string; value: string }) => (
  <div className="stat-tile">
    <span className="stat-tile__value">{value}</span>
    <span className="stat-tile__label">{label}</span>
  </div>
);

export const StatsSummary = ({ dna }: Props) => (
  <section className="stats-summary">
    <StatTile label="Sange" value={dna.totalTracks.toLocaleString('da-DK')} />
    <StatTile label="Playlister" value={dna.totalPlaylists.toLocaleString('da-DK')} />
    <StatTile label="Unikke kunstnere" value={dna.uniqueArtistCount.toLocaleString('da-DK')} />
    <StatTile label="Samlet spilletid" value={formatDuration(dna.totalListeningTimeMs)} />
    <StatTile label="Gns. popularitet" value={`${Math.round(dna.averagePopularity)}/100`} />
    <StatTile label="Explicit-andel" value={formatPercent(dna.explicitRatio)} />
    <StatTile label="Kunstner-diversitet" value={formatPercent(dna.artistDiversity)} />
  </section>
);
