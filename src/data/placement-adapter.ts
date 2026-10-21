import type { Placement, PlacementRegistryEntry } from './types';

/** The registry is the authority; adapters never supply or infer independent coordinates. */
export function buildPlacements(registry: readonly PlacementRegistryEntry[]): Placement[] {
  return registry.map(p => ({
    ...('conflict_id' in p ? { conflict_id: p.conflict_id } : { highlight_id: p.highlight_id }),
    placement_id: 'conflict_id' in p ? `ucdp:${p.conflict_id}` : `history:${p.highlight_id}`,
    latitude: p.latitude, longitude: p.longitude, label_ru: p.selected_country_or_theater ?? 'Без условной метки',
    precision: p.status === 'unplaced' ? 'unknown' : 'illustrative_region', basis: p.basis, source_url: p.source_url,
    review_status: p.status === 'unplaced' ? 'unplaced' : 'reviewed_source_anchor',
  }));
}
