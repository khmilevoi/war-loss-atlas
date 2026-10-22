import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadAtlasData, aggregateConflicts, validatePublicData } from '../src/data/index';
import { parseNativeCsv } from '../scripts/import-data';
import { NATIVE_FIELDS, type AtlasData, type NativeRow } from '../src/data/types';

describe('public source boundary', () => {
  it('preserves the full native source once, including all 25 fields and original bytes', () => {
    const data = loadAtlasData();
    expect(data.nativeRows).toHaveLength(1650);
    expect(new Set(data.nativeRows.map(r => `${r.conflict_id}:${r.year}`)).size).toBe(1650);
    expect(new Set(data.nativeRows.map(r => r.conflict_id)).size).toBe(202);
    expect(Math.min(...data.nativeRows.map(r => r.year))).toBe(1989);
    expect(Math.max(...data.nativeRows.map(r => r.year))).toBe(2025);
    expect(Object.keys(data.nativeRows[0]).sort()).toEqual([...NATIVE_FIELDS].sort());
    expect(NATIVE_FIELDS).toHaveLength(25);
    for (const row of data.nativeRows) {
      expect(Object.keys(row)).toHaveLength(25);
      expect(typeof row.conflict_id).toBe('string');
      expect(typeof row.dyad_id).toBe('string');
    }
    expect(data.nativeRows.reduce((n, r) => n + (r.bd_best ?? 0), 0)).toBe(2566047);
    expect(data.nativeRows.reduce((n, r) => n + (r.bd_low ?? 0), 0)).toBe(2410880);
    expect(data.nativeRows.reduce((n, r) => n + (r.bd_high ?? 0), 0)).toBe(3330850);
    expect(createHash('sha256').update(readFileSync('data/ucdp-conflict-year.csv')).digest('hex'))
      .toBe('b34ecb57f1fc0e73d4bfd7b080212da429af3135a8d360b1c902e45506f81147');
    expect(validatePublicData(data)).toEqual([]);
  });

  it('keeps null distinct from zero, preserves dyad lists and refuses duplicate source rows', () => {
    const fixture = { ...loadAtlasData().nativeRows[0], conflict_id: 'fixture', year: 1989,
      dyad_id: '1, 2', bd_best: null, bd_low: 0, bd_high: 8 } satisfies NativeRow;
    const csv = NATIVE_FIELDS.join(',') + '\n' + NATIVE_FIELDS.map(k => {
      const value = fixture[k] === null ? '' : String(fixture[k]);
      return '"' + value.replaceAll('"', '""') + '"';
    }).join(',') + '\n';
    const rows = parseNativeCsv(csv);
    expect(rows[0].dyad_id).toBe('1, 2');
    expect(rows[0].bd_best).toBeNull();
    expect(aggregateConflicts(rows)[0]).toMatchObject({ best: null, low: 0, high: 8,
      missingCounts: { best: 1, low: 0, high: 0 }, rowIds: ['fixture:1989'] });
    const next = { ...rows[0], year: 2025, bd_best: 7, bd_high: null };
    expect(aggregateConflicts([...rows, next])[0]).toMatchObject({ best: 7, low: 0, high: 8,
      firstObservedYear: 1989, lastObservedYear: 2025, missingCounts: { best: 1, low: 0, high: 1 } });
    expect(() => aggregateConflicts([...rows, ...rows])).toThrow(/duplicate/i);
    expect(() => parseNativeCsv(csv.replace(',year,', ',wrong_field,'))).toThrow(/header/i);
  });

  it('never multiplies deaths by placements and retains every unknown geography', () => {
    const data = loadAtlasData();
    const before = aggregateConflicts(data.nativeRows);
    const expanded = { ...data, placements: [...data.placements, { ...data.placements[0], placement_id: 'extra' }] };
    expect(aggregateConflicts(expanded.nativeRows)).toEqual(before);
    expect(data.placementRegistry.filter(p => 'conflict_id' in p)).toHaveLength(202);
    expect(data.placementRegistry.filter(p => 'highlight_id' in p)).toHaveLength(4);
    const multi = data.placementRegistry.find(p => 'conflict_id' in p && p.conflict_id === '11345');
    expect(multi).toMatchObject({ status: 'unplaced', latitude: null, longitude: null });
    expect(data.placementRegistry.filter(p => p.status === 'unplaced').length).toBeGreaterThan(0);
    expect(before.reduce((n, c) => n + (c.best ?? 0), 0)).toBe(2566047);
  });

  it('keeps four source-specific historical claims separate and preserves estimate semantics', () => {
    const history = loadAtlasData().historicalHighlights;
    expect(history.map(h => h.highlight_id)).toEqual(['ww1', 'ww2', 'us-civil', 'korea']);
    expect(history.map(({ highlight_id, start_year, end_year, metric, estimate_kind, value, low, high, lower_exclusive }) =>
      ({ highlight_id, start_year, end_year, metric, estimate_kind, value, low, high, lower_exclusive }))).toEqual([
      { highlight_id: 'ww1', start_year: 1914, end_year: 1918, metric: 'total_war_deaths', estimate_kind: 'approximate',
        value: 16000000, low: null, high: null, lower_exclusive: false },
      { highlight_id: 'ww2', start_year: 1939, end_year: 1945, metric: 'total_war_deaths', estimate_kind: 'lower_statement',
        value: null, low: 65000000, high: null, lower_exclusive: true },
      { highlight_id: 'us-civil', start_year: 1861, end_year: 1865, metric: 'war_deaths_source_definition', estimate_kind: 'lower_statement',
        value: null, low: 750000, high: null, lower_exclusive: false },
      { highlight_id: 'korea', start_year: 1950, end_year: 1953, metric: 'civilian_war_deaths', estimate_kind: 'approximate',
        value: 2000000, low: null, high: null, lower_exclusive: false },
    ]);
    expect(history.find(h => h.highlight_id === 'ww1')).toMatchObject({ value: 16000000, low: null,
      high: null, estimate_kind: 'approximate' });
    expect(history.find(h => h.highlight_id === 'ww2')).toMatchObject({ value: null, low: 65000000,
      high: null, lower_exclusive: true, estimate_kind: 'lower_statement' });
    expect(history.find(h => h.highlight_id === 'us-civil')).toMatchObject({ value: null, low: 750000,
      high: null, lower_exclusive: false });
    expect(history.find(h => h.highlight_id === 'korea')).toMatchObject({ value: 2000000, low: null,
      high: null, metric: 'civilian_war_deaths', estimate_kind: 'approximate' });
    for (const h of history) {
      expect(h.source_url).toMatch(/^https:\/\//);
      expect(h.uncertainty_ru.length).toBeGreaterThan(30);
    }
  });

  it('rejects corrupted runtime estimates, geography and unapproved native fields', () => {
    const data = structuredClone(loadAtlasData());
    data.nativeRows[0].bd_best = -1;
    data.nativeRows[1].bd_high = Number.NaN;
    (data.nativeRows[2] as unknown as Record<string, unknown>).unapproved = 'bad';
    data.placementRegistry[0].latitude = 100;
    expect(validatePublicData(data).length).toBeGreaterThanOrEqual(4);
  });

  it('rejects impossible historical quantities and missing historical provenance', () => {
    const data = structuredClone(loadAtlasData());
    data.historicalHighlights[0].value = Number.NaN;
    data.historicalHighlights[1].source_url = '';
    expect(validatePublicData(data)).toContain('Historical quantity ww1');
    expect(validatePublicData(data)).toContain('Historical provenance ww2');
  });

  const placementCorruptions: [string, (data: AtlasData) => void][] = [
    ['out of range adapter coordinate', d => { d.placements[0].latitude = 100; }],
    ['invented coordinates for unknown location', d => {
      const p = d.placements.find(p => p.precision === 'unknown')!;
      Object.assign(p, { latitude: 0, longitude: 0, precision: 'illustrative_region', review_status: 'reviewed_source_anchor' });
    }],
    ['missing whole rendering layer', d => { d.placements = []; }],
    ['duplicate rendering identity', d => { d.placements.push(structuredClone(d.placements[0])); }],
    ['wrong rendering owner', d => { Object.assign(d.placements[0], { conflict_id: 'nonexistent' }); }],
    ['incorrect source', d => { d.placements[0].source_url = 'https://example.com/unverified'; }],
    ['missing placement basis', d => { d.placements[0].basis = ''; }],
    ['undefined unknown coordinate', d => { Object.assign(d.placements.find(p => p.precision === 'unknown')!, { latitude: undefined }); }],
    ['incorrect precision', d => { d.placements.find(p => p.precision === 'illustrative_region')!.precision = 'unknown'; }],
    ['incorrect review status', d => { d.placements.find(p => p.review_status === 'reviewed_source_anchor')!.review_status = 'unplaced'; }],
    ['broken historical placement reference', d => { d.historicalHighlights[0].placement_ids = ['nonexistent']; }],
    ['historical reference to another owner', d => { d.historicalHighlights[0].placement_ids = ['history:ww2']; }],
  ];
  it.each(placementCorruptions)('rejects %s before rendering/public checking', (_name, mutate) => {
    const data = structuredClone(loadAtlasData());
    mutate(data);
    expect(validatePublicData(data).length).toBeGreaterThan(0);
  });

  it.each([
    ['metric enum', { metric: 'unknown_metric' }],
    ['estimate kind enum', { estimate_kind: 'exact' }],
    ['inverted period', { start_year: 1919, end_year: 1918 }],
    ['fractional year', { start_year: 1914.5 }],
    ['non-boolean exclusivity', { lower_exclusive: 'false' }],
    ['invalid access date', { accessed_on: '2026-02-30' }],
    ['duplicate historical id', { highlight_id: 'ww2' }],
  ])('rejects invalid historical %s', (_name, mutation) => {
    const data = structuredClone(loadAtlasData());
    Object.assign(data.historicalHighlights[0], mutation);
    expect(validatePublicData(data).length).toBeGreaterThan(0);
  });

  it('makes the public CLI reject an adapter-only corrupted generated payload', () => {
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval',
      "import { loadAtlasData } from './src/data/index.ts'; loadAtlasData().placements[0].latitude = 100; await (await import('./scripts/check-public.ts')).runPublicCheck();"],
    { cwd: process.cwd(), encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Rendering placement mismatch');
  });
});
