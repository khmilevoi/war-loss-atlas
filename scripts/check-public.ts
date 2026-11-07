import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadAtlasData, validatePublicData } from '../src/data/index';
import { parseNativeCsv, sha256, SOURCE_SHA } from './import-data';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicFiles = new Set(['data/manifest.json', 'data/ucdp-conflict-year.csv', 'data/geography/ne_110m_admin_0_countries.geojson',
  'public/geo/ne_110m_land.geojson', 'public/licenses/ATTRIBUTION.md', 'public/licenses/CC-BY-4.0.txt',
  'public/licenses/NATURAL-EARTH.txt', 'public/licenses/HISTORICAL-FACTS.md']);
const sourceFiles = new Set(['src/data/generated/atlas.json', 'src/data/historical.json', 'src/data/placements.json',
  'src/data/country-anchors.json', 'src/data/sources.json']);
const rootFiles = new Set(['.gitattributes', '.gitignore', 'rpi.toml',
  'README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vitest.config.ts',
  'rpi.pixel.toml', 'docker-compose.pixel.yml', 'Dockerfile', 'Dockerfile.dockerignore', 'nginx.conf',
  'playwright.config.ts', 'vite.config.ts']);
const dataToolFiles = new Set(['scripts/check-public.ts', 'scripts/import-data.ts', 'tests/data.test.ts', 'tests/public.test.ts',
  'src/data/aggregate.ts', 'src/data/index.ts', 'src/data/placement-adapter.ts', 'src/data/types.ts', 'src/data/validate.ts']);
const legacyGitFiles = new Set(['.dockerignore', 'docker-compose.yml', 'index.html',
  'scripts/check-server.mjs', 'scripts/check-dev.ts']);
const docsFiles = new Set(['docs/verification.md', 'docs/data-audit.md', 'docs/deployment.md']);
// This reproducible starter includes only UCDP OSV data shared under CC BY 4.0.
const starterFiles = new Set([
  'starter/.gitattributes', 'starter/.gitignore', 'starter/README.md', 'starter/annual_by_actor_type.sql',
  'starter/data/OneSided_v26_1.csv', 'starter/expected/ANNUAL_BY_ACTOR_TYPE.csv',
  'starter/osv.py', 'starter/sources.csv', 'starter/test_osv.py',
]);
const researchFiles = new Set([
  'data/ucdp-v26.1/NonState_v26_1.csv', 'research/README.md', 'research/sources.csv',
  'research/results/osv-annual-totals.csv', 'docs/repository-layout.md',
]);
const localOnly = new Set(['.git', 'node_modules', '.superpowers', 'coverage', 'playwright-report', 'test-results']);
const starterLocalDirectories = new Set(['starter/work', 'starter/__pycache__']);
const appFiles = new Set([
  'ru/index.html', 'en/index.html',
  'src/app/main.tsx', 'src/app/styles.css', 'tests/static.test.ts', 'tests/browser/static.spec.ts',
  'src/app/atlas-view.tsx', 'src/catalog/index.ts', 'tests/catalog.test.ts',
  'src/map/land.ts', 'src/map/world-map.tsx', 'src/map/map-flag.ts', 'src/map/map.css', 'tests/map.test.ts',
  'src/card/war-dialog.tsx', 'src/card/card.css', 'src/i18n/atlas-copy.ts',
  'src/content/build.ts', 'src/content/compiled.d.ts',
  'src/content/generate-ucdp.ts', 'src/content/index.ts', 'src/content/parse.ts',
  'src/content/ucdp-names-ru.ts', 'src/content/historical-en.md', 'src/content/historical-ru.md',
  'src/content/ucdp-en.md', 'src/content/ucdp-ru.md', 'tests/content.test.ts',
  'tests/browser/map-card.spec.ts', 'src/catalog/ww1-episodes.ts', 'src/catalog/ww2-episodes.ts',
  'src/card/scene-slot.tsx',
  'src/simulation/battle.ts', 'src/simulation/roster.ts', 'src/simulation/render-canvas.ts',
  'src/simulation/mount-scene.ts', 'src/resources/sprite-assets.ts', 'src/audio/scene-audio.ts',
  'src/simulation/landscape.ts', 'src/simulation/render-actions.ts', 'tests/action-playback.test.ts',
  'src/simulation/scene-config.ts', 'tests/scene-config.test.ts',
  'src/ui/pixel-icon.tsx', 'src/ui/pixel-icon.css',
  'src/simulation/unit-calibration.ts', 'tests/unit-calibration.test.ts', 'tests/scene-assets.test.ts',
  'src/audio/interface-audio.ts', 'scripts/build-scene-sprites.py', 'scripts/prepare-generated-sprites.py',
  'src/resources/assets/scene-sprites.json',
  'src/resources/assets/battle-topdown-cold-war-units.webp', 'src/resources/assets/battle-topdown-contemporary-units.webp',
  'src/resources/assets/battle-topdown-equipment-wrecks.webp', 'src/resources/assets/battle-topdown-infantry.webp',
  'src/resources/assets/battle-topdown-generic-terrain.webp', 'src/resources/assets/battle-topdown-japan-terrain.webp',
  'src/resources/assets/battle-topdown-nuke.webp', 'src/resources/assets/battle-topdown-roads.webp',
  'src/resources/assets/battle-topdown-tank-crew.webp', 'src/resources/assets/battle-topdown-terrain.webp',
  'src/resources/assets/battle-topdown-hiroshima-city.webp',
  'src/resources/assets/battle-topdown-japan-civilians.webp',
  'src/resources/assets/battle-topdown-japan-surfaces.webp',
  'src/resources/assets/battle-topdown-korea-units.webp',
  'src/resources/assets/battle-topdown-nagasaki-city.webp',
  'src/resources/assets/battle-topdown-vehicles.png',
  'tests/simulation-battle.test.ts', 'tests/scene-audio.test.ts', 'tests/browser/scene-lifecycle.spec.ts',
]);
const battleReferenceFiles = new Set([
  'README.md', 'manifest.json', 'atlas-battle-audio.js', 'atlas-grounded-component.js',
  'atlas-grounded-preview.mjs', 'atlas-grounded-theme.css', 'atlas-pixel-drip.webp', 'atlas-press-start-OFL.txt',
  'atlas-unit-roster.mjs', 'battle-engine.js', 'battle-topdown-equipment-wrecks.png',
  'battle-topdown-infantry.png', 'battle-topdown-nuke.png', 'battle-topdown-roads.png',
  'battle-topdown-tank-crew.png', 'battle-topdown-terrain.png', 'battle-topdown-vehicles.png',
].map(name => `reference/battle-preview/${name}`));
const generatedReferenceFiles = new Set([
  'README.md', 'battle-topdown-cold-war-units.png',
  'battle-topdown-contemporary-units.png', 'battle-topdown-generic-terrain.png',
  'battle-topdown-hiroshima-city.png', 'battle-topdown-japan-civilians.png',
  'battle-topdown-japan-surfaces.png', 'battle-topdown-japan-terrain.png',
  'battle-topdown-korea-units.png', 'battle-topdown-nagasaki-city.png',
  'legacy-pose-template.png', 'originals/cold-war-units-overhead.png',
  'originals/cold-war-units.png', 'originals/contemporary-units-overhead.png',
  'originals/contemporary-units.png', 'originals/generic-terrain.png',
  'originals/hiroshima-city-overhead-polished.png', 'originals/hiroshima-city-overhead.png',
  'originals/japan-civilians-overhead-polished.png', 'originals/japan-civilians-overhead.png',
  'originals/japan-surfaces-overhead.png', 'originals/japan-terrain-overhead.png',
  'originals/japan-terrain.png', 'originals/korea-units-overhead.png',
  'originals/nagasaki-city-overhead-polished.png', 'originals/nagasaki-city-overhead.png',
].map(name => 'reference/generated-sprites/' + name));
const battleSprites = /^dist\/assets\/battle-topdown-(?:equipment-wrecks|infantry|nuke|roads|tank-crew|terrain|vehicles)-[\w-]+\.(?:png|webp)$/;
const generatedBattleSprites = /^dist\/assets\/battle-topdown-(?:cold-war-units|contemporary-units|generic-terrain|japan-terrain|hiroshima-city|japan-civilians|japan-surfaces|korea-units|nagasaki-city)-[\w-]+\.webp$/;

function allowedPath(path: string, built = true): boolean {
  // Old release commits kept the application in a nested package.
  const sourcePath = !built && path.startsWith('pixel/') ? path.slice('pixel/'.length) : path;
  if (rootFiles.has(sourcePath) || publicFiles.has(path) || sourceFiles.has(path) || dataToolFiles.has(path) || docsFiles.has(path)) return true;
  if (starterFiles.has(path) || researchFiles.has(path)) return true;
  if (appFiles.has(sourcePath) || battleReferenceFiles.has(sourcePath) || generatedReferenceFiles.has(sourcePath)) return true;
  if (!built) return legacyGitFiles.has(path)
    || /^(?:src|server)\/(?:[\w-]+\/)*[\w-]+\.(?:ts|tsx|css)$/.test(path)
    || /^tests\/(?:[\w-]+\/)*[\w.-]+\.(?:ts|js)$/.test(path);
  if (/^dist\/(?:ru|en)\/index\.html$/.test(path)) return true;
  if (/^dist\/assets\/[\w-]+-[\w-]+\.(?:js|css)$/.test(path)) return true;
  return battleSprites.test(path) || generatedBattleSprites.test(path);
}

// These are payload/key signatures, not a ban on explanatory mentions in documentation.
function inspect(path: string, body: string, built = true): string[] {
  const errors: string[] = [];
  if (!allowedPath(path, built)) errors.push(`Unapproved release file: ${path}`);
  if (/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{40,255}|sk-proj-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16})\b/.test(body)) errors.push(`Secret material: ${path}`);
  if (/cow[_-]source[_-]war[_-]ledger|numeric[_-]COW24|(?:Inter|Intra)[-_ ]StateWarData|["']?WarNum["']?\s*[,\t:]|full[_-]research[/\\]/i.test(body)) errors.push(`Restricted payload: ${path}`);
  return errors;
}

/** Audit a packaged tree or the Git checkout's shared files, including any built output. */
export async function checkPublicFiles(target: string): Promise<string[]> {
  let worktree: ReturnType<typeof gitWorktreePaths>;
  try { worktree = gitWorktreePaths(target); }
  catch { return ['Git worktree audit failed (not the repository root or unreadable paths)']; }

  const errors: string[] = [];
  function visit(directory = '') {
    for (const entry of readdirSync(resolve(target, directory), { withFileTypes: true })) {
      const path = directory ? `${directory}/${entry.name}` : entry.name;
      const worktreeKey = gitWorktreePathKey(path);
      if (worktree) {
        const builtOutput = worktreeKey === 'dist' || worktreeKey.startsWith('dist/');
        if (!builtOutput && !worktree.files.has(worktreeKey) && !worktree.directories.has(worktreeKey)) continue;
      } else {
        if (!directory && localOnly.has(entry.name)) continue;
        if (entry.isDirectory() && starterLocalDirectories.has(path)) continue;
      }
      if (entry.isSymbolicLink()) errors.push(`Symlink in release tree: ${path}`);
      else if (entry.isDirectory() && worktree?.files.has(worktreeKey)) errors.push(`Non-file release entry: ${path}`);
      else if (entry.isDirectory()) visit(path);
      else errors.push(...inspect(path, readFileSync(resolve(target, path), 'utf8')));
    }
  }
  visit();
  return errors;
}

const git = (target: string, args: string[]) => execFileSync('git', ['-C', target, ...args], { maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] });
const gitWorktreePathKey = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;

function gitWorktreePaths(target: string) {
  if (!existsSync(resolve(target, '.git'))) return undefined;
  const top = git(target, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
  if (resolve(top).toLowerCase() !== resolve(target).toLowerCase()) throw new Error('Expected the Git root');

  const entries = git(target, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).toString('utf8').split('\0');
  const files = new Set(entries.filter(Boolean).map(path => gitWorktreePathKey(path.replace(/\/$/, ''))));
  const directories = new Set<string>();
  for (const file of files) {
    let slash = file.lastIndexOf('/');
    while (slash !== -1) {
      const directory = file.slice(0, slash);
      if (directories.has(directory)) break;
      directories.add(directory);
      slash = directory.lastIndexOf('/');
    }
  }
  return { files, directories };
}

function inspectGitEntries(target: string, entries: string[], label: string): string[] {
  const errors: string[] = [];
  const checked = new Set<string>();
  for (const entry of entries) {
    if (!entry) continue;
    const match = /^(\d+) (?:blob |commit )?([a-f0-9]+)(?: \d)?\t(.+)$/.exec(entry);
    if (!match) { errors.push(`Unreadable ${label} entry`); continue; }
    const [, mode, hash, path] = match;
    if (checked.has(`${hash}:${path}`)) continue;
    checked.add(`${hash}:${path}`);
    if (mode !== '100644' && mode !== '100755') { errors.push(`Non-file ${label}: ${path}`); continue; }
    errors.push(...inspect(path, git(target, ['cat-file', 'blob', hash]).toString('utf8'), false).map(error => `${label}: ${error}`));
  }
  return errors;
}

/** Scan every file version in the history being released, including deleted files. */
export async function checkGitHistory(target: string): Promise<string[]> {
  try {
    const top = git(target, ['rev-parse', '--show-toplevel']).toString('utf8').trim();
    if (resolve(top).toLowerCase() !== resolve(target).toLowerCase()) return ['Refusing to audit a parent repository'];
    const commits = git(target, ['rev-list', 'HEAD']).toString('utf8').trim().split(/\s+/).filter(Boolean);
    return inspectGitEntries(target, commits.flatMap(commit => git(target, ['ls-tree', '-rz', '--full-tree', commit]).toString('utf8').split('\0')), 'Git history');
  } catch { return ['Git history audit failed (no repository or unreadable objects)']; }
}

export async function checkGitIndex(target: string): Promise<string[]> {
  try { return inspectGitEntries(target, git(target, ['ls-files', '--stage', '-z']).toString('utf8').split('\0'), 'Git index'); }
  catch { return ['Git index audit failed']; }
}

export async function runPublicCheck(): Promise<void> {
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
  errors.push(...await checkPublicFiles(root));
  if (process.argv.includes('--git')) errors.push(...await checkGitHistory(root), ...await checkGitIndex(root));
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  else console.log(`PASS: ${data.nativeRows.length} unique native rows, ${data.conflicts.length} conflicts; best/low/high 2566047/2410880/3330850; 4 historical facts; ${data.manifest.geography.matched} anchors + ${data.manifest.geography.unplaced} unplaced; source SHA256 ${SOURCE_SHA}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await runPublicCheck();
