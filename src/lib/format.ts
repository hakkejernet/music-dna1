export const formatDuration = (ms: number): string => {
  const totalMinutes = Math.round(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} t ${minutes} min`;
};

export const formatPercent = (fraction: number): string => `${Math.round(fraction * 100)}%`;
