import { NATIVE_FIELDS, type HistoricalHighlight, type NativeRow } from './types';

export const HISTORICAL_FIELDS = ['highlight_id', 'name_ru', 'start_year', 'end_year', 'metric', 'estimate_kind',
  'value', 'low', 'high', 'lower_exclusive', 'display_ru', 'source_title', 'source_url', 'source_locator',
  'accessed_on', 'uncertainty_ru', 'scope_ru', 'placement_ids'] as const satisfies readonly (keyof HistoricalHighlight)[];

const quote = (value: unknown): string => `"${(value === null || value === undefined ? ''
  : Array.isArray(value) ? JSON.stringify(value) : String(value)).replaceAll('"', '""')}"`;

/** UTF-8 text for the full filtered input, preserving the 25 native fields and null as an empty cell. */
export function toCsv(rows: readonly NativeRow[]): string {
  return [NATIVE_FIELDS.map(quote).join(','), ...rows.map(row => NATIVE_FIELDS.map(key => quote(row[key])).join(','))].join('\r\n') + '\r\n';
}

/** Independent source-specific historical schema; intentional unavailable bounds remain empty. */
export function toHistoricalCsv(rows: readonly HistoricalHighlight[]): string {
  return [HISTORICAL_FIELDS.map(quote).join(','), ...rows.map(row => HISTORICAL_FIELDS.map(key => quote(row[key])).join(','))].join('\r\n') + '\r\n';
}
