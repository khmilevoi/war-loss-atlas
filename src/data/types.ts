export const NATIVE_FIELDS = ['conflict_id', 'dyad_id', 'location_inc', 'side_a', 'side_a_id',
  'side_a_2nd', 'side_b', 'side_b_id', 'side_b_2nd', 'incompatibility', 'territory_name',
  'year', 'bd_best', 'bd_low', 'bd_high', 'type_of_conflict', 'battle_location', 'gwno_a',
  'gwno_a_2nd', 'gwno_b', 'gwno_b_2nd', 'gwno_loc', 'gwno_battle', 'region', 'version'] as const;
export type NativeField = typeof NATIVE_FIELDS[number];
export type EstimateField = 'bd_best' | 'bd_low' | 'bd_high';
export type NativeRow = Readonly<Record<Exclude<NativeField, 'year' | EstimateField | 'conflict_id' | 'dyad_id'>, string | null>> & {
  conflict_id: string; dyad_id: string; year: number; bd_best: number | null; bd_low: number | null; bd_high: number | null;
};
export interface ConflictSummary {
  id: string; name: string; firstObservedYear: number; lastObservedYear: number;
  best: number | null; low: number | null; high: number | null;
  missingCounts: { best: number; low: number; high: number }; rowIds: string[];
}
export interface HistoricalHighlight {
  highlight_id: string; name_ru: string; start_year: number; end_year: number;
  metric: 'total_war_deaths' | 'war_deaths_source_definition' | 'civilian_war_deaths';
  estimate_kind: 'lower_statement' | 'approximate'; value: number | null;
  low: number | null; high: number | null; lower_exclusive: boolean;
  display_ru: string; source_title: string; source_url: string; source_locator: string;
  accessed_on: string; uncertainty_ru: string; scope_ru: string; placement_ids: string[];
}
export interface CountryAnchor {
  key: string; aliases: string[]; display_name: string; latitude: number; longitude: number;
  source_url: string; coordinate_method: string; version: string;
}
export type PlacementRegistryEntry = ({ conflict_id: string } | { highlight_id: string }) & {
  anchor_id: string | null; latitude: number | null; longitude: number | null;
  status: 'country_anchor' | 'theater_anchor' | 'unplaced'; basis: string;
  location_labels_raw: string[]; selected_country_or_theater: string | null;
  source_url: string; reviewed_on: string; note_ru: string;
};
/** Rendering adapter; unknown entries remain present, with null coordinates. */
export type Placement = ({ conflict_id: string } | { highlight_id: string }) & {
  placement_id: string; latitude: number | null; longitude: number | null; label_ru: string;
  precision: 'illustrative_region' | 'unknown'; basis: string; source_url: string;
  review_status: 'reviewed_source_anchor' | 'unplaced';
};
export interface SourceRecord {
  source_id: string; title: string; version: string; source_url: string; license: string;
  license_url: string; accessed_on: string; changes_ru: string; citations: string[];
}
export interface DataManifest {
  schemaVersion: number; source: { path: string; sha256: string; source_url: string; version: string };
  nativeRowCount: number; conflictCount: number; historicalHighlightCount: number;
  years: [number, number]; sums: { best: number; low: number; high: number };
  missingCounts: { best: number; low: number; high: number };
  geography: { matched: number; unplaced: number; historicalMatched: number; historicalUnplaced: number };
  files: Record<string, string>;
}
export interface AtlasData {
  nativeRows: NativeRow[]; conflicts: ConflictSummary[]; historicalHighlights: HistoricalHighlight[];
  placementRegistry: PlacementRegistryEntry[]; placements: Placement[]; countryAnchors: CountryAnchor[];
  sources: SourceRecord[]; manifest: DataManifest;
}
export type Layer = 'ucdp' | 'history';
export type Filters = { layer: Layer; from: number; to: number; query: string; sort: string;
  completeness?: 'all' | 'complete' | 'partial' | 'missing' };
