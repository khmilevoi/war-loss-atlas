import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAtlasData, validatePublicData } from '../src/data/index';
import { parseNativeCsv, sha256, SOURCE_SHA } from './import-data';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const data = loadAtlasData();
const errors = validatePublicData(data);
for (const [path, hash] of Object.entries(data.manifest.files)) {
  if (sha256(readFileSync(resolve(root, path))) !== hash) errors.push(`Hash mismatch: ${path}`);
}
const csv = readFileSync(resolve(root, 'data/ucdp-conflict-year.csv'));
if (sha256(csv) !== SOURCE_SHA) errors.push('Non-allowlisted native CSV');
if (JSON.stringify(parseNativeCsv(csv)) !== JSON.stringify(data.nativeRows)) errors.push('Generated rows differ from native source');
for (const [file, values] of [['historical', data.historicalHighlights], ['placements', data.placementRegistry],
  ['country-anchors', data.countryAnchors], ['sources', data.sources]] as const) {
  if (JSON.stringify(JSON.parse(readFileSync(resolve(root, `src/data/${file}.json`), 'utf8'))) !== JSON.stringify(values)) errors.push(`Generated ${file} differs from registry`);
}
if (JSON.stringify(JSON.parse(readFileSync(resolve(root, 'data/manifest.json'), 'utf8'))) !== JSON.stringify(data.manifest)) errors.push('Manifest differs from generated data');
// Enumerated public data boundary. Release checking can extend this to built files and repository history.
const permitted = new Set(['data/manifest.json', 'data/ucdp-conflict-year.csv', 'data/geography/ne_110m_admin_0_countries.geojson',
  'public/geo/ne_110m_land.geojson', 'public/licenses/ATTRIBUTION.md', 'public/licenses/CC-BY-4.0.txt',
  'public/licenses/NATURAL-EARTH.txt', 'public/licenses/HISTORICAL-FACTS.md']);
function visit(path: string) {
  for (const e of readdirSync(resolve(root, path), { withFileTypes: true })) {
    const name = `${path}/${e.name}`;
    if (e.isDirectory()) visit(name);
    else if (!permitted.has(name)) errors.push(`Unapproved public data file ${name}`);
  }
}
visit('data'); visit('public');
if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
else console.log(`PASS: ${data.nativeRows.length} unique native rows, ${data.conflicts.length} conflicts; best/low/high 2566047/2410880/3330850; 4 historical facts; ${data.manifest.geography.matched} anchors + ${data.manifest.geography.unplaced} unplaced; source SHA256 ${SOURCE_SHA}`);
