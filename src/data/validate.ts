import { NATIVE_FIELDS, type AtlasData } from './types';
import { aggregateConflicts } from './aggregate';
import { buildPlacements } from './placement-adapter';

function validDate(value: string): boolean {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sameFlatRecord(actual: object, expected: object): boolean {
  const values = actual as Record<string, unknown>;
  return Object.keys(actual).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => Object.hasOwn(values, key) && values[key] === value);
}

export function validatePublicData(data: AtlasData): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const r of data.nativeRows) {
    const id = `${r.conflict_id}:${r.year}`;
    if (seen.has(id)) errors.push(`Duplicate ${id}`);
    seen.add(id);
    if (Object.keys(r).sort().join() !== [...NATIVE_FIELDS].sort().join()) errors.push(`Native fields ${id}`);
    if (typeof r.conflict_id !== 'string' || typeof r.dyad_id !== 'string') errors.push(`Identifiers ${id}`);
    if (!Number.isInteger(r.year) || r.year < 1989 || r.year > 2025) errors.push(`Year ${id}`);
    for (const key of ['bd_best', 'bd_low', 'bd_high'] as const) {
      if (r[key] !== null && (!Number.isFinite(r[key]) || r[key]! < 0)) errors.push(`Estimate ${id}:${key}`);
    }
    for (const key of NATIVE_FIELDS.filter(k => !['year', 'bd_best', 'bd_low', 'bd_high'].includes(k))) {
      if (r[key] !== null && typeof r[key] !== 'string') errors.push(`Native string ${id}:${key}`);
    }
  }
  if (data.nativeRows.length !== 1650 || new Set(data.nativeRows.map(r => r.conflict_id)).size !== 202) errors.push('Source cardinality');
  for (const [key, sum] of [['bd_best', 2566047], ['bd_low', 2410880], ['bd_high', 3330850]] as const) {
    if (data.nativeRows.reduce((n, r) => n + (r[key] ?? 0), 0) !== sum) errors.push(`Source checksum ${key}`);
  }
  try {
    if (JSON.stringify(aggregateConflicts(data.nativeRows)) !== JSON.stringify(data.conflicts)) errors.push('Aggregate mismatch');
  } catch (error) { errors.push(String(error)); }
  const registryIds = new Set<string>();
  for (const p of data.placementRegistry) {
    const id = 'conflict_id' in p ? `ucdp:${p.conflict_id}` : `history:${p.highlight_id}`;
    if (registryIds.has(id)) errors.push(`Duplicate registry ${id}`);
    if (('conflict_id' in p) === ('highlight_id' in p) || !['country_anchor', 'theater_anchor', 'unplaced'].includes(p.status)) errors.push(`Registry schema ${id}`);
    registryIds.add(id);
    const noCoords = p.latitude === null && p.longitude === null;
    if (p.status === 'unplaced' ? !noCoords : noCoords || p.latitude === null || p.longitude === null ||
      !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) errors.push(`Coordinates ${id}`);
    if (!p.source_url || !p.basis || !p.reviewed_on || !p.note_ru) errors.push(`Geography provenance ${id}`);
  }
  for (const r of data.nativeRows) if (!registryIds.has(`ucdp:${r.conflict_id}`)) errors.push(`Missing placement ${r.conflict_id}`);
  if (data.placementRegistry.length !== 206) errors.push('Registry cardinality');
  const expectedPlacements = new Map(buildPlacements(data.placementRegistry).map(p => [p.placement_id, p]));
  const adapterIds = new Set<string>();
  for (const placement of data.placements) {
    const id = placement.placement_id;
    if (adapterIds.has(id)) errors.push(`Duplicate rendering placement ${id}`);
    adapterIds.add(id);
    const expected = expectedPlacements.get(id);
    // Compare every public adapter field, including entity ownership and source provenance.
    // Ignore key ordering, but keep null distinct from undefined and reject extra/missing fields.
    if (!expected || !sameFlatRecord(placement, expected)) errors.push(`Rendering placement mismatch ${id}`);
  }
  for (const id of expectedPlacements.keys()) if (!adapterIds.has(id)) errors.push(`Missing rendering placement ${id}`);
  if (data.historicalHighlights.length !== 4) errors.push('Historical cardinality');
  const historicalIds = new Set<string>();
  for (const h of data.historicalHighlights) {
    if (historicalIds.has(h.highlight_id)) errors.push(`Duplicate historical id ${h.highlight_id}`);
    historicalIds.add(h.highlight_id);
    if (!['ww1', 'ww2', 'us-civil', 'korea'].includes(h.highlight_id) ||
      !['total_war_deaths', 'war_deaths_source_definition', 'civilian_war_deaths'].includes(h.metric) ||
      !['approximate', 'lower_statement'].includes(h.estimate_kind) || typeof h.lower_exclusive !== 'boolean' ||
      !Number.isInteger(h.start_year) || !Number.isInteger(h.end_year) || h.start_year < 1 || h.start_year > h.end_year ||
      !validDate(h.accessed_on) || [h.name_ru, h.display_ru, h.scope_ru, h.uncertainty_ru, h.source_title, h.source_locator]
        .some(v => typeof v !== 'string' || v.trim().length === 0)) errors.push(`Historical schema ${h.highlight_id}`);
    const owned = buildPlacements(data.placementRegistry.filter(p => 'highlight_id' in p && p.highlight_id === h.highlight_id));
    if (!Array.isArray(h.placement_ids) || h.placement_ids.length !== owned.length ||
      new Set(h.placement_ids).size !== h.placement_ids.length ||
      owned.some(p => !h.placement_ids.includes(p.placement_id)) ||
      h.placement_ids.some(id => !adapterIds.has(id))) errors.push(`Historical placement references ${h.highlight_id}`);
    if (!registryIds.has(`history:${h.highlight_id}`)) errors.push(`Missing history placement ${h.highlight_id}`);
    if (h.estimate_kind === 'approximate' ? h.value === null || h.low !== null || h.high !== null || h.lower_exclusive !== false :
      h.value !== null || h.low === null || h.high !== null) errors.push(`Historical semantics ${h.highlight_id}`);
    if ([h.value, h.low, h.high].some(v => v !== null && (!Number.isFinite(v) || v < 0))) errors.push(`Historical quantity ${h.highlight_id}`);
    if (!/^https:\/\//.test(h.source_url) || !h.source_title || !h.source_locator || !h.accessed_on ||
      !h.scope_ru || !h.uncertainty_ru) errors.push(`Historical provenance ${h.highlight_id}`);
  }
  return errors;
}
