import { describe, expect, it } from 'vitest';
import { readCatalog, selectMapPlacements, type MapPlacement } from '../src/catalog';
import { ww2Episodes } from '../src/catalog/ww2-episodes';
import { groupMarkers, mapHeight, mapWidth, scale, scaleRank } from '../src/map/land';

const placements = selectMapPlacements(readCatalog(ww2Episodes));
const ucdp = placements.find(placement => placement.sourceKind === 'ucdp')!;

function atSamePoint(flagId: string, value: number | null, key = ucdp.estimate.comparisonKey): MapPlacement {
  return {
    ...ucdp,
    flagId,
    estimate: {
      ...ucdp.estimate,
      qualifier: value === null ? 'unknown' : 'reported',
      value,
      comparisonKey: key,
    },
  };
}

describe('loss estimation on the world map', () => {
  it('darkens each consecutive UCDP band', () => {
    expect([0, 999, 1000, 9999, 10000, 49999, 50000, 100000].map(scaleRank))
      .toEqual([0, 0, 1, 1, 2, 2, 3, 3]);
    const luminance = scale.map(({ rgb: [r, g, b] }) => 0.2126 * r + 0.7152 * g + 0.0722 * b);
    for (let index = 1; index < luminance.length; index++) {
      expect(luminance[index]).toBeLessThan(luminance[index - 1]);
    }
  });

  it('keeps zero distinct from missing and selects the strongest individual estimate at a shared point', () => {
    const unknown = atSamePoint('unknown', null, null);
    const zero = atSamePoint('zero', 0);
    const other = atSamePoint('other', 35);
    expect(groupMarkers([unknown])[0].estimate).toBeNull();
    expect(groupMarkers([unknown, zero])[0].estimate?.value).toBe(0);
    const [shared] = groupMarkers([unknown, zero, other]);
    expect(shared.placements.map(({ flagId }) => flagId)).toEqual(['unknown', 'zero', 'other']);
    expect(shared.estimate?.value).toBe(35);
    expect(groupMarkers([zero, atSamePoint('different', 80, 'separate-group')])[0].estimate).toBeNull();
  });

  it('plots all sourced flags but keeps historical and episode estimates outside the UCDP scale', () => {
    const markers = groupMarkers(placements);
    expect(markers.flatMap(({ placements }) => placements)).toHaveLength(99);
    expect(new Set(markers.flatMap(({ estimate }) => estimate?.comparisonKey ?? [])))
      .toEqual(new Set([ucdp.estimate.comparisonKey]));
    for (const marker of markers) {
      if (marker.placements.every(({ sourceKind }) => sourceKind === 'history')) expect(marker.estimate).toBeNull();
      if (marker.estimate) expect(marker.estimate.comparisonKey).toBe(ucdp.estimate.comparisonKey);
    }
    expect(markers.filter(marker => marker.estimate !== null).length).toBeGreaterThan(0);
  });

  it('keeps distinct sourced marker groups centered in distinct map cells', () => {
    const markers = groupMarkers(placements);
    expect(new Set(markers.map(({ x, y }) => `${x}:${y}`)).size).toBe(markers.length);
    for (const { x, y } of markers) {
      expect([x % 1, y % 1]).toEqual([0.5, 0.5]);
      expect(x).toBeLessThan(mapWidth);
      expect(y).toBeLessThan(mapHeight);
    }
  });
});
