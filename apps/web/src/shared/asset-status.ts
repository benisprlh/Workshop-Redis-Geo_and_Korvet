import type { Snapshot } from '@fieldops/contracts';

export function assetStatus(s: Snapshot, assetId: string) {
  const event = s.events.filter((e) => e.assetId === assetId).at(-1);
  if (!event) return { label: 'Belum aktif', tone: 'neutral' as const, event };
  if (event.temperatureC > s.thresholds.temperatureC || event.voltageV < s.thresholds.voltageV)
    return { label: 'Perlu perhatian', tone: 'amber' as const, event };
  if (Date.now() - new Date(event.timestamp).getTime() > 30000)
    return { label: 'Data tidak baru', tone: 'neutral' as const, event };
  return { label: 'Normal', tone: 'green' as const, event };
}
