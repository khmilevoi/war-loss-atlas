import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { NATIVE_FIELDS, type AtlasData, type NativeRow, type CountryAnchor, type PlacementRegistryEntry,
  type HistoricalHighlight, type SourceRecord } from '../src/data/types';
import { aggregateConflicts } from '../src/data/aggregate';
import { validatePublicData } from '../src/data/validate';
import { buildPlacements } from '../src/data/placement-adapter';

export const SOURCE_SHA = 'b34ecb57f1fc0e73d4bfd7b080212da429af3135a8d360b1c902e45506f81147';
const GEO_COMMIT = 'ca96624a56bd078437bca8184e78163e5039ad19';
const GEO_URL = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${GEO_COMMIT}/geojson/`;
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sha256 = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const loadJson = <T>(path: string): T => JSON.parse(readFileSync(resolve(ROOT, path), 'utf8')) as T;
const saveJson = (path: string, data: unknown) => {
  mkdirSync(dirname(resolve(ROOT, path)), { recursive: true });
  writeFileSync(resolve(ROOT, path), JSON.stringify(data, null, 2) + '\n');
};

export function parseNativeCsv(csv: string | Buffer): NativeRow[] {
  const records = parse<Record<string, string>>(csv, { bom: true, columns: (header: string[]) => {
    if (header.join() !== NATIVE_FIELDS.join()) throw new Error('Unexpected native header');
    return header;
  }, skip_empty_lines: true });
  return records.map(record => Object.fromEntries(NATIVE_FIELDS.map(key => {
    const raw = record[key];
    if (key === 'year' || key === 'bd_best' || key === 'bd_low' || key === 'bd_high') {
      if (raw === '' && key !== 'year') return [key, null];
      if (!/^\d+$/.test(raw)) throw new Error(`Invalid numeric ${key}: ${raw}`);
      return [key, Number(raw)];
    }
    if ((key === 'conflict_id' || key === 'dyad_id') && raw === '') throw new Error(`Missing identifier ${key}`);
    return [key, raw === '' ? null : raw];
  })) as NativeRow);
}

export function importData(sourcePath?: string): AtlasData {
  const rawPath = resolve(ROOT, 'data/ucdp-conflict-year.csv');
  const input = resolve(sourcePath ?? rawPath);
  const bytes = readFileSync(input);
  if (sha256(bytes) !== SOURCE_SHA) throw new Error('Source SHA256 differs from allowlisted UCDP 26.1 conflict-year file');
  if (input !== rawPath) { mkdirSync(dirname(rawPath), { recursive: true }); copyFileSync(input, rawPath); }
  const nativeRows = parseNativeCsv(bytes);
  const historicalHighlights = loadJson<HistoricalHighlight[]>('src/data/historical.json');
  const sources = loadJson<SourceRecord[]>('src/data/sources.json');
  const geoPath = 'data/geography/ne_110m_admin_0_countries.geojson';
  const geoBytes = readFileSync(resolve(ROOT, geoPath));
  if (sha256(geoBytes) !== '6866c877d39cba9c357620878839b336d569f8c662d3cfab4cb1dbe2d39c977f') throw new Error('Country source hash mismatch');
  const landPath = 'public/geo/ne_110m_land.geojson';
  if (sha256(readFileSync(resolve(ROOT, landPath))) !== '9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9') throw new Error('Land source hash mismatch');
  const geo = JSON.parse(geoBytes.toString()) as { features: { properties: Record<string, unknown> }[] };
  // Exact current names only. Historical/disputed correspondences are deliberately not silently normalized.
  const excluded = new Set(['Israel', 'China', 'Morocco', 'Ukraine']);
  const candidates = new Set([...nativeRows.flatMap(row => (row.battle_location ?? '').split(',').map(s => s.trim())),
    'France', 'Germany', 'United States of America', 'South Korea']);
  const countryAnchors: CountryAnchor[] = [];
  for (const { properties: p } of geo.features) {
    const aliases = [...new Set(['ADMIN', 'NAME', 'NAME_LONG', 'NAME_EN'].map(k => String(p[k])))].filter(alias =>
      candidates.has(alias) && !alias.includes('(') && !excluded.has(alias));
    if (!aliases.length) continue;
    countryAnchors.push({ key: String(p.ADM0_A3), aliases: aliases.sort(), display_name: String(p.NAME_RU || p.NAME_EN),
      latitude: Math.round(Number(p.LABEL_Y) * 2) / 2, longitude: Math.round(Number(p.LABEL_X) * 2) / 2,
      source_url: GEO_URL + 'ne_110m_admin_0_countries.geojson',
      coordinate_method: 'Natural Earth LABEL_Y/LABEL_X, rounded to nearest 0.5 degree; illustrative representative label point, not casualty location', version: GEO_COMMIT });
  }
  countryAnchors.sort((a, b) => a.key.localeCompare(b.key));
  const conflicts = [...aggregateConflicts(nativeRows)];
  const placementRegistry: PlacementRegistryEntry[] = conflicts.map(c => {
    const location_labels_raw = [...new Set(nativeRows.filter(r => r.conflict_id === c.id).map(r => r.battle_location ?? ''))].sort();
    const labels = [...new Set(location_labels_raw.flatMap(s => s.split(',').map(s => s.trim())))];
    const matches = labels.length === 1 ? countryAnchors.filter(a => a.aliases.includes(labels[0])) : [];
    const anchor = matches.length === 1 ? matches[0] : null;
    return { conflict_id: c.id, anchor_id: anchor?.key ?? null, latitude: anchor?.latitude ?? null,
      longitude: anchor?.longitude ?? null, status: anchor ? 'country_anchor' : 'unplaced',
      basis: anchor ? 'Single exact battle_location label matched frozen Natural Earth alias; no frequency, actor, dyad or casualty weighting' :
        'Multiple, historical, disputed or unmatched labels: no reviewed theater anchor; no automatic first-country choice',
      location_labels_raw, selected_country_or_theater: anchor?.aliases.find(a => a === labels[0]) ?? null,
      source_url: anchor?.source_url ?? 'https://ucdp.uu.se/downloads/brd/ucdp-brd-codebook-261.pdf', reviewed_on: '2026-10-22',
      note_ru: anchor ? 'Условная метка для навигации; число относится к конфликту целиком, не к стране и не к точке.' :
        'Без условной метки: требуется отдельная проверка театра. Исходные названия сохранены; неизвестное не заменено координатой (0,0).' };
  });
  const historicalChoices: Record<string, { alias: string; label: string; note: string; geographySource: string }> = {
    ww1: { alias: 'France', label: 'Западная Европа — условная метка мировой войны',
      geographySource: 'https://www.nam.ac.uk/schools/learning-resources/commonwealth-soldiers-western-front',
      note: 'Авторский выбор страновой точки подписи Франции как символического ориентира западноевропейского театра, не координаты Западного фронта. Война охватывала и другие театры; общая оценка не относится к Франции или этой точке.' },
    ww2: { alias: 'Germany', label: 'Центральная Европа — условная метка мировой войны',
      geographySource: 'https://www.nam.ac.uk/explore/second-world-war',
      note: 'Авторский выбор Германии как навигационного ориентира европейского театра. Война мировая, включая Азию, Тихий океан и другие театры; общая оценка не относится к Европе или этой точке.' },
    'us-civil': { alias: 'United States of America', label: 'США — условная страновая метка',
      geographySource: 'https://www.nps.gov/civilwar/overview.htm',
      note: 'Условная репрезентативная точка США из Natural Earth, не центр театра боёв и не место гибели людей; источниковое число относится ко всей войне.' },
    korea: { alias: 'South Korea', label: 'Корейский полуостров — условная метка',
      geographySource: 'https://www.nam.ac.uk/explore/korean-war',
      note: 'Авторский выбор страновой точки подписи Южной Кореи как символического ориентира, не центра полуострова. Число относится к гражданским обеих Корей, а не к Южной Корее или этой точке.' }
  };
  for (const h of historicalHighlights) {
    const choice = historicalChoices[h.highlight_id];
    const anchor = countryAnchors.find(a => a.aliases.includes(choice.alias));
    if (!anchor) throw new Error(`Missing reviewed historical proxy ${h.highlight_id}`);
    placementRegistry.push({ highlight_id: h.highlight_id, anchor_id: anchor.key,
      latitude: anchor.latitude, longitude: anchor.longitude, status: 'theater_anchor',
      basis: `Author-reviewed symbolic navigation proxy: ${choice.alias}; frozen Natural Earth representative label point rounded0.5deg; geography reference ${choice.geographySource}; no spatial mortality analysis`,
      location_labels_raw: [choice.alias], selected_country_or_theater: choice.label,
      source_url: anchor.source_url, reviewed_on: '2026-10-22', note_ru: choice.note });
  }
  const placements = buildPlacements(placementRegistry);
  const sums = { best: 0, low: 0, high: 0 };
  const missingCounts = { best: 0, low: 0, high: 0 };
  for (const c of conflicts) for (const k of ['best', 'low', 'high'] as const) {
    sums[k] += c[k] ?? 0; missingCounts[k] += c.missingCounts[k];
  }
  const data: AtlasData = { nativeRows, conflicts, historicalHighlights, placementRegistry, placements, countryAnchors, sources,
    manifest: { schemaVersion: 1, source: { path: 'data/ucdp-conflict-year.csv', sha256: SOURCE_SHA,
      source_url: 'https://ucdp.uu.se/downloads/brd/ucdp-brd-conf-261-csv.zip', version: '26.1' }, nativeRowCount: nativeRows.length,
      conflictCount: conflicts.length, historicalHighlightCount: historicalHighlights.length,
      years: [Math.min(...nativeRows.map(r => r.year)), Math.max(...nativeRows.map(r => r.year))], sums, missingCounts,
      geography: { matched: placementRegistry.filter(p => 'conflict_id' in p && p.status !== 'unplaced').length,
        unplaced: placementRegistry.filter(p => 'conflict_id' in p && p.status === 'unplaced').length,
        historicalMatched: 4, historicalUnplaced: 0 }, files: {} } };
  const errors = validatePublicData(data);
  if (errors.length) throw new Error(errors.join('\n'));
  saveJson('src/data/country-anchors.json', countryAnchors);
  saveJson('src/data/placements.json', placementRegistry);
  for (const path of ['data/ucdp-conflict-year.csv', geoPath, landPath, 'src/data/historical.json', 'src/data/sources.json',
    'src/data/country-anchors.json', 'src/data/placements.json']) data.manifest.files[path] = sha256(readFileSync(resolve(ROOT, path)));
  saveJson('src/data/generated/atlas.json', data);
  saveJson('data/manifest.json', data.manifest);
  return data;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = importData(process.argv[2]);
  console.log(JSON.stringify(data.manifest, null, 2));
}
