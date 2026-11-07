import type { BattleCue } from './battle';
import type { ActionSceneDefinition } from './scene-config';

type Point = readonly [x: number, y: number];
interface Track {
  start: Point;
  target: Point;
  launch: number;
  arrival: number;
}

type Wave = readonly [number, number];
type Side = 0 | 1;

const WAVE_DURATION = 5500;
const SIDES = [0, 1] as const;
const AIR_TRACKS: readonly [Track, Track] = [
  { start: [70, 75], target: [320, 99], launch: 500, arrival: 1900 },
  { start: [320, 149], target: [72, 157], launch: 1900, arrival: 3350 },
];
const SEA_TRACKS: readonly [Track, Track] = [
  { start: [321, 108], target: [153, 103], launch: 650, arrival: 2300 },
  { start: [115, 149], target: [329, 170], launch: 2150, arrival: 3900 },
];
const COAST = [278, 269, 284, 301, 309, 290, 273, 284];
const RIDGE = [107, 112, 123, 128, 115, 104, 109, 128];
const SIDE_COLORS = [
  { figure: '#d0b48a', marker: '#ead59d', impact: '#c9a069' },
  { figure: '#a3b5ba', marker: '#c6d7dd', impact: '#a9b9bf' },
] as const;

function formationTracks(base: Track, count: number): Track[] {
  const lanes = Math.min(5, count);
  const columns = Math.ceil(count / 5);
  return Array.from({ length: count }, (_, index) => {
    const column = Math.floor(index / lanes);
    const x = (column - (columns - 1) / 2) * 12;
    const y = (index % lanes - (lanes - 1) / 2) * 9;
    const delay = column * 180;
    return {
      start: [base.start[0] + x, base.start[1] + y],
      target: [base.target[0] + x, base.target[1] + y],
      launch: base.launch + delay,
      arrival: base.arrival + delay,
    };
  });
}

export function createActionPlayback(
  canvas: HTMLCanvasElement,
  action: ActionSceneDefinition['action'],
  cue: (kind: BattleCue) => void,
  waves: readonly Wave[],
) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  const ctx = context;
  const baseTracks = action === 'air-strikes' ? AIR_TRACKS : action === 'maritime' ? SEA_TRACKS : null;
  const tracks = waves.map(wave => baseTracks && SIDES.map(side => formationTracks(baseTracks[side], wave[side])));
  const cueTimes = baseTracks ? waves.flatMap((wave, index) => SIDES
    .filter(side => wave[side] > 0)
    .map(side => index * WAVE_DURATION + baseTracks[side].arrival)) : [];
  const duration = waves.length * WAVE_DURATION;
  const current = () => Math.min(waves.length - 1, Math.floor(time / WAVE_DURATION));
  let time = 0;

  function block(color: string, x: number, y: number, width: number, height: number) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  function track({ start, target, launch, arrival }: Track, side: Side, elapsed: number, still: boolean) {
    if (!still && elapsed < launch) return;
    const progress = still ? 1 : Math.min(1, (elapsed - launch) / (arrival - launch));
    const [x, y] = start;
    const dx = target[0] - x;
    const dy = target[1] - y;
    const arc = (p: number) => -52 * p * (1 - p);
    for (let dot = 0; dot <= Math.floor(progress * 25); dot++) {
      const p = dot / 25;
      block('#b8aa81', x + dx * p, y + dy * p + arc(p), 2, 2);
    }
    if (!still && elapsed < arrival) {
      block(SIDE_COLORS[side].marker, x + dx * progress - 2, y + dy * progress + arc(progress) - 1, 5, 3);
    }
    const impact = elapsed - arrival;
    if (still || (impact >= 0 && impact < 700)) {
      const radius = still ? 5 : 3 + Math.floor(impact / 115);
      block('#805643', target[0] - radius, target[1] - radius, radius * 2, radius * 2);
      block(SIDE_COLORS[side].impact, target[0] - 2, target[1] - 2, 4, 4);
    }
  }

  function site(x: number, y: number) {
    block('#4b4940', x - 13, y - 9, 26, 18);
    block('#8a8672', x - 10, y - 6, 10, 8);
    block('#6b6a59', x + 2, y - 6, 8, 13);
  }

  function ship(x: number, y: number) {
    block('#263238', x - 16, y - 5, 30, 10);
    block('#87969a', x - 14, y - 3, 26, 6);
    block('#aeb5aa', x - 3, y - 2, 7, 4);
    block('#526870', x + 12, y - 2, 4, 4);
  }

  function airField() {
    block('#434b42', 0, 0, canvas.width, canvas.height);
    block('#515849', 0, 36, 142, 160);
    block('#565749', 251, 30, 149, 173);
    for (const item of AIR_TRACKS) {
      site(...item.start);
      site(...item.target);
    }
  }

  function seaField() {
    block('#334c55', 0, 0, canvas.width, canvas.height);
    for (let row = 0; row < COAST.length; row++) {
      const shore = COAST[row];
      block('#7e7761', shore, row * 30, canvas.width - shore, 30);
      block('#9d8e6d', shore, row * 30, 4, 30);
      for (let x = 16; x < 250; x += 34) block('#405d65', x + (row % 2) * 8, row * 30 + 14, 9, 1);
    }
    site(321, 108);
    site(329, 170);
    ship(153, 103);
    ship(115, 149);
  }

  function patrolField(wave: Wave | undefined, elapsed: number, still: boolean) {
    block('#565651', 0, 0, canvas.width, canvas.height);
    for (let row = 0; row < RIDGE.length; row++) {
      const rim = RIDGE[row];
      block('#454845', 0, row * 30, rim, 30);
      block('#494a44', canvas.width - rim, row * 30, rim, 30);
      block('#686b5d', rim + 7, row * 30 + 15, 12, 3);
      block('#66685c', canvas.width - rim - 20, row * 30 + 6, 13, 3);
    }
    block('#74705d', 88, 103, 224, 34);
    if (!wave) return;
    const approach = still ? 1 : Math.min(1, elapsed / 2550);
    const stepBack = still ? 0 : Math.min(6, Math.max(0, (elapsed - 3300) / 100));
    for (const side of SIDES) {
      const rows = Math.min(wave[side], 4);
      const direction = side === 0 ? 1 : -1;
      for (let person = 0; person < wave[side]; person++) {
        const x = 200 - direction * (105 - approach * 100 + Math.floor(person / rows) * 9 + stepBack);
        const y = 120 + (person % rows - (rows - 1) / 2) * 8;
        block('#3b3d36', x - 3, y - 2, 7, 6);
        block(SIDE_COLORS[side].figure, x - 2, y - 2, 4, 4);
      }
    }
  }

  return {
    render(reduced: boolean) {
      const index = current();
      const elapsed = time - index * WAVE_DURATION;
      if (action === 'patrol-contact') {
        patrolField(waves[index], elapsed, reduced);
        return;
      }
      if (action === 'maritime') seaField();
      else airField();
      const active = tracks[index];
      if (!active) return;
      for (const side of SIDES) {
        for (const flight of active[side]) track(flight, side, elapsed, reduced);
      }
    },
    step(milliseconds: number) {
      const before = time;
      time = Math.min(duration, time + milliseconds);
      for (const at of cueTimes) if (before < at && time >= at) cue('explosion');
    },
    finished: () => time >= duration,
    wave: () => waves.length ? { current: current() + 1, total: waves.length } : null,
    reset() { time = 0; },
  };
}
