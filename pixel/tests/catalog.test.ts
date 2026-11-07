import { describe, expect, it } from 'vitest';
import { compareEstimates, readCatalog, selectMapPlacements } from '../src/catalog';
import type { Anchor, Episode, Estimate } from '../src/catalog';
import { ww2Episodes } from '../src/catalog/ww2-episodes';

const exampleEstimate: Estimate = {
  metric: 'example',
  qualifier: 'reported',
  value: 0,
  low: null,
  high: null,
  comparisonKey: 'example:best',
  source: { title: 'Test source', url: 'https://example.org' },
  scope: 'Test scope',
  uncertainty: '',
};

const exampleAnchor: Anchor = {
  latitude: 35,
  longitude: 140,
  precision: 'illustrative_region',
  label: 'Test anchor',
  basis: 'Test fixture',
  sourceUrl: 'https://example.org',
};

const exampleEpisode: Episode = {
  warId: 'history:ww2',
  episodeId: 'fixture-first',
  names: { ru: 'Первый тестовый эпизод', en: 'First fixture episode' },
  period: { from: 1945, to: 1945 },
  estimate: exampleEstimate,
  anchor: exampleAnchor,
};

describe('published catalog adapter', () => {
  it('preserves all verified identities and conflict-year observations', () => {
    const catalog = readCatalog();
    const ucdp = catalog.wars.filter(({ sourceKind }) => sourceKind === 'ucdp');
    expect(ucdp).toHaveLength(202);
    expect(catalog.wars.filter(({ sourceKind }) => sourceKind === 'history').map(({ id }) => id))
      .toEqual(['history:ww1', 'history:ww2', 'history:us-civil', 'history:korea']);
    expect(new Set(catalog.wars.map(({ id }) => id)).size).toBe(206);
    expect(catalog.nativeRows).toHaveLength(1650);
    expect(new Set(catalog.nativeRows.map(({ conflict_id, year }) => `${conflict_id}:${year}`)).size).toBe(1650);
    expect(catalog.manifest.source.sha256).toBe('b34ecb57f1fc0e73d4bfd7b080212da429af3135a8d360b1c902e45506f81147');
    expect(catalog.nativeRows.find(({ conflict_id, year }) => conflict_id === '329' && year === 2000))
      .toMatchObject({ bd_low: 0, side_a_2nd: null, version: '26.1' });
    expect(ucdp.reduce((total, war) => total + (war.estimate.value ?? 0), 0)).toBe(2_566_047);
    expect(ucdp.reduce((total, war) => total + (war.estimate.low ?? 0), 0)).toBe(2_410_880);
    expect(ucdp.reduce((total, war) => total + (war.estimate.high ?? 0), 0)).toBe(3_330_850);
  });

  it('keeps source-specific historic qualifiers, bounds, and uncertainty', () => {
    const historical = new Map(readCatalog().wars.map(({ id, estimate }) => [id, estimate]));
    expect(historical.get('history:ww1')).toMatchObject({
      qualifier: 'approximate', value: 16_000_000, low: null, high: null,
    });
    expect(historical.get('history:ww2')).toMatchObject({
      qualifier: 'more-than', value: null, low: 65_000_000, high: null,
      source: { url: 'https://www.nam.ac.uk/explore/second-world-war', locator: 'The deadliest conflict in human history' },
    });
    expect(historical.get('history:ww2')?.uncertainty).toContain('USHMM');
    expect(historical.get('history:us-civil')).toMatchObject({
      qualifier: 'at-least', value: null, low: 750_000, high: null,
    });
    expect(historical.get('history:korea')).toMatchObject({
      metric: 'civilian_war_deaths', qualifier: 'approximate', value: 2_000_000,
    });
  });

  it('keeps unplaced conflicts in the catalog and plots only reviewed anchors', () => {
    const catalog = readCatalog();
    expect(catalog.wars.filter(({ anchor }) => anchor === null)).toHaveLength(108);
    const placements = selectMapPlacements(catalog);
    expect(placements).toHaveLength(98);
    expect(placements.filter(({ sourceKind }) => sourceKind === 'ucdp')).toHaveLength(94);
    expect(new Set(placements.map(({ flagId }) => flagId)).size).toBe(98);
    expect(placements.find(({ warId }) => warId === 'history:ww2')).toMatchObject({
      episodeId: null, anchor: { latitude: 51, longitude: 9.5, precision: 'illustrative_region' },
    });
  });

  it('uses each placed episode flag with its own estimate and keeps the shared war identity', () => {
    const catalog = readCatalog([
      exampleEpisode,
      { ...exampleEpisode, episodeId: 'fixture-second' },
      { ...exampleEpisode, episodeId: 'fixture-unplaced', anchor: null },
    ]);
    const ww2Flags = selectMapPlacements(catalog).filter(({ warId }) => warId === 'history:ww2');
    expect(ww2Flags.map(({ episodeId }) => episodeId)).toEqual(['fixture-first', 'fixture-second']);
    expect(new Set(ww2Flags.map(({ flagId }) => flagId)).size).toBe(2);
    expect(ww2Flags[0].estimate.value).toBe(0);
    expect(catalog.episodes).toHaveLength(3);
    expect(catalog.wars.find(({ id }) => id === 'history:ww2')?.estimate.low).toBe(65_000_000);
  });

  it('falls back to the war anchor if its episode has no reviewed location', () => {
    const catalog = readCatalog([{ ...exampleEpisode, anchor: null }]);
    expect(selectMapPlacements(catalog).find(({ warId }) => warId === 'history:ww2')?.episodeId).toBeNull();
  });

  it('preserves sourced dates and separate estimate periods for the two WWII landmarks', () => {
    const catalog = readCatalog(ww2Episodes);
    const flags = selectMapPlacements(catalog);
    expect(flags).toHaveLength(99);
    expect(flags.filter(({ warId }) => warId === 'history:ww2').map(({ flagId }) => flagId))
      .toEqual(['episode:history:ww2/hiroshima', 'episode:history:ww2/nagasaki']);
    const [hiroshima, nagasaki] = catalog.episodes;
    expect(hiroshima).toMatchObject({
      date: { iso: '1945-08-06', precision: 'day' },
      estimatePeriod: { from: '1945-08-06', through: '1945-12-31' },
      anchor: { latitude: 34.395, longitude: 132.455, precision: 'illustrative_landmark' },
      estimate: { qualifier: 'approximate', value: 140_000, comparisonKey: null },
    });
    expect(nagasaki).toMatchObject({
      date: { iso: '1945-08-09', precision: 'day' },
      estimatePeriod: { from: '1945-08-09', through: '1945-12-31' },
      anchor: { latitude: 32.774, longitude: 129.863, precision: 'illustrative_landmark' },
      estimate: { qualifier: 'reported', value: 73_884, comparisonKey: null },
    });
    expect(compareEstimates(hiroshima.estimate, nagasaki.estimate)).toBeNull();
    expect(compareEstimates(hiroshima.estimate, catalog.wars.find(({ id }) => id === 'history:ww2')!.estimate)).toBeNull();
  });

  it('rejects duplicate episode identities and episodes without a parent war', () => {
    expect(() => readCatalog([exampleEpisode, exampleEpisode])).toThrow(/Duplicate episode/);
    expect(() => readCatalog([{ ...exampleEpisode, warId: 'history:missing' }])).toThrow(/Unknown parent war/);
  });
});

describe('comparison of loss estimates', () => {
  it('orders zero and positive values within the same comparison group', () => {
    expect(compareEstimates(exampleEstimate, { ...exampleEstimate, value: 9 })).toBeLessThan(0);
    expect(compareEstimates(exampleEstimate, exampleEstimate)).toBe(0);
  });

  it('declines comparison for unknown, different or source-specific estimates', () => {
    expect(compareEstimates(exampleEstimate, { ...exampleEstimate, value: null })).toBeNull();
    expect(compareEstimates(exampleEstimate, { ...exampleEstimate, qualifier: 'unknown' })).toBeNull();
    expect(compareEstimates(exampleEstimate, { ...exampleEstimate, comparisonKey: 'other' })).toBeNull();
    expect(compareEstimates(exampleEstimate, { ...exampleEstimate, metric: 'other' })).toBeNull();
    expect(compareEstimates({ ...exampleEstimate, comparisonKey: null }, { ...exampleEstimate, comparisonKey: null })).toBeNull();
  });
});
