import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { checkPublicFiles, checkGitHistory } from '../scripts/check-public';

const roots: string[] = [];
async function fixture(files: Record<string, string>) {
  const root = await mkdtemp(join(tmpdir(), 'atlas-public-'));
  roots.push(root);
  for (const [path, body] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), body);
  }
  return root;
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('release boundary', () => {
  it('accepts only the declared application and production artifact tree', async () => {
    const root = await fixture({ 'package.json': '{}', 'src/app/main.tsx': 'export {}',
      'public/licenses/ATTRIBUTION.md': 'Public source attribution; restricted COW data is excluded.',
      'dist/assets/index-abc123.js': 'console.log("atlas")', 'dist/ru/index.html': '<html lang="ru"></html>' });
    expect(await checkPublicFiles(root)).toEqual([]);
  });

  it('runs validation from the real CLI entry and reports the checked source', () => {
    const result = execFileSync(process.execPath, ['--import', 'tsx', 'scripts/check-public.ts'], { encoding: 'utf8' });
    expect(result).toContain('PASS: 1650 unique native rows, 202 conflicts');
  });

  it('allows the declared pixel shell and still checks pixel source and build output', async () => {
    const root = await fixture({
      'ru/index.html': '<html lang="ru"></html>',
      'src/app/main.tsx': '-----BEGIN ' + 'PRIVATE KEY-----',
      '.env': 'fixture',
      'node_modules/dependency/package.json': '{}',
      'dist/en/index.html': '<html lang="en"></html>',
      'dist/assets/main-abc123.js': 'export {}',
      'dist/assets/main-abc123.js.map': '{}',
    });
    expect((await checkPublicFiles(root)).sort()).toEqual([
      'Secret material: src/app/main.tsx',
      'Unapproved release file: .env',
      'Unapproved release file: dist/assets/main-abc123.js.map',
    ]);
  });

  it('accepts declared hashed sprite outputs and keeps raw references outside dist', async () => {
    const root = await fixture({
      'reference/battle-preview/manifest.json': '{}',
      'src/map/map-flag.ts': 'export {}',
      'src/resources/assets/battle-topdown-japan-terrain.webp': 'fixture',
      'dist/assets/battle-topdown-infantry-abc123.png': 'fixture',
      'dist/assets/battle-topdown-japan-terrain-abc123.webp': 'fixture',
      'dist/assets/battle-topdown-japan-terrain-abc123.png': 'fixture',
      'dist/assets/extra-abc123.png': 'fixture',
      'dist/reference/battle-preview/manifest.json': '{}',
    });
    expect((await checkPublicFiles(root)).sort()).toEqual([
      'Unapproved release file: dist/assets/battle-topdown-japan-terrain-abc123.png',
      'Unapproved release file: dist/assets/extra-abc123.png',
      'Unapproved release file: dist/reference/battle-preview/manifest.json',
    ]);
  });

  it.each(['.env', 'src/.env.local', 'data/' + ['cow', 'source', 'war', 'ledger.csv'].join('_'), 'full_' + 'research/source.csv',
    'src/data/extra.json', 'src/entry-client.tsx', 'pixel/src/app/main.tsx', 'dist/client/index.html', 'dist/server/index.js'])
  ('rejects unexpected or sensitive packaged path %s', async path => {
    const root = await fixture({ [path]: 'fixture' });
    expect((await checkPublicFiles(root)).join('\n')).toContain(path);
  });

  it('rejects private keys and restricted table payloads hidden in approved assets', async () => {
    const root = await fixture({
      'dist/assets/index-abc123.js': ['War', 'Num'].join('') + ',WarName,StartYear\n1,example,1900',
      'src/app/main.tsx': '-----BEGIN ' + 'PRIVATE KEY-----\nfixture\n-----END PRIVATE KEY-----',
    });
    const errors = (await checkPublicFiles(root)).join('\n');
    expect(errors).toContain('Restricted payload: dist/assets/index-abc123.js');
    expect(errors).toContain('Secret material: src/app/main.tsx');
  });

  it('audits removed files in the release history and excludes unrelated branches', async () => {
    const root = await fixture({ 'package.json': '{}' });
    const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' });
    git('init', '-q'); git('config', 'user.name', 'Atlas fixture'); git('config', 'user.email', 'fixture@example.invalid');
    git('add', 'package.json'); git('commit', '-qm', 'safe');
    expect(await checkGitHistory(root)).toEqual([]);
    git('switch', '-qc', 'research');
    await writeFile(join(root, '.env'), 'FIXTURE=not-a-secret');
    git('add', '.env'); git('commit', '-qm', 'forbidden fixture');
    git('switch', '-q', '-');
    expect(await checkGitHistory(root)).toEqual([]);
    git('merge', '--ff-only', 'research');
    git('rm', '-q', '.env'); git('commit', '-qm', 'remove fixture');
    expect((await checkGitHistory(root)).join('\n')).toContain('.env');
  });
});
