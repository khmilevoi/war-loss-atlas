export type LandscapeKind = 'ota-delta' | 'urakami-valley';
type Strip = readonly [left: number, top: number, right: number, bottom: number];

export interface Landscape {
  readonly kind: LandscapeKind;
  readonly hypocenter: { readonly x: number; readonly y: number };
  readonly landmark: { readonly x: number; readonly y: number };
  readonly water: readonly Strip[];
  readonly blockedWater: readonly Strip[];
  readonly bridges: readonly Strip[];
  readonly crossingY: number;
  readonly ridges: readonly Strip[];
  readonly railway: readonly Strip[];
}

/** Symbolic terrain motifs. Coordinates describe the scene artwork only. */
export function createLandscape(kind: LandscapeKind, width: number, height: number): Landscape {
  const water: Strip[] = [];
  const blockedWater: Strip[] = [];
  const bridges: Strip[] = [];
  const ridges: Strip[] = [];
  const railway: Strip[] = [];
  const delta = kind === 'ota-delta';
  const crossingY = Math.floor(height * .35 / 32) * 32 + 16;
  const bridgeY = crossingY - 8;
  const step = 8;
  for (let top = 0; top < height; top += step) {
    const bottom = Math.min(height, top + step);
    const along = (top + bottom) / (2 * height);
    const crossing = top >= bridgeY && top < bridgeY + 16;
    const center = .49 + .034 * Math.sin(along * 7);
    const channels = delta
      ? [.415 - .19 * along + .022 * Math.sin(along * 10), .475 + .25 * along]
      : [center];
    const halfWidth = Math.max(4, Math.round(width * (delta ? .019 : .021)));
    const section: Strip[] = [];
    for (const channel of channels) {
      const middle = Math.round(width * channel);
      const strip: Strip = [middle - halfWidth, top, middle + halfWidth, bottom];
      water.push(strip);
      if (crossing) section.push(strip);
      else blockedWater.push(strip);
    }
    if (crossing) bridges.push([section[0][0] - 5, top, section[section.length - 1][2] + 5, bottom]);
    if (delta && top >= bridgeY + 16 && top < bridgeY + 40) {
      const stem = Math.round(width * .51);
      bridges.push([stem - 6, top, stem + 6, bottom]);
    }
    if (!delta) {
      const track = Math.round(width * (center - .074));
      railway.push([track - 3, top, track + 3, bottom]);
      ridges.push(
        [0, top, Math.round(width * (.16 + .055 * Math.sin(along * 9))), bottom],
        [Math.round(width * (.84 + .043 * Math.cos(along * 11))), top, width, bottom],
      );
    }
  }
  return {
    kind, water, blockedWater, bridges, crossingY, ridges, railway,
    hypocenter: { x: Math.round(width * (delta ? .68 : .57)), y: Math.round(height * .53) },
    landmark: { x: Math.round(width * (delta ? .65 : .73)), y: crossingY - 27 },
  };
}
