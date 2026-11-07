import landText from '../../public/geo/ne_110m_land.geojson?raw';
import { compareEstimates, type Estimate, type MapPlacement } from '../catalog';

export const mapWidth = 186;
export const mapHeight = 94;
const gridScale = mapWidth / 250;

type Point = [longitude: number, latitude: number];
type Polygon = Point[][];
type Geometry = { type: 'Polygon'; coordinates: Polygon } | { type: 'MultiPolygon'; coordinates: Polygon[] };

// Same Equal Earth projection used for the reviewed Natural Earth anchors in the current atlas.
export function project(longitude: number, latitude: number) {
  const theta = Math.asin(Math.sqrt(3) / 2 * Math.sin(latitude * Math.PI / 180));
  const t2 = theta * theta;
  const t6 = t2 * t2 * t2;
  const a1 = 1.340264, a2 = -0.081106, a3 = 0.000893, a4 = 0.003796;
  const x = 2 * Math.sqrt(3) * longitude * Math.PI / 180 * Math.cos(theta)
    / (3 * (a1 + 3 * a2 * t2 + t6 * (7 * a3 + 9 * a4 * t2)));
  const y = theta * (a1 + a2 * t2 + t6 * (a3 + a4 * t2));
  return { x: (125 + 44.5 * x) * gridScale, y: (72.5 - 54 * y) * gridScale };
}

export interface Marker {
  key: string;
  x: number;
  y: number;
  placements: MapPlacement[];
  estimate: Estimate | null;
}

export function groupMarkers(placements: readonly MapPlacement[]): Marker[] {
  const comparisonKeys = new Set(placements.flatMap(({ estimate, sourceKind }) =>
    sourceKind === 'ucdp' && estimate.metric === 'battle_related_deaths' && estimate.comparisonKey
      ? [estimate.comparisonKey] : [],
  ));
  // One shared legend can describe a single audited comparison group.
  const comparisonKey = comparisonKeys.size === 1 ? [...comparisonKeys][0] : null;
  const grouped = new Map<string, Marker>();
  for (const placement of placements) {
    const { latitude, longitude } = placement.anchor;
    const key = `${latitude}:${longitude}`;
    let marker = grouped.get(key);
    if (!marker) {
      const { x, y } = project(longitude, latitude);
      marker = { key, x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5, placements: [], estimate: null };
      grouped.set(key, marker);
    }
    marker.placements.push(placement);
    const estimate = placement.estimate;
    if (comparisonKey !== null && estimate.comparisonKey === comparisonKey
      && placement.sourceKind === 'ucdp' && estimate.metric === 'battle_related_deaths'
      && estimate.value !== null && estimate.qualifier !== 'unknown'
      && (marker.estimate === null || compareEstimates(estimate, marker.estimate) === 1)) {
      marker.estimate = estimate;
    }
  }
  return Array.from(grouped.values()).sort((left, right) => left.x - right.x || left.y - right.y);
}

// Retain the audited UCDP cutoffs while making the stronger estimate darker.
export const scale = [
  { min: 0, rgb: [151, 47, 56], color: '#972f38' },
  { min: 1_000, rgb: [126, 34, 46], color: '#7e222e' },
  { min: 10_000, rgb: [97, 22, 38], color: '#611626' },
  { min: 50_000, rgb: [58, 12, 27], color: '#3a0c1b' },
] as const;

export function scaleRank(value: number): number {
  const upper = scale.findIndex(bin => value < bin.min);
  return upper < 0 ? scale.length - 1 : Math.max(0, upper - 1);
}

export function drawLand(canvas: HTMLCanvasElement, markers: readonly Marker[]): void {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable');

  const land = JSON.parse(landText) as { features: { geometry: Geometry }[] };
  for (const { geometry } of land.features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      context.beginPath();
      for (const ring of polygon) {
        for (const [index, [longitude, latitude]] of ring.entries()) {
          const { x, y } = project(longitude, latitude);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        }
        context.closePath();
      }
      context.fill('evenodd');
    }
  }

  const image = context.getImageData(0, 0, mapWidth, mapHeight);
  const shades = new Uint8Array(mapWidth * mapHeight);
  const strengths = new Uint8Array(mapWidth * mapHeight);
  const haloRadius = Math.ceil(6 * gridScale);
  for (const marker of markers) {
    const value = marker.estimate?.value;
    if (value == null) continue;
    const rank = scaleRank(value);
    const cx = Math.floor(marker.x);
    const cy = Math.floor(marker.y);
    for (let dy = -haloRadius; dy <= haloRadius; dy++) {
      for (let dx = -haloRadius; dx <= haloRadius; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || x >= mapWidth || y < 0 || y >= mapHeight) continue;
        const distance = (dx * dx + dy * dy) / (gridScale * gridScale);
        if (distance > 36) continue;
        const strength = distance === 0 ? 4 : distance <= 9 ? 3 : distance <= 20 ? 2 : 1;
        const index = y * mapWidth + x;
        if (strength < strengths[index] || (strength === strengths[index] && rank < shades[index])) continue;
        strengths[index] = strength;
        shades[index] = rank;
      }
    }
  }

  for (let index = 0; index < strengths.length; index++) {
    const offset = index * 4;
    if (image.data[offset + 3] < 128) {
      image.data[offset + 3] = 0;
      continue;
    }
    const x = index % mapWidth;
    const y = Math.floor(index / mapWidth);
    const tone = (Math.imul(x + 1, 71) ^ Math.imul(y + 1, 113)) % 7 - 3;
    const base = [186 + tone, 71 + tone, 75 + tone];
    const center = scale[shades[index]].rgb;
    const mix = strengths[index] / 4;
    image.data[offset] = Math.round(base[0] + (center[0] - base[0]) * mix);
    image.data[offset + 1] = Math.round(base[1] + (center[1] - base[1]) * mix);
    image.data[offset + 2] = Math.round(base[2] + (center[2] - base[2]) * mix);
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}
