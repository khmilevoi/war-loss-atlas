import { describe, expect, it } from 'vitest';
import { readCatalog, selectMapPlacements, type MapPlacement } from '../src/catalog';
import { ww2Episodes } from '../src/catalog/ww2-episodes';
import { ditherStrength, fatalityField, groupMarkers, mapHeight, mapWidth, multiplyTint, referenceLand, scale, scaleRank, tintSteps } from '../src/map/land';

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


describe('textured fatality field', () => {
  it('multiplies material without flattening its grain or brightening any channel', () => {
    const base = [112, 93, 84];
    expect(multiplyTint(base, 3, 0)).toEqual(base);
    for (let rank = 0; rank < scale.length; rank++) {
      expect(multiplyTint(referenceLand, rank, 1)).toEqual(scale[rank].rgb);
      const result = multiplyTint(base, rank, 1);
      const dark = multiplyTint(base.map(channel => channel * 0.56), rank, 1);
      result.forEach((channel, index) => {
        expect(channel).toBeLessThanOrEqual(base[index]);
        expect(dark[index]).toBeLessThan(channel);
      });
    }
  });

  it('uses discrete ordered levels with a stable map-grid phase', () => {
    const values = Array.from({ length: 16 }, (_, index) => ditherStrength(0.5, index % 4, Math.floor(index / 4)));
    expect(new Set(values)).toEqual(new Set([1 / 3, 2 / 3]));
    expect(values.reduce((sum, value) => sum + value, 0) / 16).toBeCloseTo(0.5);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      expect(ditherStrength(0.5, x + 4, y + 4)).toBe(ditherStrength(0.5, x, y));
      expect(ditherStrength(0, x, y)).toBe(0);
      expect(ditherStrength(1, x, y)).toBe(1);
    }
  });

  it('keeps unknown estimates blank, zero visible, and overlap deterministic without addition', () => {
    const unknown = groupMarkers([atSamePoint('unknown', null)])[0];
    expect(fatalityField([unknown]).levels.some(Boolean)).toBe(false);
    const low = { ...groupMarkers([atSamePoint('zero', 0)])[0], x: 50.5, y: 40.5 };
    const high = { ...groupMarkers([atSamePoint('high', 50000)])[0], x: 50.5, y: 40.5 };
    const field = fatalityField([low, high]);
    const centre = 81 * field.width + 101;
    expect(field.levels[centre]).toBe(tintSteps);
    expect(field.ranks[centre]).toBe(3);
    expect(field).toEqual(fatalityField([high, low]));
    expect(field).toEqual(fatalityField([high, high]));
    expect(new Set(field.levels)).toEqual(new Set([0, 1, 2, 3]));
    expect(field.levels[0]).toBe(0);
    expect(fatalityField([low]).levels[centre]).toBe(tintSteps);
  });
});
