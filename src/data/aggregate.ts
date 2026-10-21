import type { ConflictSummary, NativeRow } from './types';

/** Each conflict-year is admitted exactly once. Dyad lists and placements never enter this calculation. */
export function aggregateConflicts(rows: readonly NativeRow[]): readonly ConflictSummary[] {
  const seen = new Set<string>();
  const groups = new Map<string, ConflictSummary>();
  for (const row of rows) {
    const rowId = `${row.conflict_id}:${row.year}`;
    if (seen.has(rowId)) throw new Error(`Duplicate native row ${rowId}`);
    seen.add(rowId);
    let summary = groups.get(row.conflict_id);
    if (!summary) {
      summary = { id: row.conflict_id, name: `${row.location_inc ?? 'Неизвестно'} — ${row.territory_name ?? 'government'}`,
        firstObservedYear: row.year, lastObservedYear: row.year, best: null, low: null, high: null,
        missingCounts: { best: 0, low: 0, high: 0 }, rowIds: [] };
      groups.set(row.conflict_id, summary);
    }
    summary.firstObservedYear = Math.min(summary.firstObservedYear, row.year);
    summary.lastObservedYear = Math.max(summary.lastObservedYear, row.year);
    summary.rowIds.push(rowId);
    for (const [key, nativeKey] of [['best', 'bd_best'], ['low', 'bd_low'], ['high', 'bd_high']] as const) {
      const value = row[nativeKey];
      if (value === null) summary.missingCounts[key]++;
      else {
        if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid estimate ${rowId}:${nativeKey}`);
        summary[key] = (summary[key] ?? 0) + value;
      }
    }
  }
  return [...groups.values()].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
}
