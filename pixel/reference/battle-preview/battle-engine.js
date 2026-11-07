(() => {
  'use strict';

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
  const CITY_ROAD = [[15, '#82776b'], [14, '#635b55'], [12, '#36383b']];
  const VILLAGE_ROAD = [[14, '#66583b'], [12, '#96784d']];
  // Solid shapes in 32-pixel tiles. A fifth value marks a tree; shrubs have no footprint.
  const terrainFootprints = {
    desert: { 1: [], 3: [[10, 9, 29, 24], [16, 4, 27, 11], [14, 22, 28, 28]] },
    snow: { 1: [[4, 4, 18, 17, true], [14, 15, 29, 29, true]],
      3: [[7, 4, 22, 16], [4, 18, 13, 26], [19, 18, 29, 29, true]] },
    ruins: { 1: [[5, 4, 27, 28]], 3: [[5, 5, 27, 20], [4, 19, 15, 28]] },
    village: { 1: [[4, 6, 29, 25]], 3: [[6, 6, 26, 28]] },
  };
  const BIOMES = ['desert', 'snow', 'ruins', 'village'];
  const SCENE_BIOMES = {
    xix: 'village', world: 'ruins', modern: 'village',
    'south-carolina': 'village', palestine: 'desert', 'western-front': 'ruins',
    'eastern-front': 'snow', 'tank-battle': 'snow', vietnam: 'village',
  };
  const GROUND_COLORS = {
    desert: ['#8d7150', '#9b7d57', '#a48761', '#6a513b'],
    snow: ['#809596', '#a0b0ac', '#b6c2bd', '#334a42'],
    ruins: ['#555453', '#63605c', '#756b61', '#353637'],
    village: ['#596343', '#687149', '#83734e', '#484936'],
  };
  const MAX_REINFORCEMENTS = 8;
  const ARMOR_RESERVE_THRESHOLD = 4;
  const REDEPLOY_DELAY = .8;
  const MAX_SHOTS = 64;
  const MAX_BLASTS = 18;
  const MAX_WRECKS = 14;
  const TANK_BLAST_END = .48;
  const TANK_SMOKE_END = 3.6;
  const WRECK_PROFILES = {
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
  const PERIODS = {
    xix: { soldiers: [0, 1], support: null, vehicles: [4, 4], speed: 13, fire: 1.8, label: 'XIX век' },
    world: { soldiers: [2, 4], support: 2, vehicles: [5, 6], speed: 18, fire: .8, label: 'Мировые войны' },
    modern: { soldiers: [3, 5], support: 3, vehicles: [7, null], speed: 20, fire: .65, label: 'После 1945 года' },
  };
  const VEHICLES = {
    4: { speed: 6, range: 103, health: 5, rate: 3.2, damage: 2 },
    5: { speed: 9, range: 78, health: 7, rate: 2.3, damage: 2 },
    6: { speed: 11, range: 100, health: 9, rate: 2.5, damage: 3 },
    7: { speed: 23, range: 89, health: 6, rate: 1.7, damage: 2 },
  };
  const ERA_ALIASES = { '19th': 'xix', ww: 'world', wars: 'world', postwar: 'modern' };
  const ease = (a, b, fraction) => a + (b - a) * fraction;
  const turnBetween = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
  const limit = (n, low, high) => Math.min(Math.max(n, low), high);
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const isObjectTile = variant => variant === 1 || variant === 3;
  const canCrossTrees = (definition, sprite) => definition?.kind === 'tracked' && sprite !== 'm113'
    || !definition && (sprite === 5 || sprite === 6);
  const smooth = value => {
    const t = limit(value, 0, 1);
    return t * t * (3 - 2 * t);
  };

  function randomFrom(seed) {
    let value = 2166136261;
    for (const char of String(seed)) value = Math.imul(value ^ char.codePointAt(0), 16777619);
    return () => {
      value = (value + 0x6D2B79F5) | 0;
      let next = Math.imul(value ^ (value >>> 15), value | 1);
      next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
      return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
    };
  }

  function prepareSheet(image, columns, rows) {
    if (!image?.naturalWidth || !image?.naturalHeight) return null;
    const w = Math.floor(image.naturalWidth / columns);
    const h = Math.floor(image.naturalHeight / rows);
    const frames = Array.from({ length: columns * rows }, (_, index) => ({
      x: (index % columns) * w, y: Math.floor(index / columns) * h, w, h,
    }));
    return { image, frames };
  }

  function crossesRect(x, y, endX, endY, rect, radius) {
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

  function createAtlasBattle(canvas, options = {}) {
    const scale = Math.min(1, 400 / canvas.width);
    canvas.width = Math.max(160, Math.round(canvas.width * scale));
    canvas.height = Math.max(120, Math.round(canvas.height * scale));
    const ctx = canvas.getContext('2d', { alpha: true });
    const W = canvas.width;
    const H = canvas.height;
    const navCols = Math.ceil(W / NAV_CELL), navRows = Math.ceil(H / NAV_CELL);
    const tileCols = Math.ceil(W / TILE_SIZE), tileRows = Math.ceil(H / TILE_SIZE);
    const navigation = new Map();
    let obstacles, searchesLeft;
    const bloodCanvas = canvas.ownerDocument?.createElement('canvas') ?? new OffscreenCanvas(W, H);
    bloodCanvas.width = W;
    bloodCanvas.height = H;
    const bloodContext = bloodCanvas.getContext('2d');
    const catalog = options.roster;
    const periods = catalog?.scenarios ?? PERIODS;
    const infantry = prepareSheet(options.infantrySprites, 5, 4);
    const vehicles = prepareSheet(options.vehicleSprites, 4, 3);
    const terrainAtlas = prepareSheet(options.terrainSprites, 4, 4);
    const roadAtlas = prepareSheet(options.roadSprites, 16, 2);
    const nukeAtlas = prepareSheet(options.nukeSprites, 2, 2);
    const crewAtlas = prepareSheet(options.tankCrewSprites, 4, 1);
    const equipmentWreckAtlas = prepareSheet(options.equipmentWreckSprites, 4, 2);
    const effectCanvas = options.effectCanvas;
    const effectContext = effectCanvas?.getContext('2d');
    const reducedMotion = () => typeof options.reducedMotion === 'function' ? options.reducedMotion() : options.reducedMotion;
    const unitSprites = new Map();
    let infantryIndex = 0, vehicleIndex = 0;
    for (const [id, definition] of Object.entries(catalog?.units ?? {})) {
      const atlas = definition.sheet ? vehicles : infantry;
      const index = definition.sheet ? vehicleIndex++ : infantryIndex++;
      if (atlas?.frames[index]) unitSprites.set(id, { atlas, index });
    }
    let seed, era, period, random, units, covers, shots, blasts, dust, terrain, biome, activeBlood, wrecks;
    let biomeOverride = BIOMES.includes(options.biome) ? options.biome : null;
    let time, accumulator, nextId, reinforced, reinforcementsAt, paused = !!options.paused;
    let eliminatedAt;
    let nuke, nukeCount;
    let frameId = 0, lastFrame = null;
    let audibleVehicles;

    const range = (min, max) => ease(min, max, random());
    const ground = lane => H * (.18 + lane * .32);

    function buildTerrain(nextBiome) {
      biome = nextBiome;
      activeBlood = [];
      bloodContext.clearRect(0, 0, W, H);
      wrecks = [];
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
      indexTerrain();
      if (!navigationFor(13).spanning) {
        // Open the least obstructed interior row only when heavy units cannot cross the field.
        const rows = Array.from({ length: Math.floor(H / TILE_SIZE) - 2 }, (_, index) => index + 1);
        const score = row => obstacles.slice(row * tileCols, (row + 1) * tileCols)
          .filter(shapes => shapes.length).length + Math.abs(row * TILE_SIZE + TILE_SIZE / 2 - H / 2) / H;
        const row = rows.reduce((best, candidate) => score(candidate) < score(best) ? candidate : best);
        for (let col = 0; col < tileCols; col++) {
          const index = row * tileCols + col;
          if (obstacles[index].length) terrain[index].variant = 2;
        }
        indexTerrain();
      }
    }

    function layoutSettlement(random) {
      const roads = new Map();
      const lastCol = tileCols - 1, lastRow = tileRows - 1;
      const lastFullRow = Math.floor(H / TILE_SIZE) - 1;
      const integer = (low, high) => low + Math.floor(random() * (Math.max(low, high) - low + 1));
      const main = integer(lastFullRow > 4 ? 2 : 1, Math.max(1, lastFullRow - 2));

      function street(col, row, endCol, endRow) {
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
        const shapes = terrainAtlas ? terrainFootprints[biome][variant] : [[7, 8, 24, 24]];
        if (shapes.length && x > W * .16 && x + TILE_SIZE < W * .84 && y + TILE_SIZE < H) {
          covers.push({ x: x + TILE_SIZE / 2, y: y + TILE_SIZE / 2 });
        }
        return shapes.map(([left, top, right, bottom, tree]) => [x + left, y + top, x + right, y + bottom, tree]);
      });
    }

    function setBiome(value) {
      if (nuke || (value !== 'auto' && !BIOMES.includes(value))) return false;
      biomeOverride = value === 'auto' ? null : value;
      const nextBiome = biomeOverride ?? SCENE_BIOMES[era] ?? 'village';
      if (nextBiome === biome) return true;
      buildTerrain(nextBiome);
      const previous = units;
      units = [];
      for (const unit of previous) {
        if (unit.hp <= 0) continue;
        const position = spawnPosition(unit.x, unit.y, unit.radius, unit.throughTrees);
        if (!position) continue;
        Object.assign(unit, position, { cover: null, route: null, yielding: null, passing: null, trail: [], intent: null, yieldRetryAt: 0 });
        resetVisualPose(unit);
        units.push(unit);
      }
      draw();
      return true;
    }

    function terrainClear(x, y, endX, endY, radius, throughTrees = false) {
      if (endX < radius || endX > W - radius || endY < radius || endY > H - radius) return false;
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

    function unitBlocker(unit, x, y, endX, endY, radius) {
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

    function unitClear(unit, x, y, endX, endY, radius) {
      return !unitBlocker(unit, x, y, endX, endY, radius);
    }

    function navigationFor(radius, throughTrees = false) {
      const key = throughTrees ? -radius : radius;
      if (navigation.has(key)) return navigation.get(key);
      const points = Array.from({ length: navCols * navRows }, (_, index) => {
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

    function nearestCell(grid, x, y, accept) {
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

    function spawnPosition(x, y, radius, throughTrees = false, team = null) {
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

    function findRoute(unit, x, y) {
      const { radius, throughTrees } = unit;
      const grid = navigationFor(radius, throughTrees);
      const start = nearestCell(grid, unit.x, unit.y,
        point => terrainClear(unit.x, unit.y, point.x, point.y, radius, throughTrees));
      if (start < 0) return [];
      const region = grid.points[start].region;
      const accepts = point => point.region === region;
      const exact = terrainClear(x, y, x, y, radius, throughTrees)
        ? nearestCell(grid, x, y, point => accepts(point) && terrainClear(point.x, point.y, x, y, radius, throughTrees))
        : -1;
      const goal = exact >= 0 ? exact : nearestCell(grid, x, y, accepts);
      const scores = new Int32Array(grid.points.length).fill(-1);
      const parents = new Int32Array(grid.points.length).fill(-1);
      const goalPoint = grid.points[goal];
      const open = [start];
      scores[start] = 0;
      const heuristic = index => Math.abs(grid.points[index].col - goalPoint.col) + Math.abs(grid.points[index].row - goalPoint.row);
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
      const path = [];
      if (exact >= 0) path.push({ x, y });
      for (let index = goal; index >= 0; index = parents[index]) path.push(grid.points[index]);
      return path.reverse();
    }

    function routeWaypoint(unit, x, y) {
      const clear = point => terrainClear(unit.x, unit.y, point.x, point.y, unit.radius, unit.throughTrees);
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

    function fighter(team, index = nextId) {
      const available = period.teams?.[team].fighters;
      return available ? available[index % available.length] : period.soldiers[team];
    }

    function spawn(team, sprite = fighter(team), support = false, fromEdge = false, lane = Math.floor(random() * 3), isVehicle = false) {
      const definition = catalog?.units[sprite];
      const vehicle = definition?.stats ?? (isVehicle ? VEHICLES[sprite] : null);
      const angle = team === 0 ? 0 : Math.PI;
      const x = fromEdge ? (team === 0 ? range(4, W * .1) : range(W * .9, W - 4))
        : (team === 0 ? range(W * .07, W * .25) : range(W * .75, W * .93));
      const y = ground(lane) + range(-H * .09, H * .09);
      const airborne = definition?.kind === 'airborne' || isVehicle && sprite === 7;
      const radius = airborne ? 0 : vehicle ? 13 : definition?.mount ? 8 : 6;
      const throughTrees = !!vehicle && canCrossTrees(definition, sprite);
      const position = spawnPosition(x, y, radius, throughTrees, team);
      if (!position) return false;
      const hp = vehicle?.health ?? (support ? 4 : 3);
      const unit = {
        id: ++nextId, team, sprite, definition, vehicle: !!vehicle, airborne, radius, throughTrees,
        support, lane, ...position, angle, hp, maxHp: hp, morale: range(.62, 1),
        state: 'advance', speed: (vehicle?.speed ?? definition?.speed ?? period.speed) * range(.82, 1.18),
        range: (vehicle?.range ?? definition?.range ?? period.range ?? (era === 'xix' ? 52 : 72)) * range(.9, 1.12) * W / 400,
        fireRate: (vehicle?.rate ?? period.fire) * range(.85, 1.22), damage: vehicle?.damage ?? 1,
        cooldown: range(.3, 1.4), suppression: 0, phase: range(0, 4), moving: false,
        recoil: 0, firing: Infinity, cover: null, goal: W * (team === 0 ? range(.38, .48) : range(.52, .62)),
        focus: null, removedAt: null, route: null,
      };
      resetVisualPose(unit);
      units.push(unit);
      return true;
    }

    function resetVisualPose(unit) {
      unit.pose = {
        x: unit.x, y: unit.y, phase: unit.phase,
        angle: unit.angle, priorAngle: unit.angle, heading: unit.angle,
        motion: 0, priorMotion: 0, recoil: 0, priorRecoil: 0,
      };
    }

    function updateVisualPose(unit, dt) {
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

    function reset(value = seed, nextEra = era) {
      seed = String(value ?? '1846');
      const normalized = ERA_ALIASES[nextEra] ?? nextEra;
      era = Object.hasOwn(periods, normalized) ? normalized : Object.keys(periods)[0];
      period = periods[era];
      random = randomFrom(seed + ':' + era);
      units = []; shots = []; blasts = []; dust = [];
      time = 0; accumulator = 0; nextId = 0; reinforced = 0; reinforcementsAt = 10;
      nuke = null; nukeCount = 0;
      lastFrame = null;
      buildTerrain(biomeOverride ?? SCENE_BIOMES[era] ?? 'village');
      deployForces();
      syncVehicleSound();
      draw();
    }

    function deployForces(fromEdge = false) {
      eliminatedAt = [null, null];
      for (let lane = 0; lane < 3; lane++) {
        if (period.armoredBattle && lane === 1) continue;
        for (let team = 0; team < 2; team++) {
          spawn(team, fighter(team, lane * 2), false, fromEdge, lane);
          if (!period.armoredBattle) spawn(team, fighter(team, lane * 2 + 1), false, fromEdge, lane);
        }
      }
      for (let team = 0; team < 2; team++) {
        if (period.teams) {
          const side = period.teams[team];
          side.vehicles.forEach((id, index) => spawn(team, id, false, fromEdge, (team + index + 1) % 3, true));
          side.support.forEach(id => spawn(team, id, true, fromEdge, team));
          continue;
        }
        const vehicle = period.vehicles[team];
        if (vehicle != null) spawn(team, vehicle, false, fromEdge, 1 + team, true);
        if (period.support != null) spawn(team, period.support, true, fromEdge, team);
      }
    }

    function reinforceTeam(team, lane) {
      if (!period.armoredBattle) return spawn(team, fighter(team, lane ?? nextId), false, true, lane);
      const armor = period.teams[team].vehicles;
      return spawn(team, armor[nextId % armor.length], false, true, lane, true);
    }

    function triggerNuke() {
      if (nuke) return false;
      if (paused) lastFrame = null;
      const nextBiome = BIOMES[(BIOMES.indexOf(biome) + 1) % BIOMES.length];
      const effectRandom = randomFrom(seed + ':nuke:' + nukeCount);
      const sparks = Array.from({ length: 58 }, () => {
        const angle = effectRandom() * Math.PI * 2;
        return { angle, reach: .14 + effectRandom() * .84, size: 1 + Math.floor(effectRandom() * 4) };
      });
      const reduce = reducedMotion();
      nuke = { at: time, x: W * range(.43, .57), y: H * .5, nextBiome, reduce, sparks,
        flashPeak: reduce ? REDUCED_FLASH_PEAK : FLASH_PEAK };
      nukeCount++;
      units = []; shots = []; blasts = []; dust = [];
      syncVehicleSound();
      options.onCue?.('nuke');
      draw();
      schedule();
      return true;
    }

    function tryStep(unit, angle, amount, face, remember) {
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

    function yieldSpace(unit, stride, face) {
      const yielding = unit.yielding;
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

    function move(unit, x, y, dt, factor = 1, face = true) {
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

    function shelter(unit, threat) {
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

    function chooseTarget(unit) {
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

    function fire(unit, target) {
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

    function supportTeam(unit, dt) {
      let patient = null, closest = Infinity;
      for (const ally of units) {
        if (ally.team !== unit.team || ally.hp <= 0 || ally.hp >= ally.maxHp || ally.vehicle || ally.support) continue;
        const d = distance(unit, ally);
        if (d < closest) { patient = ally; closest = d; }
      }
      const retreatEdge = W * (unit.team === 0 ? .34 : .66);
      const assistX = patient ? (unit.team === 0 ? Math.min(patient.x - 7, retreatEdge) : Math.max(patient.x + 7, retreatEdge)) : retreatEdge;
      unit.state = patient && closest < 18 ? 'support' : 'patrol';
      if (unit.state === 'support' && unit.cooldown <= 0) {
        patient.hp = Math.min(patient.hp + 1, patient.maxHp);
        patient.suppression = Math.max(0, patient.suppression - .4);
        unit.cooldown = 2.1;
        unit.firing = 0;
      }
      const assistY = patient?.y ?? ground(unit.lane);
      if (Math.hypot(unit.x - assistX, unit.y - assistY) > 3) move(unit, assistX, assistY, dt, .68);
    }

    function signalTeam(unit, dt) {
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

    function update(unit, dt) {
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

    function addBlast(x, y, big, showRing) {
      if (showRing) {
        if (blasts.length >= MAX_BLASTS) blasts.shift();
        blasts.push({ x, y, big, age: 0 });
      }
      const count = big ? 7 : 3;
      for (let i = 0; i < count; i++) dust.push({ x, y, dx: range(-15, 15), dy: range(-15, 15), age: 0, life: range(.28, .64) });
      if (big) options.onCue?.('explosion');
    }

    function addBloodStain(unit, shot, lethal) {
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
      const stain = { x, y, at: time, colors, cells, droplets, duration };
      if (reducedMotion()) drawBloodStain(stain, duration, bloodContext);
      else activeBlood.push(stain);
    }

    function wreckKind(unit) {
      const kind = unit.definition?.kind;
      if (unit.definition?.mount || kind === 'mount') return 'horse';
      if (unit.airborne) return 'helicopter';
      if (kind === 'wheeled' || !kind && unit.vehicle && unit.sprite === 4) return 'artillery';
      if (unit.sprite === 'm113') return 'carrier';
      if (kind === 'tracked' || !kind && unit.vehicle && (unit.sprite === 5 || unit.sprite === 6)) return 'tank';
      return null;
    }

    function addEquipmentWreck(unit, kind) {
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

    function tick() {
      const dt = TICK_MS / 1000;
      time += dt;
      settleBloodStains();
      if (nuke) {
        const age = time - nuke.at;
        if (age >= nuke.flashPeak && biome !== nuke.nextBiome) buildTerrain(nuke.nextBiome);
        if (age >= NUKE_DURATION) {
          nuke = null;
          reinforcementsAt = time + 10;
          deployForces(true);
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
      const reservesAvailable = () => period.armoredBattle || reinforced < MAX_REINFORCEMENTS;
      const scheduledWave = time >= reinforcementsAt && reservesAvailable();
      for (let team = 0; team < 2; team++) {
        if (activeByTeam[team] === 0) {
          eliminatedAt[team] ??= time;
          if (time - eliminatedAt[team] >= REDEPLOY_DELAY) {
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

    function drawFrame(atlas, index, x, y, width, height, target = ctx) {
      const frame = atlas.frames[index];
      target.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, x, y, width, height);
    }

    function drawRoad({ x, y, road }) {
      const city = biome === 'ruins';
      if (roadAtlas) {
        // The graph stores E/S/W/N in bits 0–3. The atlas columns start with N.
        const mask = ((road & 7) << 1) | (road >> 3);
        drawFrame(roadAtlas, (city ? 0 : 16) + mask, x, y, TILE_SIZE, TILE_SIZE);
        return;
      }
      const middle = TILE_SIZE / 2;
      for (const [half, color] of city ? CITY_ROAD : VILLAGE_ROAD) {
        const size = half * 2;
        ctx.fillStyle = color;
        ctx.fillRect(x + middle - half, y + middle - half, size, size);
        if (road & 1) ctx.fillRect(x + middle, y + middle - half, middle, size);
        if (road & 2) ctx.fillRect(x + middle - half, y + middle, size, middle);
        if (road & 4) ctx.fillRect(x, y + middle - half, middle, size);
        if (road & 8) ctx.fillRect(x + middle - half, y, size, middle);
      }
      if (road !== 5 && road !== 10) return;
      if (city) {
        ctx.fillStyle = '#92867b';
        if (road === 5) ctx.fillRect(x + 10, y + 15, 11, 1);
        else ctx.fillRect(x + 15, y + 10, 1, 11);
      } else {
        ctx.fillStyle = '#ac8a57';
        if (road === 5) {
          ctx.fillRect(x, y + 10, TILE_SIZE, 2);
          ctx.fillRect(x, y + 20, TILE_SIZE, 2);
        } else {
          ctx.fillRect(x + 10, y, 2, TILE_SIZE);
          ctx.fillRect(x + 20, y, 2, TILE_SIZE);
        }
      }
    }

    function field() {
      const row = BIOMES.indexOf(biome) * 4;
      const colors = GROUND_COLORS[biome];
      for (const { x, y, variant, flipX, flipY } of terrain) {
        if (terrainAtlas) {
          drawFrame(terrainAtlas, row + variant, x, y, TILE_SIZE, TILE_SIZE);
          continue;
        }
        ctx.fillStyle = colors[0];
        ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = colors[1];
        ctx.fillRect(x + (flipX ? 4 : 17), y + (flipY ? 7 : 20), 9, 2);
        if (!isObjectTile(variant)) continue;
        ctx.fillStyle = colors[3];
        ctx.fillRect(x + 7, y + 8, 17, 16);
        ctx.fillStyle = colors[2];
        ctx.fillRect(x + 8, y + 8, 15, 5);
      }
      for (const tile of terrain) if (tile.road) drawRoad(tile);
    }

    function settleBloodStains() {
      if (!activeBlood.length) return;
      const reduce = reducedMotion();
      // Keep only animations in memory. Settled pixels stay on the field until it is rebuilt.
      activeBlood = activeBlood.filter(stain => {
        if (!reduce && time - stain.at < stain.duration) return true;
        drawBloodStain(stain, stain.duration, bloodContext);
        return false;
      });
    }

    function drawBloodStain(stain, age, target, airborne = false) {
      if (!airborne) {
        const growth = ease(.18, 1, smooth(age / stain.duration));
        for (const { dx, dy, color, growth: threshold } of stain.cells) {
          if (threshold > growth) continue;
          target.fillStyle = stain.colors[color];
          target.fillRect(stain.x + dx, stain.y + dy, 2, 2);
        }
      }
      for (const drop of stain.droplets) {
        const progress = limit(age / drop.duration, 0, 1);
        if ((progress < 1) !== airborne) continue;
        const travel = 1 - (1 - progress) ** 2;
        const x = Math.round(stain.x + drop.dx * travel);
        const y = Math.round(stain.y + drop.dy * travel);
        target.fillStyle = stain.colors[progress < 1 ? 3 : 0];
        target.fillRect(x, y, drop.size, drop.size);
        if (drop.size >= 3) {
          target.fillStyle = progress < .65 ? '#ef4750' : stain.colors[2];
          target.fillRect(x, y, drop.size - 1, 1);
        }
      }
    }

    function pixelUnit(unit) {
      const dark = unit.team === 0 ? '#33434a' : '#53402d';
      const light = unit.team === 0 ? '#899a9b' : '#b19c73';
      if (unit.vehicle) {
        ctx.fillStyle = '#1b1b17';
        ctx.fillRect(-12, -9, 23, 4);
        ctx.fillRect(-12, 5, 23, 4);
        ctx.fillStyle = dark;
        ctx.fillRect(-11, -5, 22, 10);
        ctx.fillStyle = light;
        ctx.fillRect(-3, -4, 8, 8);
        ctx.fillRect(4, -1, 12, 2);
        return;
      }
      ctx.fillStyle = dark;
      ctx.fillRect(-5, -5, 9, 10);
      ctx.fillStyle = light;
      ctx.fillRect(-3, -3, 6, 6);
      ctx.fillRect(2, -4, 7, 2);
    }

    function drawUnit(unit, alpha) {
      const pose = unit.pose;
      const x = ease(pose.x, unit.x, alpha), y = ease(pose.y, unit.y, alpha);
      const angle = pose.priorAngle + turnBetween(pose.priorAngle, pose.angle) * alpha;
      const phase = ease(pose.phase, unit.phase, alpha);
      const motion = ease(pose.priorMotion, pose.motion, alpha);
      const gait = Math.round(Math.sin(phase * 1.57) * motion);
      const mounted = unit.definition?.mount;
      const size = unit.airborne ? 36 : unit.vehicle ? 31 : mounted ? 26 : 18;
      const recoil = ease(pose.priorRecoil, pose.recoil, alpha) * (unit.vehicle ? 8 : 5);
      ctx.save();
      ctx.globalAlpha = unit.hp <= 0 ? limit((unit.removedAt - time) / .42, .05, 1) : 1;
      ctx.fillStyle = '#14161790';
      const shadowOffset = unit.airborne ? 7 : 2;
      ctx.fillRect(x - size * .25 + shadowOffset, y + 3, size * .55, unit.vehicle ? 6 : 4);
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.translate(-recoil, 0);
      const sprite = unitSprites.get(unit.sprite);
      const mount = unitSprites.get(mounted);
      if (mount) drawFrame(mount.atlas, mount.index, -13, -13, 26, 26);
      if (sprite) {
        const actorSize = mounted ? 16 : size - (unit.state === 'cover' ? 3 : 0);
        const step = !unit.vehicle && !mounted ? gait : 0;
        drawFrame(sprite.atlas, sprite.index, -actorSize / 2, -actorSize / 2 + step, actorSize, actorSize);
      } else {
        pixelUnit(unit);
      }
      if (unit.definition?.kind === 'wheeled') drawGunCrew(unit, gait);
      if (unit.airborne) {
        ctx.save();
        ctx.rotate(phase * .72);
        ctx.fillStyle = '#c9c5a390';
        ctx.fillRect(-15, -1, 30, 2);
        ctx.restore();
      }
      if (motion > .06 && unit.vehicle && !unit.airborne && unit.definition?.kind !== 'wheeled') {
        ctx.save();
        ctx.globalAlpha *= motion;
        ctx.fillStyle = '#cec09b80';
        ctx.fillRect(-9 + gait, -7, 2, 1);
        ctx.fillRect(-9 - gait, 6, 2, 1);
        ctx.restore();
      }
      ctx.restore();
      if (unit.hp > 0 && unit.recoil > (unit.vehicle ? .24 : .11)) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(unit.fireAngle ?? unit.angle);
        ctx.fillStyle = '#ffdb8e';
        ctx.fillRect(unit.vehicle ? 14 : 8, -1, unit.vehicle ? 5 : 3, 2);
        ctx.restore();
      }
    }

    function drawGunCrew(unit, gait) {
      const infantry = unitSprites.get(fighter(unit.team, unit.id));
      if (!infantry) return;
      const firing = unit.firing < .19;
      const loading = unit.cooldown < .32 && !firing;
      for (const side of [-1, 1]) {
        const step = gait * side;
        const back = firing ? 2 : loading && side > 0 ? -2 : 0;
        ctx.save();
        ctx.translate((side < 0 ? -7 : -3) + step - back, side * (loading ? 8 : 9));
        ctx.rotate((loading ? -.37 : -.15) * side);
        drawFrame(infantry.atlas, infantry.index, -7, -7, 14, 14);
        ctx.restore();
      }
    }

    function drawWreckHull(wreck, age) {
      const x = Math.round(wreck.x), y = Math.round(wreck.y);
      const horse = wreck.kind === 'horse';
      ctx.save();
      if (horse) {
        ctx.fillStyle = '#14161745';
        ctx.fillRect(x - 9, y + 3, 18, 4);
      } else {
        ctx.fillStyle = '#231719a0';
        ctx.fillRect(x - 15, y - 8, 30, 16);
        ctx.fillRect(x - 10, y - 12, 20, 24);
      }
      ctx.fillStyle = '#332624';
      for (const { dx, dy, size } of wreck.fragments.slice(0, 8)) {
        ctx.fillRect(Math.round(x + dx), Math.round(y + dy), size, size);
      }
      ctx.translate(x, y);
      ctx.rotate(wreck.angle);
      const { column, size } = wreck.profile;
      if (equipmentWreckAtlas && column !== undefined) {
        const row = age >= (horse ? .85 : 1.52) ? 1 : 0;
        drawFrame(equipmentWreckAtlas, row * 4 + column, -size / 2, -size / 2, size, size);
        ctx.restore();
        return;
      }
      const sprite = unitSprites.get(wreck.sprite);
      if (sprite) {
        if (!horse) ctx.filter = 'brightness(.63) saturate(.42) sepia(.25)';
        drawFrame(sprite.atlas, sprite.index, -Math.floor(size / 2), -Math.floor(size / 2), size, size);
        ctx.filter = 'none';
      } else if (horse) {
        ctx.fillStyle = '#634131';
        ctx.fillRect(-10, -4, 20, 8);
        ctx.fillRect(7, -2, 7, 4);
        ctx.fillRect(-7, 3, 3, 4);
      } else {
        ctx.fillStyle = '#292022';
        ctx.fillRect(-12, -8, 24, 16);
        ctx.fillStyle = '#59413b';
        ctx.fillRect(-8, -5, 16, 10);
        ctx.fillRect(3, -1, 14, 2);
      }
      if (wreck.kind !== 'tank') {
        ctx.restore();
        return;
      }
      ctx.fillStyle = '#bf5935';
      ctx.fillRect(-10, 3, 5, 1);
      ctx.fillRect(3, -6, 2, 2);
      ctx.fillStyle = '#100d10';
      ctx.fillRect(-6, -3, 6, 6);
      ctx.fillStyle = '#6f574b';
      ctx.fillRect(-7, -4, 8, 2);
      if (age >= TANK_BLAST_END && age < 1.2) {
        ctx.globalAlpha = 1 - smooth((age - .82) / .38);
        ctx.fillStyle = '#e69e5a';
        ctx.fillRect(-6, -4, 6, 1);
        ctx.fillRect(-7, -3, 1, 4);
        ctx.fillRect(0, -1, 1, 3);
      }
      ctx.restore();
    }

    function drawWreckCrew(wreck, age) {
      const horse = wreck.kind === 'horse';
      if (!wreck.crew || age < (horse ? .1 : TANK_BLAST_END)) return;
      const phase = age < .8 ? 0 : age < 1.16 ? 1 : age < 1.52 ? 2 : 3;
      const frame = horse ? (age < .74 ? 2 : 3) : wreck.kind === 'artillery' ? Math.max(1, phase) : phase;
      const walk = horse ? smooth((age - .1) / .64) : limit((age - .65) / .87, 0, 1);
      const x = Math.round(ease(wreck.hatch.x, wreck.exit.x, walk));
      const y = Math.round(ease(wreck.hatch.y, wreck.exit.y, walk));
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(wreck.exitAngle);
      if (frame === 1 || frame === 2) ctx.translate(0, Math.round(Math.sin(age * 35)));
      const rider = horse ? unitSprites.get(wreck.rider) : null;
      if (rider) {
        ctx.rotate(walk * .9);
        ctx.scale(1, ease(1, .76, walk));
        drawFrame(rider.atlas, rider.index, -9, -9, 18, 18);
      } else if (crewAtlas) {
        const size = frame === 0 ? 26 : frame === 1 ? 24 : 22;
        if (frame < 2) ctx.filter = 'drop-shadow(1px 0 #d29a62)';
        drawFrame(crewAtlas, frame, -size / 2, -size / 2, size, size);
      } else {
        ctx.fillStyle = '#2d2021';
        ctx.fillRect(frame === 0 ? -2 : -6, -3, frame === 0 ? 5 : 12, 6);
        ctx.fillStyle = '#94604a';
        ctx.fillRect(frame === 0 ? 1 : 4, -2, 4, 4);
        if (frame === 3) ctx.fillRect(-3, -5, 5, 2);
      }
      ctx.restore();
    }

    function drawTankFlare(x, y, radius, phase, color) {
      ctx.fillStyle = color;
      for (let dy = -radius; dy <= radius; dy += 2) {
        const edge = Math.sqrt(radius ** 2 - dy ** 2);
        const half = Math.max(1, Math.round(edge * (.86 + .16 * Math.sin(dy * .7 + phase))));
        const drift = Math.round(Math.sin(dy * .55 - phase) * radius * .15);
        ctx.fillRect(Math.round(x - half) + drift, Math.round(y + dy), half * 2, 2);
      }
    }

    function drawWreckFire(wreck, age) {
      const { x, y, fragments, smoke } = wreck;
      const strength = wreck.profile.flare;
      ctx.save();
      if (age < TANK_BLAST_END && strength) {
        const progress = limit((age + .04) / TANK_BLAST_END, 0, 1);
        const radius = Math.round((4 + 16 * Math.sin(progress * Math.PI * .84)) * strength);
        drawWave(ctx, x, y, progress * 38 * strength, 1 - progress);
        ctx.globalAlpha = 1 - progress * .62;
        drawTankFlare(x, y, radius, progress * 6, '#f65a27');
        drawTankFlare(x + 2, y - 1, Math.round(radius * .72), progress * 7, '#ffb345');
        drawTankFlare(x, y + 1, Math.round(radius * .43), progress * 4, '#fff2b4');
        const travel = 1 - (1 - progress) ** 2;
        for (const { dx, dy, size } of fragments) {
          const left = Math.round(x + dx * travel), top = Math.round(y + dy * travel);
          ctx.fillStyle = size === 3 ? '#341f1f' : '#ffce62';
          ctx.fillRect(left, top, size, size);
          if (size === 3) {
            ctx.fillStyle = '#fd8440';
            ctx.fillRect(left, top, 2, 1);
          }
        }
      }
      for (const puff of smoke) {
        const progress = (age - puff.delay) / puff.duration;
        if (progress < 0 || progress >= 1) continue;
        const x0 = Math.round(x + puff.dx * progress), y0 = Math.round(y + puff.dy * progress);
        const size = Math.round(puff.size + progress * 8);
        ctx.globalAlpha = .51 * Math.sin(progress * Math.PI);
        ctx.fillStyle = '#382d33';
        ctx.fillRect(x0 - size, y0 - Math.round(size / 2), size * 2, size);
        ctx.fillRect(x0 - Math.round(size / 2), y0 - size, size, size * 2);
        ctx.globalAlpha *= .64;
        ctx.fillStyle = '#a89891';
        ctx.fillRect(x0 - size + 2, y0 - Math.round(size / 2), size, Math.ceil(size / 2));
      }
      ctx.restore();
    }

    function drawCrashingHelicopter(wreck, age) {
      const progress = limit(age / wreck.profile.crash, 0, 1);
      const x = Math.round(ease(wreck.startX, wreck.x, progress));
      const y = Math.round(ease(wreck.startY, wreck.y, progress));
      const size = Math.round(ease(36, 30, progress));
      ctx.save();
      ctx.fillStyle = '#3b2d3377';
      for (let i = 1; i <= 4; i++) {
        const trail = Math.max(0, progress - i * .12);
        const tx = Math.round(ease(wreck.startX, wreck.x, trail));
        const ty = Math.round(ease(wreck.startY, wreck.y, trail));
        ctx.fillRect(tx - i, ty - i, i * 2 + 1, i * 2 + 1);
      }
      ctx.translate(x, y);
      ctx.rotate(wreck.angle + progress * .33);
      const sprite = unitSprites.get(wreck.sprite);
      if (sprite) drawFrame(sprite.atlas, sprite.index, -size / 2, -size / 2, size, size);
      else pixelUnit({ team: 0, vehicle: true });
      ctx.rotate(age * 27);
      ctx.fillStyle = '#e2d8b190';
      ctx.fillRect(-14, -1, 28, 2);
      ctx.restore();
    }

    function drawEquipmentWrecks() {
      const reduce = reducedMotion();
      for (const wreck of wrecks) {
        const elapsed = time - wreck.at;
        const crash = wreck.profile.crash ?? 0;
        if (!reduce && elapsed < crash) {
          drawCrashingHelicopter(wreck, elapsed);
          continue;
        }
        const age = reduce ? TANK_SMOKE_END : (elapsed - crash) / wreck.profile.scale;
        drawWreckHull(wreck, age);
        if (age < TANK_SMOKE_END && wreck.profile.flare) drawWreckFire(wreck, age);
        drawWreckCrew(wreck, age);
      }
    }

    function drawAction() {
      for (const shot of shots) {
        const progress = limit(shot.elapsed / shot.duration, 0, 1);
        const x = ease(shot.x, shot.endX, progress);
        const y = ease(shot.y, shot.endY, progress);
        ctx.fillStyle = shot.shell ? '#df9867' : '#d6b48a';
        ctx.save();
        ctx.translate(Math.round(x), Math.round(y));
        ctx.rotate(Math.atan2(shot.endY - shot.y, shot.endX - shot.x));
        ctx.fillRect(0, 0, shot.shell ? 4 : 2, shot.shell ? 2 : 1);
        ctx.restore();
      }
      for (const particle of dust) {
        ctx.globalAlpha = .55 * (1 - particle.age / particle.life);
        ctx.fillStyle = '#f0ac6a';
        ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 1, 1);
      }
      ctx.globalAlpha = 1;
      for (const blast of blasts) {
        const x = Math.round(blast.x), y = Math.round(blast.y);
        const duration = blast.big ? .92 : .28;
        const age = blast.age / duration;
        const radius = 1 + (blast.big ? 11 : 3) * age;
        ctx.strokeStyle = age < .35 ? '#ffd390' : '#c18360';
        ctx.globalAlpha = 1 - age;
        ctx.lineWidth = blast.big ? 2 : 1;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function whiteoutOpacity() {
      if (!nuke) return 0;
      const age = time - nuke.at;
      if (nuke.reduce) return age >= nuke.flashPeak && age <= REDUCED_FLASH_END ? 1 : 0;
      if (age < nuke.flashPeak) return smooth((age - FLASH_START) / (nuke.flashPeak - FLASH_START));
      return 1 - smooth((age - FLASH_HOLD) / (FLASH_END - FLASH_HOLD));
    }

    function drawWave(target, x, y, radius, alpha) {
      if (radius < 1 || alpha <= 0) return;
      const bands = [
        { offset: -10, width: 3, color: '#a54332', opacity: .5 },
        { offset: -4, width: 4, color: '#f89048', opacity: .75 },
        { offset: 0, width: 3, color: '#fff0bd', opacity: .92 },
      ];
      for (const band of bands) {
        const ring = Math.max(1, radius + band.offset);
        const points = Math.max(12, Math.ceil(ring * Math.PI * 2 / band.width));
        target.globalAlpha = alpha * band.opacity;
        target.fillStyle = band.color;
        for (let i = 0; i < points; i++) {
          const angle = i / points * Math.PI * 2;
          const wobble = ring + 1.4 * Math.sin(angle * 19);
          const left = Math.round(x + Math.cos(angle) * wobble - band.width / 2);
          const top = Math.round(y + Math.sin(angle) * wobble - band.width / 2);
          target.fillRect(left, top, band.width, band.width);
        }
      }
    }

    function drawNuke(whiteout) {
      const age = time - nuke.at;
      const target = effectContext ?? ctx;
      let width = W, height = H;
      if (effectContext) {
        const viewWidth = window.innerWidth;
        const viewHeight = window.innerHeight;
        const scale = Math.min(viewWidth / W, viewHeight / H) || 1;
        width = Math.round(viewWidth / scale);
        height = Math.round(viewHeight / scale);
        if (effectCanvas.width !== width || effectCanvas.height !== height) {
          effectCanvas.width = width;
          effectCanvas.height = height;
        }
        target.clearRect(0, 0, width, height);
      }
      target.save();
      target.imageSmoothingEnabled = false;
      if (!nuke.reduce && age < nuke.flashPeak) {
        const x = Math.round(nuke.x + (width - W) / 2);
        const y = Math.round(nuke.y + (height - H) / 2);
        const farthestCorner = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
        const progress = limit((age - .12) / 1.6, 0, 1);
        const waveDistance = farthestCorner * progress ** 1.3;
        const waveAlpha = 1 - .38 * progress;
        target.globalAlpha = .22 * smooth(age / .2);
        target.fillStyle = '#1d080d';
        target.fillRect(0, 0, width, height);
        drawWave(target, x, y, waveDistance, waveAlpha);

        target.globalAlpha = (1 - progress * .78) * smooth(age / .12);
        for (const { angle, reach, size } of nuke.sparks) {
          const radius = 10 + waveDistance * reach * .63;
          const left = Math.round(x + Math.cos(angle) * radius);
          const top = Math.round(y + Math.sin(angle) * radius);
          target.fillStyle = reach > .57 ? '#ffdd87' : '#ff6839';
          target.fillRect(left, top, size, size);
        }
        const size = Math.round(ease(34, Math.min(W, H) * .88, 1 - (1 - age / nuke.flashPeak) ** 2));
        const left = Math.round(x - size / 2), top = Math.round(y - size / 2);
        if (nukeAtlas) {
          const stage = age < .32 ? age / .32 : age < .83 ? 1 + (age - .32) / .51
            : Math.min(3, 2 + (age - .83) / .49);
          const frame = Math.floor(stage);
          const blend = smooth((stage - frame - .54) / .46);
          target.globalAlpha = 1;
          drawFrame(nukeAtlas, frame, left, top, size, size, target);
          if (frame < 3 && blend > 0) {
            target.globalAlpha = blend;
            drawFrame(nukeAtlas, frame + 1, left, top, size, size, target);
          }
        } else {
          const flare = Math.max(4, Math.round(size / 3));
          target.globalAlpha = 1;
          target.fillStyle = '#e74d2a';
          target.fillRect(x - flare / 2, y - flare / 2, flare, flare);
          target.fillStyle = '#fff1a6';
          target.fillRect(x - flare / 4, y - flare / 4, flare / 2, flare / 2);
        }
      }
      if (whiteout > 0 && !options.onFlash) {
        target.globalAlpha = whiteout;
        target.fillStyle = '#fff';
        target.fillRect(0, 0, width, height);
      }
      target.restore();
    }

    function draw(alpha = 1) {
      ctx.imageSmoothingEnabled = false;
      field();
      ctx.drawImage(bloodCanvas, 0, 0);
      for (const stain of activeBlood) drawBloodStain(stain, time - stain.at, ctx);
      drawEquipmentWrecks();
      for (const unit of [...units].sort((a, b) => a.y - b.y)) drawUnit(unit, alpha);
      for (const stain of activeBlood) drawBloodStain(stain, time - stain.at, ctx, true);
      drawAction();
      const whiteout = whiteoutOpacity();
      if (nuke) drawNuke(whiteout);
      options.onFlash?.(whiteout, nuke !== null);
    }

    function advance(milliseconds, nukeOnly, interpolate = false) {
      accumulator += limit(Number(milliseconds) || 0, 0, 60000);
      if (accumulator < TICK_MS && !interpolate) return;
      while (accumulator >= TICK_MS) {
        tick();
        accumulator -= TICK_MS;
        if (nukeOnly && !nuke) {
          accumulator = 0;
          break;
        }
      }
      draw(interpolate ? accumulator / TICK_MS : 1);
    }

    function step(milliseconds = TICK_MS) {
      advance(milliseconds, false);
    }

    function loop(timestamp) {
      frameId = 0;
      if (paused && !nuke) return;
      if (lastFrame !== null) advance(limit(timestamp - lastFrame, 0, 100), paused, !paused && !reducedMotion());
      lastFrame = timestamp;
      schedule();
    }

    function schedule() {
      if ((!paused || nuke) && !frameId && typeof requestAnimationFrame === 'function') {
        frameId = requestAnimationFrame(loop);
      }
    }

    function setPaused(value) {
      paused = !!value;
      lastFrame = null;
      if (paused && !nuke && frameId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
      }
      syncVehicleSound();
      schedule();
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
          remaining: nuke ? Math.max(0, Math.round((NUKE_DURATION - time + nuke.at) * 1000)) : 0,
          whiteout: whiteoutOpacity() },
      };
    }

    function dispose() {
      nuke = null;
      setPaused(true);
      options.onFlash?.(0, false);
    }

    reset(options.seed, options.era);
    schedule();
    return { setPaused, reset, step, snapshot, setBiome, triggerNuke, dispose };
  }

  window.createAtlasBattle = createAtlasBattle;
})();

