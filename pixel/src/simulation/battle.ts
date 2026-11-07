import { scenarios, units as roster, type BattleBiome, type BattleScenario, type BattleScenarioId, type UnitDefinition } from './roster';
import { createLandscape, type LandscapeKind } from './landscape';

export type { BattleScenarioId } from './roster';

export type BattleCue = 'rifle' | 'cannon' | 'explosion' | 'nuke';
type Team = 0 | 1;
type UnitState = 'advance' | 'patrol' | 'acquire' | 'attack' | 'retreat' | 'cover' | 'support';
type WreckKind = 'tank' | 'artillery' | 'helicopter' | 'carrier' | 'horse';
type TerrainObstacle = [left: number, top: number, right: number, bottom: number, tree?: boolean];

interface Point {
  x: number;
  y: number;
}

interface Crater extends Point {
  radius: number;
  texture: number;
}

interface Tile extends Point {
  variant: number;
  flipX: boolean;
  flipY: boolean;
  road?: number;
}

interface NavigationPoint extends Point {
  col: number;
  row: number;
  open: boolean;
  neighbors: number[];
  region: number;
}

interface NavigationGrid {
  points: NavigationPoint[];
  mainRegion: number;
  spanning: boolean;
}

interface Route extends Point {
  points: Point[];
  index: number;
  retryAt: number;
}

interface Yielding {
  other: Unit;
  dx: number;
  dy: number;
  aside: Point | null;
  progressAt: number;
  deadline: number;
  waitUntil?: number;
}

interface Passing extends Point {
  unit: Unit;
  fromX: number;
  fromY: number;
  dx: number;
  dy: number;
  until: number;
}

interface VisualPose extends Point {
  phase: number;
  angle: number;
  priorAngle: number;
  heading: number;
  motion: number;
  priorMotion: number;
  recoil: number;
  priorRecoil: number;
}

interface Unit extends Point {
  id: number;
  team: Team;
  sprite: string;
  definition: UnitDefinition;
  vehicle: boolean;
  airborne: boolean;
  radius: number;
  throughTrees: boolean;
  support: boolean;
  lane: number;
  angle: number;
  hp: number;
  maxHp: number;
  morale: number;
  state: UnitState;
  speed: number;
  range: number;
  fireRate: number;
  damage: number;
  cooldown: number;
  suppression: number;
  phase: number;
  moving: boolean;
  recoil: number;
  firing: number;
  fireAngle?: number;
  cover: Point | null;
  goal: number;
  focus: number | null;
  removedAt: number | null;
  route: Route | null;
  pose: VisualPose;
  trail?: Point[];
  yielding?: Yielding | null;
  passing?: Passing | null;
  intent?: { heading: number; at: number } | null;
  yieldRetryAt?: number;
}

interface Shot extends Point {
  endX: number;
  endY: number;
  elapsed: number;
  duration: number;
  target: Unit;
  hit: boolean;
  team: Team;
  shell: boolean;
  damage: number;
}

interface Blast extends Point {
  big: boolean;
  age: number;
}

interface Particle extends Point {
  dx: number;
  dy: number;
  age: number;
  life: number;
}

interface BloodStain extends Point {
  at: number;
  colors: readonly string[];
  cells: { dx: number; dy: number; color: number; growth: number }[];
  droplets: { dx: number; dy: number; size: number; duration: number }[];
  duration: number;
}

interface WreckProfile {
  scale: number;
  exit: number;
  size: number;
  flare: number;
  column?: number;
  hatch?: number;
  crash?: number;
  glide?: number;
}

interface Wreck extends Point {
  startX: number;
  startY: number;
  angle: number;
  sprite: string;
  at: number;
  kind: WreckKind;
  profile: WreckProfile;
  crew: boolean;
  rider: string | null;
  hatch: Point;
  exit: Point;
  exitAngle: number;
  fragments: { dx: number; dy: number; size: number }[];
  smoke: { delay: number; dx: number; dy: number; size: number; duration: number }[];
}

interface NuclearTransition extends Point {
  at: number;
  nextBiome: BattleBiome;
  reduce: boolean;
  sparks: { angle: number; reach: number; size: number }[];
  flashPeak: number;
  keepAftermath: boolean;
  duration: number;
  timelineScale: number;
}

interface BattleOptions {
  scenario: BattleScenarioId;
  seed?: string | number;
  width?: number;
  height?: number;
  biome?: BattleBiome | 'auto';
  footprintMode?: 'sprite' | 'fallback';
  reducedMotion?: boolean | (() => boolean);
  aftermathAt?: number;
  aftermathDuration?: number;
  finaleAt?: number;
  landscape?: LandscapeKind;
  unitBudget?: readonly [number, number];
  onCue?: (cue: BattleCue) => void;
  onVehicles?: (count: number) => void;
  onFieldReset?: () => void;
  onSettledBlood?: (stain: Readonly<BloodStain>) => void;
}

const TEAMS = [0, 1] as const;

const TICK_MS = 40;
const TRACKED_TURN_RATE = 1.15;
const TURN_DEADBAND = .012;
const FLASH_START = 1.44;
const FLASH_PEAK = 1.88;
const FLASH_HOLD = 2.08;
const FLASH_END = 2.84;
const REDUCED_FLASH_PEAK = .44;
const REDUCED_FLASH_END = .64;
const NUKE_DURATION = 3;
const TILE_SIZE = 32;
const NAV_CELL = 8;
const PATHS_PER_TICK = 4;
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const STEERING = [0, .62, -.62, 1.32, -1.32];
// Solid shapes in 32-pixel tiles. A fifth value marks a tree; shrubs have no footprint.
const terrainFootprints: Record<BattleBiome, Record<number, TerrainObstacle[]>> = {
  desert: { 1: [], 3: [[10, 9, 29, 24], [16, 4, 27, 11], [14, 22, 28, 28]] },
  snow: { 1: [[4, 4, 18, 17, true], [14, 15, 29, 29, true]],
    3: [[7, 4, 22, 16], [4, 18, 13, 26], [19, 18, 29, 29, true]] },
  ruins: { 1: [[5, 4, 27, 28]], 3: [[5, 5, 27, 20], [4, 19, 15, 28]] },
  village: { 1: [[4, 6, 29, 25]], 3: [[6, 6, 26, 28]] },
};
const BIOMES: readonly BattleBiome[] = ['desert', 'snow', 'ruins', 'village'];
const MAX_REINFORCEMENTS = 8;
const MAX_ACTIVE_PER_TEAM = 8;
const ARMOR_RESERVE_THRESHOLD = 4;
const REDEPLOY_DELAY = .8;
const MAX_SHOTS = 64;
const MAX_BLASTS = 18;
const MAX_WRECKS = 14;
const WRECK_PROFILES: Record<WreckKind, WreckProfile> = {
  tank: { scale: 1, exit: 34, size: 31, flare: 1 },
  artillery: { column: 0, scale: .74, exit: 24, size: 33, flare: .7, hatch: -7 },
  helicopter: { column: 1, scale: 1.12, exit: 34, size: 38, flare: 1.12, crash: .36, glide: 22, hatch: 7 },
  carrier: { column: 2, scale: .9, exit: 28, size: 33, flare: .85 },
  horse: { column: 3, scale: .62, exit: 18, size: 29, flare: 0 },
};
const BLOOD_GROWTH = .44;
const HIT_STAIN_GROWTH = .24;
const BLOOD_COLORS = ['#30070d', '#680913', '#990e20', '#be2734'];
const VEHICLE_SPILL_COLORS = ['#251219', '#4b121b', '#74141e', '#9c2d29'];
const ease = (a: number, b: number, fraction: number) => a + (b - a) * fraction;
const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const limit = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const isObjectTile = (variant: number) => variant === 1 || variant === 3;
const canCrossTrees = (definition: UnitDefinition, sprite: string) => definition.kind === 'tracked' && sprite !== 'm113';
const smooth = (value: number) => {
  const t = limit(value, 0, 1);
  return t * t * (3 - 2 * t);
};

function randomFrom(seed: string) {
  let value = 2166136261;
  for (const char of String(seed)) value = Math.imul(value ^ (char.codePointAt(0) ?? 0), 16777619);
  return () => {
    value = (value + 0x6D2B79F5) | 0;
    let next = Math.imul(value ^ (value >>> 15), value | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function crossesRect(x: number, y: number, endX: number, endY: number, rect: Readonly<TerrainObstacle>, radius: number) {
  const left = rect[0] - radius, top = rect[1] - radius;
  const right = rect[2] + radius, bottom = rect[3] + radius;
  const dx = endX - x, dy = endY - y;
  if ((!dx && (x < left || x > right)) || (!dy && (y < top || y > bottom))) return false;
  const tx = dx ? (left - x) / dx : -Infinity;
  const tx2 = dx ? (right - x) / dx : Infinity;
  const ty = dy ? (top - y) / dy : -Infinity;
  const ty2 = dy ? (bottom - y) / dy : Infinity;
  return Math.max(0, Math.min(tx, tx2), Math.min(ty, ty2))
    <= Math.min(1, Math.max(tx, tx2), Math.max(ty, ty2)) + 1e-9;
}

// Ported from the frozen atlas-grounded-preview-2026-11-06 rules.
// The host drives time and can supply presentation callbacks without browser globals.
export function createBattle(options: BattleOptions) {
  const unitBudget = options.unitBudget ? [...options.unitBudget] : undefined;
  if (unitBudget?.some(total => !Number.isSafeInteger(total) || total < 0)) {
    throw new RangeError('Invalid battle unit budget');
  }
  const width = options.width ?? 400;
  const height = options.height ?? 240;
  const scale = Math.min(1, 400 / width);
  const W = Math.max(160, Math.round(width * scale));
  const H = Math.max(120, Math.round(height * scale));
  const landscape = options.landscape ? createLandscape(options.landscape, W, H) : undefined;
  const navCols = Math.ceil(W / NAV_CELL), navRows = Math.ceil(H / NAV_CELL);
  const tileCols = Math.ceil(W / TILE_SIZE), tileRows = Math.ceil(H / TILE_SIZE);
  const navigation = new Map<number, NavigationGrid>();
  const reducedMotion = () => typeof options.reducedMotion === 'function'
    ? options.reducedMotion() : Boolean(options.reducedMotion);
  let seed: string, era: BattleScenarioId, period: BattleScenario, random: () => number;
  let obstacles: TerrainObstacle[][], searchesLeft: number, covers: Point[];
  let units: Unit[], shots: Shot[], blasts: Blast[], dust: Particle[], terrain: Tile[];
  let biome: BattleBiome, activeBlood: BloodStain[], wrecks: Wreck[];
  let craters: Crater[] = [];
  let biomeOverride = options.biome === 'auto' ? undefined : options.biome;
  let time: number, accumulator: number, nextId: number, reinforced: number, reinforcementsAt: number;
  let paused = true, finished = false, eliminatedAt: [number | null, number | null];
  let nuke: NuclearTransition | null, nukeCount: number, audibleVehicles: number | undefined;
  const spawnedByTeam = [0, 0];

  const range = (min: number, max: number) => ease(min, max, random());
  const ground = (lane: number) => H * (.18 + lane * .32);

  function buildTerrain(nextBiome: BattleBiome, preserveTraces = false) {
    biome = nextBiome;
    if (!preserveTraces) {
      activeBlood = [];
      options.onFieldReset?.();
      wrecks = [];
    }
    const randomTile = randomFrom(seed + ':' + era + ':' + biome + ':' + nukeCount);
    const openTankField = period.armoredBattle && biome === 'snow' && !nukeCount;
    terrain = [];
    searchesLeft = PATHS_PER_TICK;
    for (let y = 0; y < H; y += TILE_SIZE) {
      for (let x = 0; x < W; x += TILE_SIZE) {
        const roll = randomTile();
        let variant;
        if (openTankField) {
          const onFlank = y < TILE_SIZE * 2 || y >= H - TILE_SIZE * 2;
          variant = onFlank && roll > .84 ? 3 : roll > .64 ? 2 : 0;
        } else {
          variant = roll < .47 ? 0 : 1 + Math.floor(randomTile() * 3);
        }
        terrain.push({ x, y, variant, flipX: randomTile() > .5, flipY: randomTile() > .5 });
      }
    }
    if (biome === 'ruins' || biome === 'village') {
      layoutSettlement(randomFrom(seed + ':' + era + ':' + biome + ':' + nukeCount + ':roads'));
    }
    if (landscape) {
      for (const tile of terrain) {
        if (landscape.bridges.some(([left, top, right, bottom]) =>
          tile.x < right && tile.x + TILE_SIZE > left && tile.y < bottom && tile.y + TILE_SIZE > top)) {
          tile.variant = 2;
        }
      }
    }
    indexTerrain();
    if (!navigationFor(13).spanning) {
      // Open the least obstructed interior row only when heavy units cannot cross the field.
      const rows = Array.from({ length: Math.floor(H / TILE_SIZE) - 2 }, (_, index) => index + 1);
      const score = (row: number) => obstacles.slice(row * tileCols, (row + 1) * tileCols)
        .filter(shapes => shapes.length).length + Math.abs(row * TILE_SIZE + TILE_SIZE / 2 - H / 2) / H;
      const row = rows.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
      for (let col = 0; col < tileCols; col++) {
        const index = row * tileCols + col;
        if (obstacles[index].length) terrain[index].variant = 2;
      }
      indexTerrain();
    }
  }

  function layoutSettlement(random: () => number) {
    const roads = new Map<number, number>();
    const lastCol = tileCols - 1, lastRow = tileRows - 1;
    const lastFullRow = Math.floor(H / TILE_SIZE) - 1;
    const integer = (low: number, high: number) => low + Math.floor(random() * (Math.max(low, high) - low + 1));
    const main = integer(lastFullRow > 4 ? 2 : 1, Math.max(1, lastFullRow - 2));

    function street(col: number, row: number, endCol: number, endRow: number) {
      const dx = Math.sign(endCol - col), dy = Math.sign(endRow - row);
      if (!dx && !dy) return;
      const direction = DIRECTIONS.findIndex(([x, y]) => x === dx && y === dy);
      const outgoing = 1 << direction, incoming = 1 << ((direction + 2) % 4);
      while (col !== endCol || row !== endRow) {
        const from = row * tileCols + col;
        col += dx;
        row += dy;
        const to = row * tileCols + col;
        roads.set(from, (roads.get(from) ?? 0) | outgoing);
        roads.set(to, (roads.get(to) ?? 0) | incoming);
      }
    }

    if (biome === 'ruins') {
      const west = integer(Math.max(1, Math.floor(tileCols * .22)), Math.max(1, Math.floor(tileCols * .35)));
      const east = integer(Math.max(west + 2, Math.floor(tileCols * .62)), lastCol - 1);
      const side = main <= lastFullRow / 2 ? lastFullRow - 1 : 1;
      const sideRow = side === main ? lastFullRow : side;
      street(0, main, lastCol, main);
      street(west, 0, west, lastRow);
      street(east, 0, east, lastRow);
      if (random() < .5) street(0, sideRow, east, sideRow);
      else street(west, sideRow, lastCol, sideRow);
    } else {
      const bend = integer(Math.max(2, Math.floor(tileCols * .38)), Math.min(lastCol - 2, Math.floor(tileCols * .63)));
      const rightRow = tileCols >= 8 ? limit(main + (random() < .5 ? -1 : 1), 1, lastFullRow - 1) : main;
      street(0, main, bend, main);
      street(bend, main, bend, rightRow);
      street(bend, rightRow, lastCol, rightRow);
      const north = rightRow === main ? random() < .5 : rightRow > main;
      const westBranch = integer(1, bend - 2);
      const westEnd = limit(main + (north ? -1 : 1) * integer(1, 2), 0, lastFullRow);
      street(westBranch, main, westBranch, westEnd);
      if (tileCols >= 8 && random() < .76) {
        const eastBranch = integer(Math.min(bend + 2, lastCol - 1), lastCol - 1);
        const eastEnd = limit(rightRow + (north ? 1 : -1) * integer(1, 2), 0, lastFullRow);
        street(eastBranch, rightRow, eastBranch, eastEnd);
      }
    }

    for (let index = 0; index < terrain.length; index++) {
      const tile = terrain[index];
      const col = index % tileCols, row = Math.floor(index / tileCols);
      let road = roads.get(index);
      if (road) {
        // Extend through the crop where a street meets the boundary of the map.
        if (col === 0 && (road & 1)) road |= 4;
        if (col === lastCol && (road & 4)) road |= 1;
        if (row === 0 && (road & 2)) road |= 8;
        if (row === lastRow && (road & 8)) road |= 2;
        tile.road = road;
        tile.variant = 0;
        continue;
      }
      const frontage = DIRECTIONS.some(([dx, dy]) => col + dx >= 0 && col + dx <= lastCol
        && row + dy >= 0 && row + dy <= lastRow && roads.has((row + dy) * tileCols + col + dx));
      const city = biome === 'ruins';
      const density = city ? (frontage ? .82 : .65) : (frontage ? .58 : 0);
      tile.variant = random() < density ? (random() < .55 ? 1 : 3) : city && random() < .45 ? 2 : 0;
    }
  }

  function indexTerrain() {
    navigation.clear();
    covers = [];
    obstacles = terrain.map(({ x, y, variant }) => {
      if (!isObjectTile(variant)) return [];
      const shapes: TerrainObstacle[] = options.footprintMode === 'fallback' ? [[7, 8, 24, 24]] : terrainFootprints[biome][variant];
      if (shapes.length && x > W * .16 && x + TILE_SIZE < W * .84 && y + TILE_SIZE < H) {
        covers.push({ x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 });
      }
      return shapes.map(([left, top, right, bottom, tree]) => [x + left, y + top, x + right, y + bottom, tree]);
    });
  }

  function setBiome(value: BattleBiome | 'auto') {
    if (nuke || (value !== 'auto' && !BIOMES.includes(value))) return false;
    biomeOverride = value === 'auto' ? undefined : value;
    const nextBiome = biomeOverride ?? period.biome;
    if (nextBiome === biome) return true;
    buildTerrain(nextBiome);
    const previous = units;
    units = [];
    for (const unit of previous) {
      if (unit.hp <= 0) continue;
      const position = spawnPosition(unit.x, unit.y, unit.radius, unit.throughTrees);
      if (!position) continue;
      Object.assign(unit, position, { cover: null, route: null, yielding: null, passing: null, trail: [], intent: null, yieldRetryAt: 0 });
      unit.pose = visualPose(unit, unit.angle, unit.phase);
      units.push(unit);
    }
    return true;
  }

  function terrainClear(x: number, y: number, endX: number, endY: number, radius: number, throughTrees = false) {
    if (endX < radius || endX > W - radius || endY < radius || endY > H - radius) return false;
    if (landscape?.blockedWater.some(strip => crossesRect(x, y, endX, endY, strip, radius))) return false;
    const left = Math.max(0, Math.floor((Math.min(x, endX) - radius) / TILE_SIZE));
    const right = Math.min(tileCols - 1, Math.floor((Math.max(x, endX) + radius) / TILE_SIZE));
    const top = Math.max(0, Math.floor((Math.min(y, endY) - radius) / TILE_SIZE));
    const bottom = Math.min(tileRows - 1, Math.floor((Math.max(y, endY) + radius) / TILE_SIZE));
    for (let row = top; row <= bottom; row++) {
      for (let col = left; col <= right; col++) {
        for (const rect of obstacles[row * tileCols + col]) {
          if ((!throughTrees || !rect[4]) && crossesRect(x, y, endX, endY, rect, radius)) return false;
        }
      }
    }
    return true;
  }

  function unitBlocker(unit: Unit | null, x: number, y: number, endX: number, endY: number, radius: number) {
    const dx = endX - x, dy = endY - y;
    const length = dx * dx + dy * dy;
    for (const other of units) {
      if (other === unit || other.hp <= 0 || !other.radius) continue;
      const gap = radius + other.radius;
      if (other.x < Math.min(x, endX) - gap || other.x > Math.max(x, endX) + gap
        || other.y < Math.min(y, endY) - gap || other.y > Math.max(y, endY) + gap) continue;
      const fraction = length ? limit(((other.x - x) * dx + (other.y - y) * dy) / length, 0, 1) : 0;
      const sepX = x + dx * fraction - other.x, sepY = y + dy * fraction - other.y;
      if (sepX * sepX + sepY * sepY < gap * gap) return other;
    }
    return null;
  }

  function unitClear(unit: Unit | null, x: number, y: number, endX: number, endY: number, radius: number) {
    return !unitBlocker(unit, x, y, endX, endY, radius);
  }

  function navigationFor(radius: number, throughTrees = false): NavigationGrid {
    const key = throughTrees ? -radius : radius;
    const cached = navigation.get(key);
    if (cached) return cached;
    const points = Array.from({ length: navCols * navRows }, (_, index): NavigationPoint => {
      const col = index % navCols, row = Math.floor(index / navCols);
      const x = col * NAV_CELL + NAV_CELL / 2, y = row * NAV_CELL + NAV_CELL / 2;
      return { x, y, col, row, open: terrainClear(x, y, x, y, radius, throughTrees), neighbors: [], region: 0 };
    });
    for (const point of points) {
      if (!point.open) continue;
      for (const [dx, dy] of DIRECTIONS) {
        const col = point.col + dx, row = point.row + dy;
        if (col < 0 || col >= navCols || row < 0 || row >= navRows) continue;
        const index = row * navCols + col, next = points[index];
        if (next.open && terrainClear(point.x, point.y, next.x, next.y, radius, throughTrees)) point.neighbors.push(index);
      }
    }
    let region = 0, mainRegion = 0, biggest = 0, spanning = false;
    for (let index = 0; index < points.length; index++) {
      if (!points[index].open || points[index].region) continue;
      const queue = [index];
      points[index].region = ++region;
      for (let i = 0; i < queue.length; i++) {
        for (const next of points[queue[i]].neighbors) {
          if (points[next].region) continue;
          points[next].region = region;
          queue.push(next);
        }
      }
      const crossesField = queue.some(index => points[index].x < W * .25)
        && queue.some(index => points[index].x > W * .75);
      if (crossesField && !spanning || crossesField === spanning && queue.length > biggest) {
        mainRegion = region;
        biggest = queue.length;
        spanning = crossesField;
      }
    }
    const grid = { points, mainRegion, spanning };
    navigation.set(key, grid);
    return grid;
  }

  function nearestCell(grid: NavigationGrid, x: number, y: number, accept: (point: NavigationPoint) => boolean) {
    const col = limit(Math.floor(x / NAV_CELL), 0, navCols - 1);
    const row = limit(Math.floor(y / NAV_CELL), 0, navRows - 1);
    const direct = row * navCols + col;
    if (grid.points[direct].open && accept(grid.points[direct])) return direct;
    let closest = -1, best = Infinity;
    for (let index = 0; index < grid.points.length; index++) {
      const point = grid.points[index];
      if (!point.open) continue;
      const d = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (d < best && accept(point)) {
        closest = index;
        best = d;
      }
    }
    return closest;
  }

  function spawnPosition(x: number, y: number, radius: number, throughTrees = false, team: Team | null = null) {
    if (!radius) return { x, y };
    const grid = navigationFor(radius, throughTrees);
    const index = nearestCell(grid, x, y, point => point.region === grid.mainRegion
      && (team === null || (team === 0 ? point.x < W / 2 : point.x >= W / 2))
      && unitClear(null, point.x, point.y, point.x, point.y, radius));
    if (index < 0) return null;
    const point = grid.points[index];
    if (terrainClear(point.x, point.y, x, y, radius, throughTrees) && unitClear(null, x, y, x, y, radius)) return { x, y };
    return { x: point.x, y: point.y };
  }

  function findRoute(unit: Unit, x: number, y: number): Point[] {
    const { radius, throughTrees } = unit;
    const grid = navigationFor(radius, throughTrees);
    const start = nearestCell(grid, unit.x, unit.y,
      point => terrainClear(unit.x, unit.y, point.x, point.y, radius, throughTrees));
    if (start < 0) return [];
    const region = grid.points[start].region;
    const accepts = (point: NavigationPoint) => point.region === region;
    const exact = terrainClear(x, y, x, y, radius, throughTrees)
      ? nearestCell(grid, x, y, point => accepts(point) && terrainClear(point.x, point.y, x, y, radius, throughTrees))
      : -1;
    const goal = exact >= 0 ? exact : nearestCell(grid, x, y, accepts);
    const scores = new Int32Array(grid.points.length).fill(-1);
    const parents = new Int32Array(grid.points.length).fill(-1);
    const goalPoint = grid.points[goal];
    const open = [start];
    scores[start] = 0;
    const heuristic = (index: number) => Math.abs(grid.points[index].col - goalPoint.col) + Math.abs(grid.points[index].row - goalPoint.row);
    while (open.length) {
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        const candidate = open[i], current = open[best];
        const difference = scores[candidate] + heuristic(candidate) - scores[current] - heuristic(current);
        if (difference < 0 || (!difference && scores[candidate] > scores[current])) best = i;
      }
      const current = open[best];
      open[best] = open[open.length - 1];
      open.pop();
      if (current === goal) break;
      for (const next of grid.points[current].neighbors) {
        const cost = scores[current] + 1;
        if (scores[next] >= 0 && scores[next] <= cost) continue;
        if (scores[next] < 0) open.push(next);
        scores[next] = cost;
        parents[next] = current;
      }
    }
    const path: Point[] = [];
    if (exact >= 0) path.push({ x, y });
    for (let index = goal; index >= 0; index = parents[index]) path.push(grid.points[index]);
    return path.reverse();
  }

  function routeWaypoint(unit: Unit, x: number, y: number) {
    const clear = (point: Point) => terrainClear(unit.x, unit.y, point.x, point.y, unit.radius, unit.throughTrees);
    if (clear({ x, y })) {
      unit.route = null;
      return { x, y };
    }
    let route = unit.route;
    const exhausted = route && route.index >= route.points.length;
    const movedGoal = route && Math.hypot(route.x - x, route.y - y) > (exhausted ? 1 : NAV_CELL);
    const stranded = route?.points[route.index] && !clear(route.points[route.index]);
    if (!route || ((movedGoal || stranded) && time >= route.retryAt)) {
      if (searchesLeft <= 0) return null;
      searchesLeft--;
      route = unit.route = { x, y, index: 0, retryAt: time + .24 + unit.id % 4 * .04, points: findRoute(unit, x, y) };
    }
    if (!route) return null;
    const { points } = route;
    while (route.index < points.length && distance(unit, points[route.index]) < .7) route.index++;
    if (route.index >= points.length || !clear(points[route.index])) return null;
    const last = Math.min(route.index + 5, points.length - 1);
    for (let index = last; index > route.index; index--) {
      if (clear(points[index])) {
        route.index = index;
        break;
      }
    }
    return points[route.index];
  }

  function syncVehicleSound() {
    if (!options.onVehicles) return;
    const count = paused ? 0 : units.filter(unit => unit.vehicle && unit.hp > 0 && (unit.moving || unit.airborne)).length;
    if (count === audibleVehicles) return;
    audibleVehicles = count;
    options.onVehicles(count);
  }

  function fighter(team: Team, index = nextId) {
    const available = period.teams[team].fighters;
    return available[index % available.length];
  }

  function spawn(team: Team, sprite = fighter(team), support = false, fromEdge = false, lane = Math.floor(random() * 3)) {
    if (unitBudget && (spawnedByTeam[team] >= unitBudget[team]
      || units.filter(unit => unit.team === team && unit.hp > 0).length >= MAX_ACTIVE_PER_TEAM)) return false;
    const definition = roster[sprite];
    const vehicle = definition.stats;
    const angle = team === 0 ? 0 : Math.PI;
    const x = fromEdge ? (team === 0 ? range(4, W * .1) : range(W * .9, W - 4))
      : (team === 0 ? range(W * .07, W * .25) : range(W * .75, W * .93));
    const y = ground(lane) + range(-H * .09, H * .09);
    const airborne = definition.kind === 'airborne';
    const radius = airborne ? 0 : vehicle ? 13 : definition.mount ? 8 : 6;
    const throughTrees = !!vehicle && canCrossTrees(definition, sprite);
    const position = spawnPosition(x, y, radius, throughTrees, team);
    if (!position) return false;
    const hp = vehicle?.health ?? (support ? 4 : 3);
    const unit: Omit<Unit, 'pose'> = {
      id: ++nextId, team, sprite, definition, vehicle: !!vehicle, airborne, radius, throughTrees,
      support, lane, ...position, angle, hp, maxHp: hp, morale: range(.62, 1),
      state: 'advance', speed: (vehicle?.speed ?? definition.speed ?? period.speed) * range(.82, 1.18),
      range: (vehicle?.range ?? definition.range ?? period.range) * range(.9, 1.12) * W / 400,
      fireRate: (vehicle?.rate ?? period.fire) * range(.85, 1.22), damage: vehicle?.damage ?? 1,
      cooldown: range(.3, 1.4), suppression: 0, phase: range(0, 4), moving: false,
      recoil: 0, firing: Infinity, cover: null, goal: W * (team === 0 ? range(.38, .48) : range(.52, .62)),
      focus: null, removedAt: null, route: null,
    };
    units.push({ ...unit, pose: visualPose(position, angle, unit.phase) });
    spawnedByTeam[team]++;
    return true;
  }

  function visualPose(position: Point, angle: number, phase: number): VisualPose {
    return {
      x: position.x, y: position.y, phase,
      angle, priorAngle: angle, heading: angle,
      motion: 0, priorMotion: 0, recoil: 0, priorRecoil: 0,
    };
  }

  function updateVisualPose(unit: Unit, dt: number) {
    const pose = unit.pose;
    pose.x = unit.x;
    pose.y = unit.y;
    pose.phase = unit.phase;
    pose.priorAngle = pose.angle;
    pose.priorMotion = pose.motion;
    pose.priorRecoil = pose.recoil;
    update(unit, dt);
    // Steering and aiming still use the simulation angle. The body follows it gradually.
    const tracked = unit.vehicle && canCrossTrees(unit.definition, unit.sprite)
      || unit.definition?.kind === 'tracked';
    const moving = unit.hp > 0 && unit.moving;
    const response = tracked ? (moving ? 8 : 14) : 22;
    pose.heading += turnBetween(pose.heading, unit.angle) * (1 - Math.exp(-dt * response));
    const difference = turnBetween(pose.angle, pose.heading);
    const maxTurn = (tracked ? TRACKED_TURN_RATE : unit.vehicle ? 2.4 : 6.4) * dt;
    if (Math.abs(difference) > TURN_DEADBAND) {
      pose.angle += limit(difference * (1 - Math.exp(-dt * (tracked ? 8 : 16))), -maxTurn, maxTurn);
    }
    pose.motion = ease(pose.motion, Number(moving), 1 - Math.exp(-dt * (moving ? 18 : 12)));
    pose.recoil = ease(pose.recoil, unit.recoil, 1 - Math.exp(-dt * 24));
  }

  function reset(value: string | number = seed, nextEra: BattleScenarioId = era) {
    seed = String(value ?? '1846');
    era = nextEra;
    period = scenarios[era];
    random = randomFrom(seed + ':' + era);
    units = []; shots = []; blasts = []; dust = [];
    spawnedByTeam.fill(0);
    time = 0; accumulator = 0; nextId = 0; reinforced = 0; reinforcementsAt = 10;
    nuke = null; nukeCount = 0;
    craters = [];
    finished = false;
    buildTerrain(biomeOverride ?? period.biome);
    deployForces();
    syncVehicleSound();
  }

  function deployForces(fromEdge = false) {
    eliminatedAt = [null, null];
    for (let lane = 0; lane < 3; lane++) {
      if (period.armoredBattle && lane === 1) continue;
      for (const team of TEAMS) {
        spawn(team, fighter(team, lane * 2), false, fromEdge, lane);
        if (!period.armoredBattle) spawn(team, fighter(team, lane * 2 + 1), false, fromEdge, lane);
      }
    }
    for (const team of TEAMS) {
      const side = period.teams[team];
      side.vehicles.forEach((id, index) => spawn(team, id, false, fromEdge, (team + index + 1) % 3));
      side.support.forEach(id => spawn(team, id, true, fromEdge, team));
    }
  }

  function reinforceTeam(team: Team, lane?: number) {
    if (!period.armoredBattle) return spawn(team, fighter(team, lane ?? nextId), false, true, lane);
    const armor = period.teams[team].vehicles;
    return spawn(team, armor[nextId % armor.length], false, true, lane);
  }

  function triggerNuke(mode: 'preview' | 'aftermath' = 'preview') {
    if (nuke || finished) return false;
    const keepAftermath = mode === 'aftermath';
    const nextBiome = keepAftermath ? 'ruins' : BIOMES[(BIOMES.indexOf(biome) + 1) % BIOMES.length];
    const effectRandom = randomFrom(seed + ':nuke:' + nukeCount);
    const sparks = Array.from({ length: 58 }, () => {
      const angle = effectRandom() * Math.PI * 2;
      return { angle, reach: .14 + effectRandom() * .84, size: 1 + Math.floor(effectRandom() * 4) };
    });
    const reduce = reducedMotion();
    const duration = keepAftermath ? (options.aftermathDuration ?? 3000) / 1000 : NUKE_DURATION;
    const timelineScale = duration / NUKE_DURATION;
    nuke = { at: time, x: W * range(.43, .57), y: H * .5, nextBiome, reduce, sparks, keepAftermath, duration, timelineScale,
      flashPeak: (reduce ? REDUCED_FLASH_PEAK : FLASH_PEAK) * timelineScale };
    nukeCount++;
    if (!keepAftermath) units = [];
    shots = []; blasts = []; dust = [];
    syncVehicleSound();
    options.onCue?.('nuke');
    return true;
  }

  function tryStep(unit: Unit, angle: number, amount: number, face: boolean, remember: boolean) {
    const { x, y, radius } = unit;
    const endX = x + Math.cos(angle) * amount;
    const endY = y + Math.sin(angle) * amount;
    if (radius && (!terrainClear(x, y, endX, endY, radius, unit.throughTrees) || !unitClear(unit, x, y, endX, endY, radius))) return false;
    if (radius && remember) {
      const trail = unit.trail ??= [];
      const last = trail[trail.length - 1];
      if (!last || Math.hypot(last.x - x, last.y - y) >= NAV_CELL * .75
        || !terrainClear(last.x, last.y, endX, endY, radius, unit.throughTrees)) {
        if (trail.length >= 64) trail.shift();
        trail.push({ x, y });
      }
    }
    unit.x = endX;
    unit.y = endY;
    if (face) unit.angle = angle;
    unit.moving = true;
    unit.phase += amount * .47;
    return true;
  }

  function yieldSpace(unit: Unit, stride: number, face: boolean) {
    const yielding = unit.yielding;
    if (!yielding) return false;
    const { other, dx, dy } = yielding;
    const gap = unit.radius + other.radius;
    if (other.hp <= 0 || distance(unit, other) > 64 || time >= yielding.deadline) {
      unit.yielding = null;
      if (other.passing?.unit === unit) other.passing = null;
      unit.yieldRetryAt = time + .48;
      return false;
    }
    if (!yielding.aside) {
      // Step off the travel line when the previous route reaches a passing space.
      for (const sign of [1, -1]) {
        const x = unit.x - dy * (gap + 2) * sign, y = unit.y + dx * (gap + 2) * sign;
        if (!terrainClear(unit.x, unit.y, x, y, unit.radius, unit.throughTrees)
          || !unitClear(unit, unit.x, unit.y, x, y, unit.radius)) continue;
        yielding.aside = { x, y };
        const passX = unit.x + dx * (gap + 4), passY = unit.y + dy * (gap + 4);
        if (!other.passing && terrainClear(unit.x, unit.y, passX, passY, other.radius, other.throughTrees)) {
          other.passing = { unit, x: passX, y: passY, fromX: unit.x, fromY: unit.y, dx, dy, until: time + 5 };
        }
        break;
      }
    }
    const trail = unit.trail ??= [];
    if (!yielding.aside) {
      while (trail.length && distance(unit, trail[trail.length - 1]) < .35) trail.pop();
    }
    const point = yielding.aside ?? trail[trail.length - 1] ?? { x: unit.x + dx * NAV_CELL, y: unit.y + dy * NAV_CELL };
    const remaining = distance(unit, point);
    if (yielding.aside && remaining < .35) {
      yielding.waitUntil ??= time + 3;
      const passed = (other.x - unit.x) * dx + (other.y - unit.y) * dy > gap;
      if (passed || time >= yielding.waitUntil) {
        unit.yielding = null;
        unit.route = null;
        return false;
      }
      return true;
    }
    const heading = Math.atan2(point.y - unit.y, point.x - unit.x);
    const amount = Math.min(stride, remaining);
    for (const turn of STEERING) {
      if (!tryStep(unit, heading + turn, turn ? amount * .7 : amount, face, false)) continue;
      yielding.progressAt = time;
      return true;
    }
    if (time - yielding.progressAt > .72) {
      unit.yielding = null;
      unit.yieldRetryAt = time + .48;
      unit.route = null;
      if (other.passing?.unit === unit) other.passing = null;
      return false;
    }
    return true;
  }

  function move(unit: Unit, x: number, y: number, dt: number, factor = 1, face = true) {
    const radius = unit.radius;
    const stride = unit.speed * factor * dt;
    if (unit.yielding && yieldSpace(unit, stride, face)) return;
    if (unit.passing) {
      const pass = unit.passing;
      const behind = (pass.unit.x - pass.fromX) * pass.dx + (pass.unit.y - pass.fromY) * pass.dy;
      if (pass.unit.hp > 0 && behind > -(unit.radius + pass.unit.radius) && time < pass.until) {
        x = pass.x;
        y = pass.y;
      } else {
        unit.passing = null;
        unit.route = null;
      }
    }
    x = limit(x, radius || 2, W - (radius || 2));
    y = limit(y, radius || 4, H - (radius || 4));
    const waypoint = radius ? routeWaypoint(unit, x, y) : { x, y };
    if (!waypoint) return;
    const dx = waypoint.x - unit.x, dy = waypoint.y - unit.y;
    const magnitude = Math.hypot(dx, dy);
    if (magnitude < .35) return;
    const amount = Math.min(magnitude, stride);
    const heading = Math.atan2(dy, dx);
    if (radius) unit.intent = { heading, at: time };
    for (const turn of STEERING) {
      if (turn && (!radius || magnitude < radius && !unit.route)) break;
      if (tryStep(unit, heading + turn, amount, face, true)) return;
    }
    if (!radius) return;
    const other = unitBlocker(unit, unit.x, unit.y,
      unit.x + Math.cos(heading) * amount, unit.y + Math.sin(heading) * amount, radius);
    if (other && unit.id > other.id && other.intent && time - other.intent.at < .15
      && time >= (unit.yieldRetryAt ?? 0) && Math.cos(heading - other.intent.heading) < -.5) {
      unit.yielding = { other, dx: -Math.cos(heading), dy: -Math.sin(heading), aside: null,
        progressAt: time, deadline: time + 12 };
      yieldSpace(unit, stride, face);
    }
  }

  function shelter(unit: Unit, threat: Unit | null) {
    const friendlyDirection = unit.team === 0 ? -1 : 1;
    const { radius, throughTrees } = unit;
    const grid = navigationFor(radius, throughTrees);
    const start = nearestCell(grid, unit.x, unit.y, point => terrainClear(unit.x, unit.y, point.x, point.y, radius, throughTrees));
    if (start < 0) return null;
    const region = grid.points[start].region;
    let chosen = null, score = Infinity;
    for (const cover of covers) {
      const offset = (cover.x - unit.x) * friendlyDirection;
      if (offset < -8) continue;
      const cost = distance(unit, cover) + (threat && distance(threat, cover) < distance(threat, unit) ? 38 : 0);
      if (cost >= score) continue;
      const bearing = (threat ? Math.atan2(cover.y - threat.y, cover.x - threat.x)
        : friendlyDirection === 1 ? 0 : Math.PI) + (unit.id % 3 - 1) * .16;
      for (let gap = 12; gap <= 32; gap += 4) {
        const x = cover.x + Math.cos(bearing) * gap, y = cover.y + Math.sin(bearing) * gap;
        if (!terrainClear(x, y, x, y, radius, throughTrees) || !unitClear(unit, x, y, x, y, radius)) continue;
        const goal = nearestCell(grid, x, y,
          point => point.region === region && terrainClear(x, y, point.x, point.y, radius, throughTrees));
        if (goal < 0) continue;
        chosen = { x, y };
        score = cost;
        break;
      }
    }
    return chosen;
  }

  function chooseTarget(unit: Unit) {
    let closest = null, best = Infinity;
    for (const opponent of units) {
      if (opponent.team === unit.team || opponent.hp <= 0 || opponent.support) continue;
      const infantryPenalty = period.armoredBattle && unit.vehicle && !opponent.vehicle ? 28 : 0;
      const armorPenalty = opponent.vehicle && !unit.vehicle ? 21 : 0;
      const cost = distance(unit, opponent) + infantryPenalty + armorPenalty;
      if (cost < best) {
        closest = opponent;
        best = cost;
      }
    }
    return closest;
  }

  function fire(unit: Unit, target: Unit) {
    if (shots.length >= MAX_SHOTS) shots.shift();
    const d = distance(unit, target);
    const muzzle = unit.vehicle ? 14 : 8;
    const hit = random() < (unit.vehicle ? .76 : .60) * (target.state === 'cover' ? .48 : 1);
    const duration = unit.vehicle ? limit(d / 155, .24, .8) : limit(d / 230, .14, .42);
    shots.push({
      x: unit.x + Math.cos(unit.angle) * muzzle, y: unit.y + Math.sin(unit.angle) * muzzle,
      endX: target.x + (hit ? 0 : range(-12, 12)), endY: target.y + (hit ? 0 : range(-12, 12)),
      elapsed: 0, duration, target, hit, team: unit.team, shell: unit.vehicle, damage: unit.damage,
    });
    unit.cooldown = unit.fireRate * range(.82, 1.26);
    unit.recoil = unit.vehicle ? .32 : .17;
    unit.fireAngle = unit.angle;
    unit.firing = 0;
    options.onCue?.(unit.vehicle ? 'cannon' : 'rifle');
  }

  function supportTeam(unit: Unit, dt: number) {
    let patient = null, closest = Infinity;
    for (const ally of units) {
      if (ally.team !== unit.team || ally.hp <= 0 || ally.hp >= ally.maxHp || ally.vehicle || ally.support) continue;
      const d = distance(unit, ally);
      if (d < closest) { patient = ally; closest = d; }
    }
    const retreatEdge = W * (unit.team === 0 ? .34 : .66);
    const assistX = patient ? (unit.team === 0 ? Math.min(patient.x - 7, retreatEdge) : Math.max(patient.x + 7, retreatEdge)) : retreatEdge;
    unit.state = patient && closest < 18 ? 'support' : 'patrol';
    if (patient && unit.state === 'support' && unit.cooldown <= 0) {
      patient.hp = Math.min(patient.hp + 1, patient.maxHp);
      patient.suppression = Math.max(0, patient.suppression - .4);
      unit.cooldown = 2.1;
      unit.firing = 0;
    }
    const assistY = patient?.y ?? ground(unit.lane);
    if (Math.hypot(unit.x - assistX, unit.y - assistY) > 3) move(unit, assistX, assistY, dt, .68);
  }

  function signalTeam(unit: Unit, dt: number) {
    const crew = unit.definition.role === 'crew';
    const vehicle = crew ? units.find(ally => ally.team === unit.team && ally.vehicle && ally.hp > 0) : null;
    const gap = vehicle ? vehicle.radius + unit.radius + 2 : 0;
    const destination = {
      x: vehicle ? vehicle.x - Math.cos(vehicle.angle) * gap : W * (unit.team === 0 ? .35 : .65),
      y: vehicle ? vehicle.y - Math.sin(vehicle.angle) * gap : ground(unit.lane),
    };
    unit.state = 'patrol';
    const route = unit.route;
    const atProjectedDestination = route?.points.length && route.index >= route.points.length
      && distance(route, destination) < 1;
    if (distance(destination, unit) > 4 && !atProjectedDestination) {
      move(unit, destination.x, destination.y, dt, .8);
    } else if (unit.cooldown <= 0) {
      unit.firing = 0;
      unit.cooldown = 2.6;
      unit.state = 'support';
    }
  }

  function update(unit: Unit, dt: number) {
    if (unit.hp <= 0) return;
    unit.moving = false;
    unit.firing += dt;
    unit.recoil = Math.max(0, unit.recoil - dt);
    unit.cooldown = Math.max(0, unit.cooldown - dt);
    unit.suppression = Math.max(0, unit.suppression - dt * .26);
    if (unit.airborne) unit.phase += dt * 24;
    if (unit.support) {
      if (unit.definition?.role === 'scout' || unit.definition?.role === 'crew') signalTeam(unit, dt);
      else supportTeam(unit, dt);
      return;
    }
    const target = chooseTarget(unit);
    const d = target ? distance(unit, target) : Infinity;
    const danger = !unit.vehicle && (unit.suppression > unit.morale || unit.hp <= 1 && d < 46 && unit.suppression > .18);
    if (danger && !unit.cover) unit.cover = shelter(unit, target);

    if (unit.cover) {
      if (!unitClear(unit, unit.cover.x, unit.cover.y, unit.cover.x, unit.cover.y, unit.radius)) {
        unit.cover = shelter(unit, target);
        if (!unit.cover) return;
      }
      const there = distance(unit, unit.cover) < 3;
      unit.state = there ? 'cover' : 'retreat';
      if (!there) move(unit, unit.cover.x, unit.cover.y, dt, 1.3);
      if ((there || !unit.moving) && unit.suppression < .19) unit.cover = null;
      else if (there && target && d < unit.range * .82 && unit.cooldown <= 0) {
        unit.angle = Math.atan2(target.y - unit.y, target.x - unit.x);
        fire(unit, target);
      }
      return;
    }

    if (target && d < unit.range) {
      unit.angle = Math.atan2(target.y - unit.y, target.x - unit.x);
      if (unit.focus !== target.id) {
        unit.focus = target.id;
        unit.cooldown = Math.max(.2, unit.cooldown);
        unit.state = 'acquire';
        return;
      }
      unit.state = unit.cooldown <= .18 || unit.recoil > 0 ? 'attack' : 'acquire';
      if (unit.cooldown <= 0) fire(unit, target);
      if (unit.airborne && d < unit.range * .6) {
        move(unit, unit.x - Math.cos(unit.angle) * 11, unit.y - Math.sin(unit.angle) * 11, dt, .42, false);
      }
      return;
    }

    unit.focus = null;
    if (target) {
      const bearing = Math.atan2(target.y - unit.y, target.x - unit.x);
      const flank = (unit.id % 3 - 1) * 12;
      const standOff = unit.range * .68;
      const x = target.x - Math.cos(bearing) * standOff - Math.sin(bearing) * flank;
      const y = target.y - Math.sin(bearing) * standOff + Math.cos(bearing) * flank;
      unit.state = 'advance';
      if (unit.radius && !terrainClear(unit.x, unit.y, x, y, unit.radius, unit.throughTrees)) {
        move(unit, target.x, target.y, dt);
      } else {
        move(unit, x, y, dt);
      }
    } else {
      unit.state = 'patrol';
      const patrolX = unit.goal + Math.sin(time * .65 + unit.id) * 10;
      move(unit, patrolX, ground(unit.lane), dt, .6);
    }
  }

  function addBlast(x: number, y: number, big: boolean, showRing: boolean) {
    if (showRing) {
      if (blasts.length >= MAX_BLASTS) blasts.shift();
      blasts.push({ x, y, big, age: 0 });
    }
    const count = big ? 7 : 3;
    for (let i = 0; i < count; i++) dust.push({ x, y, dx: range(-15, 15), dy: range(-15, 15), age: 0, life: range(.28, .64) });
    if (big) options.onCue?.('explosion');
  }

  function makeBloodStain(
    unit: Pick<Unit, 'id' | 'x' | 'y' | 'vehicle'>,
    shot: Pick<Shot, 'x' | 'y' | 'endX' | 'endY'>,
    lethal: boolean,
  ): BloodStain {
    // Use a separate stream so the effect cannot change the outcome of a seeded battle.
    const bloodSeed = seed + ':blood:' + unit.id;
    const randomBlood = randomFrom(lethal ? bloodSeed : bloodSeed + ':hit:' + time);
    const scale = lethal ? 1 : .45;
    const angle = Math.atan2(shot.endY - shot.y, shot.endX - shot.x);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const length = ((unit.vehicle ? 19 : 15) + randomBlood() * 4) * scale;
    const width = ((unit.vehicle ? 12 : 9) + randomBlood() * 3) * scale;
    const x = Math.round(unit.x), y = Math.round(unit.y);
    const cells = [];
    const reach = Math.ceil((length + 8) / 2) * 2;
    for (let dy = -reach; dy <= reach; dy += 2) {
      for (let dx = -reach; dx <= reach; dx += 2) {
        const along = dx * cos + dy * sin - 4 * scale;
        const across = -dx * sin + dy * cos;
        const radius = Math.hypot(along / length, across / width);
        const edge = .96 + .15 * Math.sin(Math.atan2(across, along) * 5) + randomBlood() * .17;
        if (radius > edge) continue;
        const shade = randomBlood();
        const color = radius > edge - .17 ? 0 : shade < .47 ? 1 : shade < .88 ? 2 : 3;
        const growth = .09 + .9 * Math.min(1, radius / edge);
        cells.push({ dx, dy, color, growth });
      }
    }
    const dropCount = lethal ? (unit.vehicle ? 19 : 27) : 12;
    const droplets = Array.from({ length: dropCount }, (_, index) => {
      const bearing = angle + (randomBlood() - .5) * (index < 5 ? 2.8 : 1.55);
      const range = (12 + randomBlood() * (unit.vehicle ? 35 : 31)) * scale;
      const size = index < 6 ? 3 + Math.floor(randomBlood() * 2) : 1 + Math.floor(randomBlood() * 2);
      return {
        dx: Math.cos(bearing) * range, dy: Math.sin(bearing) * range,
        size: lethal ? size : Math.max(1, size - 1),
        duration: (.13 + randomBlood() * .25) * (lethal ? 1 : .6),
      };
    });
    const colors = unit.vehicle ? VEHICLE_SPILL_COLORS : BLOOD_COLORS;
    const duration = lethal ? BLOOD_GROWTH : HIT_STAIN_GROWTH;
    return { x, y, at: time, colors, cells, droplets, duration };
  }

  function addBloodStain(unit: Unit, shot: Shot, lethal: boolean) {
    const stain = makeBloodStain(unit, shot, lethal);
    if (reducedMotion()) options.onSettledBlood?.(stain);
    else activeBlood.push(stain);
  }

  function wreckKind(unit: Unit): WreckKind | null {
    const kind = unit.definition?.kind;
    if (unit.definition?.mount || kind === 'mount') return 'horse';
    if (unit.airborne) return 'helicopter';
    if (kind === 'wheeled') return 'artillery';
    if (unit.sprite === 'm113') return 'carrier';
    if (kind === 'tracked') return 'tank';
    return null;
  }

  function addEquipmentWreck(
    unit: Pick<Unit, 'id' | 'x' | 'y' | 'angle' | 'definition' | 'sprite'> & { pose: Pick<VisualPose, 'angle'> },
    kind: WreckKind,
  ) {
    const profile = WRECK_PROFILES[kind];
    const randomWreck = randomFrom(seed + ':wreck:' + unit.id);
    const heading = unit.pose.angle;
    const x = profile.glide ? limit(unit.x + Math.cos(unit.angle) * profile.glide, 14, W - 14) : unit.x;
    const y = profile.glide ? limit(unit.y + Math.sin(unit.angle) * profile.glide, 14, H - 14) : unit.y;
    const hatchX = x + Math.cos(heading) * (profile.hatch ?? -3);
    const hatchY = y + Math.sin(heading) * (profile.hatch ?? -3);
    const preferredSide = randomWreck() < .5 ? -1 : 1;
    const exits = [preferredSide, -preferredSide].map(side => {
      const angle = heading + side * Math.PI / 2;
      return { x: limit(hatchX + Math.cos(angle) * profile.exit, 8, W - 8),
        y: limit(hatchY + Math.sin(angle) * profile.exit, 8, H - 8) };
    });
    const hatch = { x: hatchX, y: hatchY };
    const exit = distance(hatch, exits[0]) >= distance(hatch, exits[1]) - .5 ? exits[0] : exits[1];
    const exitAngle = Math.atan2(exit.y - hatchY, exit.x - hatchX);
    const fragments = Array.from({ length: profile.flare ? 26 : 0 }, (_, index) => {
      const angle = randomWreck() * Math.PI * 2;
      const reach = (14 + randomWreck() * 27) * profile.flare;
      return { dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach,
        size: index < 8 ? 3 : 1 + Math.floor(randomWreck() * 2) };
    });
    const smoke = Array.from({ length: profile.flare ? 14 : 0 }, (_, index) => {
      const drift = exitAngle + Math.PI + (randomWreck() - .5) * .9;
      const reach = 18 + randomWreck() * 24;
      return { delay: .12 + index * .12, dx: Math.cos(drift) * reach, dy: Math.sin(drift) * reach,
        size: 4 + Math.floor(randomWreck() * 7), duration: .82 + randomWreck() * .88 };
    });
    if (wrecks.length >= MAX_WRECKS) wrecks.shift();
    const wreck = { x, y, startX: unit.x, startY: unit.y, angle: heading,
      sprite: unit.definition?.mount ?? unit.sprite, at: time, kind, profile,
      crew: kind !== 'horse' || Boolean(unit.definition?.mount),
      rider: unit.definition?.mount ? unit.sprite : null, hatch, exit, exitAngle, fragments, smoke };
    wrecks.push(wreck);
    return wreck;
  }

  function finishOverview() {
    buildTerrain('ruins', true);
    const randomFinale = randomFrom(seed + ':overview-finale');
    const columns = 10, rows = 6;
    craters = Array.from({ length: columns * rows }, (_, index) => ({
      x: Math.round(W * (index % columns + .24 + randomFinale() * .52) / columns),
      y: Math.round(H * (Math.floor(index / columns) + .24 + randomFinale() * .52) / rows),
      radius: 5 + Math.floor(randomFinale() * 10),
      texture: Math.floor(randomFinale() * 7),
    }));
    for (const stain of activeBlood) options.onSettledBlood?.(stain);
    activeBlood = [];
    for (const [index, crater] of craters.entries()) {
      const { x, y } = crater;
      const angle = randomFinale() * Math.PI * 2;
      if (index % 3 !== 0) {
        options.onSettledBlood?.(makeBloodStain(
          { id: -index - 1, x: x + Math.round(Math.cos(angle) * 9), y: y + Math.round(Math.sin(angle) * 9), vehicle: false },
          { x, y, endX: x + Math.cos(angle), endY: y + Math.sin(angle) },
          true,
        ));
      }
      if (index % 7 === 4) {
        const sprite = index % 2 === 0 ? 't34' : 'stug';
        addEquipmentWreck({ id: -index - 1, x, y, angle, sprite, definition: roster[sprite], pose: { angle } }, 'tank');
      }
    }
    for (const wreck of wrecks) wreck.at = Math.min(wreck.at, time - 8);
    units = []; shots = []; blasts = []; dust = [];
    finished = true;
    setPaused(true);
  }

  function tick() {
    const dt = TICK_MS / 1000;
    time += dt;
    settleBloodStains();
    if (nuke) {
      const age = time - nuke.at;
      if (age >= nuke.flashPeak && biome !== nuke.nextBiome) buildTerrain(nuke.nextBiome, nuke.keepAftermath);
      if (age >= nuke.duration) {
        const keepAftermath = nuke.keepAftermath;
        nuke = null;
        if (keepAftermath) {
          finished = true;
          paused = true;
        } else {
          reinforcementsAt = time + 10;
          deployForces(true);
        }
        syncVehicleSound();
      }
      return;
    }
    searchesLeft = PATHS_PER_TICK;
    for (const unit of units) updateVisualPose(unit, dt);
    for (const shot of shots) {
      shot.elapsed += dt;
      if (shot.elapsed < shot.duration) continue;
      const target = shot.target;
      const impact = { x: shot.endX, y: shot.endY };
      const landed = shot.hit && target.hp > 0 && distance(target, impact) < (shot.shell ? 12 : 7);
      if (landed) {
        target.hp -= shot.damage;
        target.suppression += shot.shell ? .8 : .48;
        const lethal = target.hp <= 0;
        let bloodTarget = target;
        if (lethal) {
          const kind = wreckKind(target);
          target.removedAt = kind ? time : time + .42;
          if (kind) {
            const wreck = addEquipmentWreck(target, kind);
            if (kind === 'helicopter') bloodTarget = { ...target, x: wreck.x, y: wreck.y };
            if (!shot.shell && wreck.profile.flare) options.onCue?.('explosion');
          }
        }
        addBloodStain(bloodTarget, shot, lethal);
      }
      for (const unit of units) {
        if (unit.hp <= 0 || unit.team === shot.team || unit === target) continue;
        if (distance(unit, impact) < (shot.shell ? 20 : 9)) unit.suppression += shot.shell ? .58 : .2;
      }
      addBlast(impact.x, impact.y, shot.shell, !landed);
    }
    shots = shots.filter(shot => shot.elapsed < shot.duration);
    units = units.filter(unit => unit.removedAt === null || time < unit.removedAt);
    blasts = blasts.filter(blast => (blast.age += dt) < (blast.big ? .92 : .28));
    dust = dust.filter(particle => {
      particle.x += particle.dx * dt;
      particle.y += particle.dy * dt;
      particle.dx *= .95;
      particle.dy *= .95;
      return (particle.age += dt) < particle.life;
    });
    const activeByTeam = [0, 0], armorByTeam = [0, 0];
    for (const unit of units) {
      if (unit.support || unit.hp <= 0) continue;
      activeByTeam[unit.team]++;
      if (unit.vehicle) armorByTeam[unit.team]++;
    }
    const reservesAvailable = () => unitBudget
      ? TEAMS.some(team => spawnedByTeam[team] < unitBudget[team])
      : period.armoredBattle || reinforced < MAX_REINFORCEMENTS;
    const scheduledWave = time >= reinforcementsAt && reservesAvailable();
    for (const team of TEAMS) {
      if (activeByTeam[team] === 0) {
        eliminatedAt[team] ??= time;
        if (time - (eliminatedAt[team] ?? time) >= REDEPLOY_DELAY) {
          for (let lane = 0; lane < 3; lane++) {
            reinforceTeam(team, lane);
          }
          eliminatedAt[team] = null;
        }
        continue;
      }
      eliminatedAt[team] = null;
      const needsReserve = period.armoredBattle
        ? armorByTeam[team] < ARMOR_RESERVE_THRESHOLD : activeByTeam[team] <= 5;
      if (scheduledWave && needsReserve && reservesAvailable() && reinforceTeam(team)) reinforced++;
    }
    if (scheduledWave) {
      reinforcementsAt += 2.4 + random() * 1.4;
    }
    syncVehicleSound();
  }

  function settleBloodStains() {
    if (!activeBlood.length) return;
    const reduce = reducedMotion();
    // Keep only animations in memory. Settled pixels stay on the field until it is rebuilt.
    activeBlood = activeBlood.filter(stain => {
      if (!reduce && time - stain.at < stain.duration) return true;
      options.onSettledBlood?.(stain);
      return false;
    });
  }

  function whiteoutOpacity() {
    if (!nuke) return 0;
    const age = time - nuke.at;
    if (nuke.reduce) return !nuke.keepAftermath && age >= nuke.flashPeak && age <= REDUCED_FLASH_END ? 1 : 0;
    const flashStart = FLASH_START * nuke.timelineScale;
    if (age < nuke.flashPeak) return smooth((age - flashStart) / (nuke.flashPeak - flashStart));
    return 1 - smooth((age - FLASH_HOLD * nuke.timelineScale) / ((FLASH_END - FLASH_HOLD) * nuke.timelineScale));
  }

  function snapshot() {
    const active = units.filter(unit => unit.hp > 0);
    const counts = { advance: 0, patrol: 0, acquire: 0, attack: 0, retreat: 0, cover: 0, support: 0 };
    for (const unit of active) counts[unit.state]++;
    return {
      time: Math.round(time * 1000), seed, era, label: period.label, paused, counts,
      units: active.map(({ id, team, sprite, x, y, angle, hp, state, moving, vehicle, support }) => ({
        id, team, sprite, x: +x.toFixed(3), y: +y.toFixed(3), angle: +angle.toFixed(3), hp, state, moving, vehicle, support,
      })),
      shots: shots.length, explosions: blasts.length, reinforcements: reinforced,
      terrain: { biome, selection: biomeOverride ?? 'auto', total: terrain.length },
      nuke: { enabled: true, active: nuke !== null, count: nukeCount,
        age: nuke ? Math.round((time - nuke.at) * 1000) : null,
        remaining: nuke ? Math.max(0, Math.round((nuke.duration - time + nuke.at) * 1000)) : 0,
        whiteout: whiteoutOpacity() },
    };
  }

  function step(milliseconds = TICK_MS, stopAfterPausedEffect = false) {
    accumulator += limit(Number(milliseconds) || 0, 0, 60000);
    while (!finished && accumulator >= TICK_MS) {
      tick();
      accumulator -= TICK_MS;
      if (!nuke && !finished && options.finaleAt !== undefined && Math.round(time * 1000) >= options.finaleAt) {
        finishOverview();
      }
      if (!nuke && !finished && options.aftermathAt !== undefined && Math.round(time * 1000) >= options.aftermathAt) {
        triggerNuke('aftermath');
      }
      if (stopAfterPausedEffect && !nuke) {
        accumulator = 0;
        break;
      }
    }
    if (finished) accumulator = 0;
  }

  function setPaused(value: boolean) {
    paused = value;
    syncVehicleSound();
  }

  function dispose() {
    nuke = null;
    setPaused(true);
  }

  function frame() {
    return {
      width: W, height: H, scenario: era, reducedMotion: reducedMotion(), time, biome, terrain, units, shots, blasts, dust,
      activeBlood, wrecks, nuke, craters, landscape,
      interpolation: reducedMotion() ? 1 : accumulator / TICK_MS, whiteout: whiteoutOpacity(), finished,
    };
  }

  reset(options.seed ?? 1846, options.scenario);
  return { setPaused, reset, step, snapshot, frame, setBiome, triggerNuke, dispose };
}

export type Battle = ReturnType<typeof createBattle>;
export type BattleFrame = ReturnType<Battle['frame']>;
