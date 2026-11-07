import type { BattleFrame } from './battle';
import { scenarios, units as roster } from './roster';
import type { SceneSprites } from '../resources/sprite-assets';

const TILE_SIZE = 32;
const CITY_ROAD = [[15, '#82776b'], [14, '#635b55'], [12, '#36383b']] as const;
const VILLAGE_ROAD = [[14, '#66583b'], [12, '#96784d']] as const;
const BIOMES: readonly BattleFrame['biome'][] = ['desert', 'snow', 'ruins', 'village'];
const GROUND_COLORS = {
  desert: ['#8d7150', '#9b7d57', '#a48761', '#6a513b'],
  snow: ['#809596', '#a0b0ac', '#b6c2bd', '#334a42'],
  ruins: ['#555453', '#63605c', '#756b61', '#353637'],
  village: ['#596343', '#687149', '#83734e', '#484936'],
  generic: ['#68684c', '#767355', '#9c9273', '#494634'],
};
const GENERIC_PROP_FRAMES = [null, 3, 5, 4] as const;
const JAPAN_VILLAGE_FRAMES = [0, 1, 2, 1] as const;
const JAPAN_RUINS_FRAMES = [0, 3, 2, 3] as const;
const TANK_BLAST_END = .48;
const TANK_SMOKE_END = 3.6;
const ease = (a: number, b: number, fraction: number) => a + (b - a) * fraction;
const turnBetween = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const limit = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high);
const isObjectTile = (variant: number) => variant === 1 || variant === 3;
const smooth = (value: number) => {
  const t = limit(value, 0, 1);
  return t * t * (3 - 2 * t);
};
function prepareSheet(image: HTMLImageElement | undefined, columns: number, rows: number) {
  if (!image?.naturalWidth || !image?.naturalHeight) return null;
  const w = Math.floor(image.naturalWidth / columns);
  const h = Math.floor(image.naturalHeight / rows);
  const frames = Array.from({ length: columns * rows }, (_, index) => ({
    x: (index % columns) * w, y: Math.floor(index / columns) * h, w, h,
  }));
  return { image, frames };
}

type SpriteSheet = NonNullable<ReturnType<typeof prepareSheet>>;

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  return context;
}

// Original preview drawing routines receive state from the portable rules.
export function createCanvasRenderer(
  canvas: HTMLCanvasElement,
  effectCanvas: HTMLCanvasElement,
  flash: HTMLElement,
  assets: SceneSprites,
) {
  const ctx = canvasContext(canvas);
  const effectContext = canvasContext(effectCanvas);
  const bloodCanvas = canvas.ownerDocument.createElement('canvas');
  bloodCanvas.width = canvas.width;
  bloodCanvas.height = canvas.height;
  const bloodContext = canvasContext(bloodCanvas);
  const infantry = prepareSheet(assets.infantry, 5, 4);
  const vehicles = prepareSheet(assets.vehicles, 4, 3);
  const neutralUnits = {
    coldWarUnits: prepareSheet(assets.coldWarUnits, 3, 2),
    contemporaryUnits: prepareSheet(assets.contemporaryUnits, 3, 2),
  };
  const terrainAtlas = prepareSheet(assets.terrain, 4, 4);
  const genericTerrain = prepareSheet(assets.genericTerrain, 3, 2);
  const japanTerrain = prepareSheet(assets.japanTerrain, 2, 2);
  const roadAtlas = prepareSheet(assets.roads, 16, 2);
  const nukeAtlas = prepareSheet(assets.nuke, 2, 2);
  const crewAtlas = prepareSheet(assets.tankCrew, 4, 1);
  const equipmentWreckAtlas = prepareSheet(assets.equipmentWrecks, 4, 2);
  const unitSprites = new Map<string, { atlas: SpriteSheet; index: number }>();
  let infantryIndex = 0;
  let vehicleIndex = 0;
  for (const [id, definition] of Object.entries(roster)) {
    if (definition.symbolic) continue;
    const sprite = definition.sprite;
    const atlas = sprite ? neutralUnits[sprite.sheet] : definition.sheet ? vehicles : infantry;
    const index = sprite?.frame ?? (definition.sheet ? vehicleIndex++ : infantryIndex++);
    if (atlas?.frames[index]) unitSprites.set(id, { atlas, index });
  }
  let frame: BattleFrame;

  function drawFrame(atlas: SpriteSheet, index: number, x: number, y: number, width: number, height: number, target = ctx) {
    const frame = atlas.frames[index];
    target.drawImage(atlas.image, frame.x, frame.y, frame.w, frame.h, x, y, width, height);
  }

  function drawRoad({ x, y, road }: BattleFrame['terrain'][number]) {
    if (!road) return;
    const city = frame.biome === 'ruins';
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
    const legacyRow = BIOMES.indexOf(frame.biome) * 4;
    const colors = GROUND_COLORS[frame.biome];
    const japanFrames = frame.biome === 'village' ? JAPAN_VILLAGE_FRAMES
      : frame.biome === 'ruins' ? JAPAN_RUINS_FRAMES : null;
    for (const { x, y, variant, flipX, flipY } of frame.terrain) {
      if (frame.biome === 'generic' && genericTerrain) {
        const ground = Number(flipX) + Number(flipY);
        drawFrame(genericTerrain, ground, x, y, TILE_SIZE, TILE_SIZE);
        const prop = GENERIC_PROP_FRAMES[variant];
        if (prop !== null) drawFrame(genericTerrain, prop, x, y, TILE_SIZE, TILE_SIZE);
        continue;
      }
      if (japanTerrain && japanFrames) {
        drawFrame(japanTerrain, japanFrames[variant], x, y, TILE_SIZE, TILE_SIZE);
        continue;
      }
      if (terrainAtlas && legacyRow >= 0) {
        drawFrame(terrainAtlas, legacyRow + variant, x, y, TILE_SIZE, TILE_SIZE);
        continue;
      }
      ctx.fillStyle = colors[0];
      ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = colors[1];
      ctx.fillRect(x + (flipX ? 4 : 17), y + (flipY ? 7 : 20), 9, 2);
      if (frame.biome === 'generic') {
        if (variant === 3) {
          ctx.fillStyle = colors[3];
          ctx.fillRect(x + 11, y + 11, 11, 10);
        }
        continue;
      }
      if (!isObjectTile(variant)) continue;
      ctx.fillStyle = colors[3];
      ctx.fillRect(x + 7, y + 8, 17, 16);
      ctx.fillStyle = colors[2];
      ctx.fillRect(x + 8, y + 8, 15, 5);
    }
    for (const tile of frame.terrain) if (tile.road) drawRoad(tile);
  }

  function drawLandscape() {
    if (!frame.landscape) return;
    const { ridges, water, bridges } = frame.landscape;
    ctx.save();
    ctx.globalAlpha = .7;
    for (const [left, top, right, bottom] of ridges) {
      ctx.fillStyle = '#323c35';
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.fillStyle = '#6c6f56';
      ctx.fillRect(left === 0 ? right - 5 : left, top, 5, bottom - top);
    }
    ctx.restore();
    for (const [left, top, right, bottom] of water) {
      ctx.fillStyle = '#344b4a';
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.fillStyle = '#657976';
      ctx.fillRect(left + 1, top, 2, bottom - top);
    }
    for (const [left, top, right, bottom] of bridges) {
      ctx.fillStyle = '#72604f';
      ctx.fillRect(left, top, right - left, bottom - top);
      ctx.fillStyle = '#a49375';
      ctx.fillRect(left, top + 1, right - left, 1);
    }
  }

  function drawCraters() {
    for (const { x, y, radius, texture } of frame.craters) {
      const depth = Math.ceil(radius * .63);
      for (let row = -depth; row <= depth; row += 2) {
        const edge = Math.sqrt(Math.max(0, 1 - (row / depth) ** 2));
        const half = Math.max(2, Math.round(radius * edge) + (row + depth + texture) % 3);
        ctx.fillStyle = row > 1 ? '#645249' : '#322826';
        ctx.fillRect(x - half, y + row, half * 2, 2);
        if (half > 4) {
          ctx.fillStyle = '#1d1718';
          ctx.fillRect(x - half + 2, y + row, half * 2 - 4, 1);
        }
      }
    }
  }

  function drawBloodStain(stain: Readonly<BattleFrame['activeBlood'][number]>, age: number, target: CanvasRenderingContext2D, airborne = false) {
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

  function pixelUnit(unit: Pick<BattleFrame['units'][number], 'team' | 'vehicle'>) {
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

  function drawUnit(unit: BattleFrame['units'][number], alpha: number) {
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
    ctx.globalAlpha = unit.hp <= 0 ? limit(((unit.removedAt ?? frame.time) - frame.time) / .42, .05, 1) : 1;
    ctx.fillStyle = '#14161790';
    const shadowOffset = unit.airborne ? 7 : 2;
    ctx.fillRect(x - size * .25 + shadowOffset, y + 3, size * .55, unit.vehicle ? 6 : 4);
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.translate(-recoil, 0);
    const sprite = unitSprites.get(unit.sprite);
    const mount = mounted ? unitSprites.get(mounted) : undefined;
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

  function drawGunCrew(unit: BattleFrame['units'][number], gait: number) {
    const fighters = scenarios[frame.scenario].teams[unit.team].fighters;
    const infantry = unitSprites.get(fighters[unit.id % fighters.length]);
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

  function drawWreckHull(wreck: BattleFrame['wrecks'][number], age: number) {
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

  function drawWreckCrew(wreck: BattleFrame['wrecks'][number], age: number) {
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
    const rider = horse && wreck.rider ? unitSprites.get(wreck.rider) : undefined;
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

  function drawTankFlare(x: number, y: number, radius: number, phase: number, color: string) {
    ctx.fillStyle = color;
    for (let dy = -radius; dy <= radius; dy += 2) {
      const edge = Math.sqrt(radius ** 2 - dy ** 2);
      const half = Math.max(1, Math.round(edge * (.86 + .16 * Math.sin(dy * .7 + phase))));
      const drift = Math.round(Math.sin(dy * .55 - phase) * radius * .15);
      ctx.fillRect(Math.round(x - half) + drift, Math.round(y + dy), half * 2, 2);
    }
  }

  function drawWreckFire(wreck: BattleFrame['wrecks'][number], age: number) {
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

  function drawCrashingHelicopter(wreck: BattleFrame['wrecks'][number], age: number) {
    const progress = limit(age / (wreck.profile.crash ?? 1), 0, 1);
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
    const reduce = frame.reducedMotion;
    for (const wreck of frame.wrecks) {
      const elapsed = frame.time - wreck.at;
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
    for (const shot of frame.shots) {
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
    for (const particle of frame.dust) {
      ctx.globalAlpha = .55 * (1 - particle.age / particle.life);
      ctx.fillStyle = '#f0ac6a';
      ctx.fillRect(Math.round(particle.x), Math.round(particle.y), 1, 1);
    }
    ctx.globalAlpha = 1;
    for (const blast of frame.blasts) {
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

  function drawWave(target: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha: number) {
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

  function drawNuke(nuke: NonNullable<BattleFrame['nuke']>) {
    const age = (frame.time - nuke.at) / nuke.timelineScale;
    const flashPeak = nuke.flashPeak / nuke.timelineScale;
    const target = effectContext;
    let width = frame.width, height = frame.height;
    {
      const view = canvas.ownerDocument.defaultView;
      const viewWidth = view?.innerWidth ?? frame.width;
      const viewHeight = view?.innerHeight ?? frame.height;
      const scale = Math.min(viewWidth / frame.width, viewHeight / frame.height) || 1;
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
    if (!nuke.reduce && age < flashPeak) {
      const x = Math.round(nuke.x + (width - frame.width) / 2);
      const y = Math.round(nuke.y + (height - frame.height) / 2);
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
      const size = Math.round(ease(34, Math.min(frame.width, frame.height) * .88, 1 - (1 - age / flashPeak) ** 2));
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
    target.restore();
  }

  function render(next: BattleFrame, alpha = 1) {
    frame = next;
    ctx.imageSmoothingEnabled = false;
    field();
    drawLandscape();
    drawCraters();
    ctx.drawImage(bloodCanvas, 0, 0);
    for (const stain of frame.activeBlood) drawBloodStain(stain, frame.time - stain.at, ctx);
    drawEquipmentWrecks();
    for (const unit of [...frame.units].sort((a, b) => a.y - b.y)) drawUnit(unit, alpha);
    for (const stain of frame.activeBlood) drawBloodStain(stain, frame.time - stain.at, ctx, true);
    drawAction();
    if (frame.nuke) drawNuke(frame.nuke);
    effectCanvas.hidden = !frame.nuke || frame.reducedMotion;
    flash.style.opacity = String(frame.whiteout);
  }

  function clearField() {
    bloodContext.clearRect(0, 0, bloodCanvas.width, bloodCanvas.height);
  }

  function settleBlood(stain: Readonly<BattleFrame['activeBlood'][number]>) {
    drawBloodStain(stain, stain.duration, bloodContext);
  }

  return { render, clearField, settleBlood };
}
