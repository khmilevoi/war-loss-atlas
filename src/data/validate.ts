import { NATIVE_FIELDS, type AtlasData } from './types';
import { aggregateConflicts } from './aggregate';

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
    registryIds.add(id);
    const noCoords = p.latitude === null && p.longitude === null;
    if (p.status === 'unplaced' ? !noCoords : noCoords || p.latitude === null || p.longitude === null ||
      !Number.isFinite(p.latitude) || !Number.isFinite(p.longitude) || Math.abs(p.latitude) > 90 || Math.abs(p.longitude) > 180) errors.push(`Coordinates ${id}`);
    if (!p.source_url || !p.basis || !p.reviewed_on || !p.note_ru) errors.push(`Geography provenance ${id}`);
  }
  for (const r of data.nativeRows) if (!registryIds.has(`ucdp:${r.conflict_id}`)) errors.push(`Missing placement ${r.conflict_id}`);
  if (data.placementRegistry.length !== 206) errors.push('Registry cardinality');
  if (data.historicalHighlights.length !== 4) errors.push('Historical cardinality');
  for (const h of data.historicalHighlights) {
    if (!registryIds.has(`history:${h.highlight_id}`)) errors.push(`Missing history placement ${h.highlight_id}`);
    if (h.estimate_kind === 'approximate' ? h.value === null || h.low !== null || h.high !== null :
      h.value !== null || h.low === null || h.high !== null) errors.push(`Historical semantics ${h.highlight_id}`);
    if ([h.value, h.low, h.high].some(v => v !== null && (!Number.isFinite(v) || v < 0))) errors.push(`Historical quantity ${h.highlight_id}`);
    if (!/^https:\/\//.test(h.source_url) || !h.source_title || !h.source_locator || !h.accessed_on ||
      !h.scope_ru || !h.uncertainty_ru) errors.push(`Historical provenance ${h.highlight_id}`);
  }
  return errors;
}
