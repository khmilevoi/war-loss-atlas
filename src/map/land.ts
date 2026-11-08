import landText from '../../public/geo/ne_110m_land.geojson?raw';
import countriesText from '../../data/geography/ne_110m_admin_0_countries.geojson?raw';
import { compareEstimates, type Estimate, type MapPlacement } from '../catalog';

export const mapWidth = 186;
export const mapHeight = 94;
export const mapRasterScale = 4;
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

// Multipliers preserve the underlying ash, grain and boundary ink. Swatches
// represent full intensity on the nominal land material, not every terrain pixel.
export const referenceLand = [102, 85, 77] as const;
export const scale = [
  { min: 0, tint: [1, 0.52, 0.55] },
  { min: 1_000, tint: [0.88, 0.38, 0.46] },
  { min: 10_000, tint: [0.74, 0.27, 0.37] },
  { min: 50_000, tint: [0.56, 0.16, 0.28] },
].map(bin => {
  const rgb = referenceLand.map((channel, index) => Math.round(channel * bin.tint[index]));
  return { ...bin, rgb, color: '#' + rgb.map(channel => channel.toString(16).padStart(2, '0')).join('') };
});

const bayer4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export const tintSteps = 3;

/** Four discrete tint levels; thresholds stay attached to the map, never the viewport. */
export function ditherStrength(strength: number, x: number, y: number): number {
  const scaled = Math.max(0, Math.min(1, strength)) * tintSteps;
  const lower = Math.floor(scaled);
  const threshold = (bayer4[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
  return (lower + (scaled - lower > threshold ? 1 : 0)) / tintSteps;
}

/** Pure multiply: zero intensity is identity; full intensity retains material variation. */
export function multiplyTint(base: ArrayLike<number>, rank: number, strength: number): number[] {
  return Array.from(base, (channel, index) => Math.round(channel * (1 - strength + strength * scale[rank].tint[index])));
}

/** Independent data field on the original two-pixels-per-map-cell grid. */
export function fatalityField(markers: readonly Marker[]) {
  const width = mapWidth * 2, height = mapHeight * 2;
  const ranks = new Uint8Array(width * height);
  const intensities = new Float64Array(width * height);
  const radiusScale = gridScale * 2;
  const radius = Math.ceil(6 * radiusScale);
  for (const marker of markers) {
    const value = marker.estimate?.value;
    if (value == null) continue;
    const rank = scaleRank(value);
    const cx = Math.floor(marker.x * 2), cy = Math.floor(marker.y * 2);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        const distance = (dx * dx + dy * dy) / (radiusScale * radiusScale);
        if (distance >= 36) continue;
        // Interpolate the existing radial anchors, then quantize with dithering.
        const intensity = distance <= 9 ? 1 - distance / 36
          : distance <= 20 ? 0.75 - (distance - 9) / 44
          : (36 - distance) / 32;
        const index = y * width + x;
        // Choose the nearest halo, then the higher band on a tie. Never sum deaths.
        if (intensity < intensities[index] || (intensity === intensities[index] && rank < ranks[index])) continue;
        intensities[index] = intensity;
        ranks[index] = rank;
      }
    }
  }
  const levels = Uint8Array.from(intensities, (intensity, index) =>
    Math.round(ditherStrength(intensity, index % width, Math.floor(index / width)) * tintSteps));
  return { width, height, ranks, levels };
}

export function scaleRank(value: number): number {
  const upper = scale.findIndex(bin => value < bin.min);
  return upper < 0 ? scale.length - 1 : Math.max(0, upper - 1);
}

// Stable weathering in map coordinates: broad stains, small mottles and fine grit.
// The independent lattice sizes avoid the repeating diagonal weave of XOR noise.
function grain(x: number, y: number): number {
  let hash = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function weathering(x: number, y: number, size: number): number {
  const cellX = Math.floor(x / size);
  const cellY = Math.floor(y / size);
  const fractionX = x / size - cellX;
  const fractionY = y / size - cellY;
  const blendX = fractionX * fractionX * (3 - 2 * fractionX);
  const blendY = fractionY * fractionY * (3 - 2 * fractionY);
  const top = grain(cellX, cellY) * (1 - blendX) + grain(cellX + 1, cellY) * blendX;
  const bottom = grain(cellX, cellY + 1) * (1 - blendX) + grain(cellX + 1, cellY + 1) * blendX;
  return top * (1 - blendY) + bottom * blendY - 0.5;
}

function drawBaseLand(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas 2D is unavailable');

  const land = JSON.parse(landText) as { features: { geometry: Geometry }[] };
  // Rasterize the coast more finely without changing the logical marker grid.
  const { width, height } = canvas;
  const pixelsPerCell = width / mapWidth;
  context.clearRect(0, 0, width, height);
  for (const { geometry } of land.features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      context.beginPath();
      for (const ring of polygon) {
        for (const [index, [longitude, latitude]] of ring.entries()) {
          const { x, y } = project(longitude, latitude);
          if (index === 0) context.moveTo(x * pixelsPerCell, y * pixelsPerCell);
          else context.lineTo(x * pixelsPerCell, y * pixelsPerCell);
        }
        context.closePath();
      }
      context.fill('evenodd');
    }
  }

  const image = context.getImageData(0, 0, width, height);
  const landMask = Uint8Array.from({ length: width * height }, (_, index) =>
    image.data[index * 4 + 3] >= 128 ? 1 : 0);
  // Natural Earth's modern boundaries provide cartographic linework only.
  // They do not describe territorial control in the selected historical year.
  context.clearRect(0, 0, width, height);
  context.strokeStyle = '#000';
  context.lineWidth = 0.85;
  const countries = JSON.parse(countriesText) as { features: { geometry: Geometry }[] };
  for (const { geometry } of countries.features) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    for (const polygon of polygons) {
      context.beginPath();
      for (const ring of polygon) {
        for (const [index, [longitude, latitude]] of ring.entries()) {
          const { x, y } = project(longitude, latitude);
          if (index === 0) context.moveTo(x * pixelsPerCell, y * pixelsPerCell);
          else context.lineTo(x * pixelsPerCell, y * pixelsPerCell);
        }
        context.closePath();
      }
      context.stroke();
    }
  }
  const boundaries = context.getImageData(0, 0, width, height).data;

  for (let index = 0; index < landMask.length; index++) {
    const offset = index * 4;
    const x = index % width;
    const y = Math.floor(index / width);
    if (image.data[offset + 3] < 128) {
      const cloud = weathering(x + 193, y + 29, 31);
      const grit = grain(x + 91, y + 307);
      const rust = cloud > 0.06 && grit > 0.84 ? 10 + grit * 12 : 0;
      image.data[offset] = 28 + cloud * 12 + rust;
      image.data[offset + 1] = 13 + cloud * 4 + rust * 0.18;
      image.data[offset + 2] = 16 + cloud * 5 + rust * 0.22;
      image.data[offset + 3] = 255;
      continue;
    }
    const broad = weathering(x + 173, y + 61, 53);
    const mottles = weathering(x + 37, y + 109, 13);
    const speckle = grain(x, y);
    const tone = Math.round((broad * 24 + mottles * 14) / 2) * 2
      + (speckle - 0.5) * 14;
    const coast = x === 0 || y === 0 || x === width - 1 || y === height - 1
      || !landMask[index - 1] || !landMask[index + 1]
      || !landMask[index - width] || !landMask[index + width];
    const wornEdge = coast ? -10 + speckle * 8 : 0;
    const warm = weathering(x + 211, y + 37, 29) * 5;
    const ink = boundaries[offset + 3] >= 80 ? 0.56 : 1;
    const base = [(102 + tone + warm + wornEdge) * ink, (85 + tone + wornEdge) * ink, (77 + tone - warm + wornEdge) * ink];
    image.data[offset] = Math.round(base[0]);
    image.data[offset + 1] = Math.round(base[1]);
    image.data[offset + 2] = Math.round(base[2]);
    image.data[offset + 3] = 255;
  }
  return { image, landMask };
}

// One material raster per resolution, independent of dates, selection and estimates.
let material: ReturnType<typeof drawBaseLand> | undefined;
export function drawLand(canvas: HTMLCanvasElement, markers: readonly Marker[]): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  if (!material || material.image.width !== canvas.width || material.image.height !== canvas.height) {
    material = drawBaseLand(canvas);
  }
  const image = context.createImageData(canvas.width, canvas.height);
  image.data.set(material.image.data);
  const field = fatalityField(markers);
  const haloPixelSize = canvas.width / field.width;
  for (let index = 0; index < material.landMask.length; index++) {
    // Coast and sea anchors keep their positions. Tint only actual land, never
    // suggest that the radius denotes battle territory or colour sea as deaths.
    if (!material.landMask[index]) continue;
    const x = index % canvas.width, y = Math.floor(index / canvas.width);
    const fieldIndex = Math.floor(y / haloPixelSize) * field.width + Math.floor(x / haloPixelSize);
    const level = field.levels[fieldIndex];
    if (!level) continue;
    const offset = index * 4;
    const tint = multiplyTint(material.image.data.subarray(offset, offset + 3), field.ranks[fieldIndex], level / tintSteps);
    image.data[offset] = tint[0];
    image.data[offset + 1] = tint[1];
    image.data[offset + 2] = tint[2];
  }
  context.imageSmoothingEnabled = false;
  context.putImageData(image, 0, 0);
}
