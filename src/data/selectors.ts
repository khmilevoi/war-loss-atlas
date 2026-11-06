import { NATIVE_FIELDS, type AtlasData, type ConflictSummary, type Filters, type HistoricalHighlight,
  type Layer, type NativeField, type NativeRow } from './types';

export type Completeness = NonNullable<Filters['completeness']>;
export const UCDP_PERIOD_NOTE = 'Первый год наблюдения в UCDP, не начало войны. Обе границы включены. Потери за весь доступный период конфликта в источнике, не только за выбранные годы.';
export const HISTORY_PERIOD_NOTE = 'Год начала войны; обе границы включены. Оценка за весь доступный период в конкретном источнике. Определения карточек различаются; общего итога нет.';
export const ATLAS_PERIOD_NOTE = 'Поиск по году начала войны или первому году наблюдения в UCDP. Оценки относятся ко всему доступному периоду записи.';
const compareText = new Intl.Collator('ru', { numeric: true }).compare;
const normalizeText = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ru').trim();
export const defaultPeriod = (layer: Layer): [number, number] => {
  if (layer === 'all') return [1826, 2026];
  return layer === 'history' ? [1861, 2025] : [1989, 2025];
};

export function normalizeSort(value: string, layer: Layer): string {
  const [field, direction, extra] = value.split(':');
  if (extra !== undefined || (direction !== 'asc' && direction !== 'desc')) return 'year:asc';
  if (layer !== 'ucdp') return field === 'year' || field === 'name' ? value : 'year:asc';
  return field === 'name' || NATIVE_FIELDS.includes(field as NativeField) ? value : 'year:asc';
}

/** Normalizes the pair together: one invalid bound resets the whole source window. */
export function normalizeFilters(filters: Filters): Filters {
  const layer = filters.layer === 'all' || filters.layer === 'history' ? filters.layer : 'ucdp';
  const [min, max] = defaultPeriod(filters.atlasPeriod ? 'all' : layer);
  const valid = Number.isInteger(filters.from) && Number.isInteger(filters.to)
    && filters.from >= min && filters.to <= max && filters.from <= filters.to;
  const completeness = layer === 'history' ? 'all' : filters.completeness ?? 'all';
  return { layer, from: valid ? filters.from : min, to: valid ? filters.to : max,
    query: filters.query, sort: normalizeSort(filters.sort, layer), ...(filters.atlasPeriod ? { atlasPeriod: true as const } : {}),
    completeness: ['complete', 'partial', 'missing'].includes(completeness) ? completeness : 'all' };
}

/** Coverage of native estimate cells only, not confidence or coverage of all war deaths. */
export function conflictCompleteness(summary: ConflictSummary): Completeness {
  const missing = summary.missingCounts.best + summary.missingCounts.low + summary.missingCounts.high;
  return missing === 0 ? 'complete' : missing === summary.rowIds.length * 3 ? 'missing' : 'partial';
}

function admittedConflicts(data: AtlasData, filters: Filters): ConflictSummary[] {
  if (filters.layer === 'history') return [];
  const query = normalizeText(filters.query);
  const matchingIds = new Set<string>();
  if (query) for (const row of data.nativeRows) {
    if (NATIVE_FIELDS.some(key => row[key] !== null && normalizeText(String(row[key])).includes(query))) {
      matchingIds.add(row.conflict_id);
    }
  }
  if (query && filters.atlasPeriod) for (const placement of data.placements) {
    if ('conflict_id' in placement && placement.latitude !== null && normalizeText(placement.label_ru).includes(query)) {
      matchingIds.add(placement.conflict_id);
    }
  }
  return data.conflicts.filter(summary => summary.firstObservedYear >= filters.from && summary.firstObservedYear <= filters.to
    && (!query || matchingIds.has(summary.id) || normalizeText(summary.name).includes(query))
    && (filters.completeness === 'all' || conflictCompleteness(summary) === filters.completeness));
}

function compareValues(a: string | number | null, b: string | number | null, descending: boolean): number {
  // Missing values stay last even for a descending column; zero remains a number.
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1;
  const result = typeof a === 'number' && typeof b === 'number' ? a - b : compareText(String(a), String(b));
  return descending ? -result : result;
}

export function selectConflicts(data: AtlasData, filters: Filters): readonly ConflictSummary[] {
  const normalized = normalizeFilters(filters);
  const [field, direction] = normalized.sort.split(':');
  const firstRows = new Map<string, NativeRow>();
  for (const row of data.nativeRows) if (!firstRows.has(row.conflict_id)) firstRows.set(row.conflict_id, row);
  const value = (summary: ConflictSummary): string | number | null => {
    if (field === 'name') return summary.name;
    if (field === 'year') return summary.firstObservedYear;
    if (field === 'conflict_id') return summary.id;
    if (field === 'bd_best') return summary.best;
    if (field === 'bd_low') return summary.low;
    if (field === 'bd_high') return summary.high;
    return firstRows.get(summary.id)?.[field as NativeField] ?? null;
  };
  return admittedConflicts(data, normalized).sort((a, b) => compareValues(value(a), value(b), direction === 'desc')
    || compareText(`${a.id}:${a.firstObservedYear}`, `${b.id}:${b.firstObservedYear}`));
}

/** Period, search and completeness admit whole conflicts; never trim their source years. */
export function selectRows(data: AtlasData, filters: Filters): readonly NativeRow[] {
  const normalized = normalizeFilters(filters);
  const admitted = new Set(admittedConflicts(data, normalized).map(summary => summary.id));
  const [field, direction] = normalized.sort.split(':');
  const names = new Map(data.conflicts.map(summary => [summary.id, summary.name]));
  const value = (row: NativeRow) => field === 'name' ? names.get(row.conflict_id) ?? null : row[field as NativeField];
  return data.nativeRows.filter(row => admitted.has(row.conflict_id))
    .sort((a, b) => compareValues(value(a), value(b), direction === 'desc')
      || compareText(`${a.conflict_id}:${a.year}`, `${b.conflict_id}:${b.year}`));
}

/** Historical claims remain independent records, never synthetic UCDP summaries or a casualty ranking. */
export function selectHistoricalHighlights(data: AtlasData, filters: Filters): readonly HistoricalHighlight[] {
  const normalized = normalizeFilters(filters);
  if (normalized.layer === 'ucdp') return [];
  const query = normalizeText(normalized.query);
  const [field, direction] = normalized.sort.split(':');
  return data.historicalHighlights.filter(highlight => highlight.start_year >= normalized.from && highlight.start_year <= normalized.to
    && (!query || Object.values(highlight).some(value => value !== null && normalizeText(String(value)).includes(query))))
    .sort((a, b) => compareValues(field === 'name' ? a.name_ru : a.start_year, field === 'name' ? b.name_ru : b.start_year,
      direction === 'desc') || compareText(a.highlight_id, b.highlight_id));
}
