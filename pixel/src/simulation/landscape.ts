export type LandscapeKind = 'ota-delta' | 'urakami-valley';
type Strip = readonly [left: number, top: number, right: number, bottom: number];

export interface Landscape {
  readonly water: readonly Strip[];
  readonly blockedWater: readonly Strip[];
  readonly bridges: readonly Strip[];
  readonly ridges: readonly Strip[];
}

/** Symbolic terrain motifs. Coordinates describe the scene artwork only. */
export function createLandscape(kind: LandscapeKind, width: number, height: number): Landscape {
  const water: Strip[] = [];
  const blockedWater: Strip[] = [];
  const bridges: Strip[] = [];
  const ridges: Strip[] = [];
  const step = 8;
  for (let top = 0; top < height; top += step) {
    const bottom = Math.min(height, top + step);
    const along = (top + bottom) / (2 * height);
    const crossing = along >= .3 && along <= .53;
    const channels = kind === 'ota-delta'
      ? [.38 - .17 * along + .022 * Math.sin(along * 10), .46 + .26 * along]
      : [.51 + .034 * Math.sin(along * 7)];
    const halfWidth = Math.max(4, Math.round(width * (kind === 'ota-delta' ? .017 : .021)));
    for (const channel of channels) {
      const middle = Math.round(width * channel);
      const strip: Strip = [middle - halfWidth, top, middle + halfWidth, bottom];
      water.push(strip);
      if (crossing) bridges.push([strip[0] - 4, top, strip[2] + 4, bottom]);
      else blockedWater.push(strip);
    }
    if (kind === 'urakami-valley') {
      ridges.push(
        [0, top, Math.round(width * (.16 + .055 * Math.sin(along * 9))), bottom],
        [Math.round(width * (.84 + .043 * Math.cos(along * 11))), top, width, bottom],
      );
    }
  }
  return { water, blockedWater, bridges, ridges };
}
