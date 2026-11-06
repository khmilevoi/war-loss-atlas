import type { Placement } from '../data/types';

export const battleDeathBins = [
  { min: 0, label: '0–999', color: '#a54958', radius: 4 },
  { min: 1_000, label: '1 000–9 999', color: '#c25463', radius: 5.5 },
  { min: 10_000, label: '10 000–49 999', color: '#e6636f', radius: 7.5 },
  { min: 50_000, label: '50 000 и более', color: '#ff8081', radius: 10 },
] as const;

export const historyMarkerColor = '#f4eee8';
export const unknownMarkerColor = '#b8abb0';
export const clusterMarkerColor = '#e4b7bb';

export type MapMarker = {
  latitude: number;
  longitude: number;
  ids: string[];
  label: string;
  kind: 'history' | 'ucdp' | 'unknown' | 'cluster';
  color: string;
  radius: number;
  estimate?: number;
};

const binForEstimate = (estimate: number) => battleDeathBins.filter(item => estimate >= item.min).at(-1) ?? battleDeathBins[0];

export function mapMarkers(placements: readonly Placement[], estimates?: ReadonlyMap<string, number | null>) {
  const grouped = new Map<string, { latitude: number; longitude: number; records: Map<string, Placement> }>();
  for (const placement of placements) {
    const { latitude, longitude } = placement;
    if (latitude === null || longitude === null) continue;
    const key = `${latitude}:${longitude}`;
    const group = grouped.get(key) ?? { latitude, longitude, records: new Map<string, Placement>() };
    const id = 'conflict_id' in placement ? placement.conflict_id : placement.highlight_id;
    group.records.set(id, placement);
    grouped.set(key, group);
  }

  return Array.from(grouped.values(), ({ latitude, longitude, records }): MapMarker => {
    const ids = [...records.keys()];
    const placement = records.get(ids[0])!;
    const base = { latitude, longitude, ids, label: placement.label_ru };
    if (ids.length > 1) {
      // The ring represents the largest complete estimate of an individual UCDP record.
      // Sharing an anchor does not make the records a combined death estimate.
      let maxEstimate: number | null = null;
      for (const record of records.values()) {
        if (!('conflict_id' in record)) continue;
        const estimate = estimates?.get(record.conflict_id);
        if (estimate != null && (maxEstimate === null || estimate > maxEstimate)) maxEstimate = estimate;
      }
      return { ...base, kind: 'cluster', color: maxEstimate === null ? clusterMarkerColor : binForEstimate(maxEstimate).color,
        radius: 8, estimate: maxEstimate ?? undefined };
    }
    if ('highlight_id' in placement) return { ...base, kind: 'history', color: historyMarkerColor, radius: 6 };
    const estimate = estimates?.get(placement.conflict_id);
    if (estimate == null) return { ...base, kind: 'unknown', color: unknownMarkerColor, radius: 5 };
    const bin = binForEstimate(estimate);
    return { ...base, kind: 'ucdp', color: bin.color, radius: bin.radius, estimate };
  });
}
