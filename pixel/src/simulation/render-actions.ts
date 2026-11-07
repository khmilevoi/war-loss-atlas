import type { BattleCue } from './battle';
import type { ActionSceneDefinition } from './scene-config';

type Point = readonly [x: number, y: number];
interface Track {
  start: Point;
  target: Point;
  launch: number;
  arrival: number;
}

const DURATION = 5500;
const AIR_TRACKS: readonly Track[] = [
  { start: [70, 75], target: [320, 99], launch: 500, arrival: 1900 },
  { start: [320, 149], target: [72, 157], launch: 1900, arrival: 3350 },
];
const SEA_TRACKS: readonly Track[] = [
  { start: [321, 108], target: [153, 103], launch: 650, arrival: 2300 },
  { start: [115, 149], target: [329, 170], launch: 2150, arrival: 3900 },
];
const COAST = [278, 269, 284, 301, 309, 290, 273, 284];
const RIDGE = [107, 112, 123, 128, 115, 104, 109, 128];
const PATROL_COLORS = [[1, '#d0b48a'], [-1, '#a3b5ba']] as const;

export function createActionPlayback(
  canvas: HTMLCanvasElement,
  action: ActionSceneDefinition['action'],
  cue: (kind: BattleCue) => void,
) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D is unavailable');
  const ctx = context;
  const tracks = action === 'air-strikes' ? AIR_TRACKS : action === 'maritime' ? SEA_TRACKS : [];
  let time = 0;

  function block(color: string, x: number, y: number, width: number, height: number) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), width, height);
  }

  function track({ start, target, launch, arrival }: Track, still: boolean) {
    if (!still && time < launch) return;
    const progress = still ? 1 : Math.min(1, (time - launch) / (arrival - launch));
    const [x, y] = start;
    const dx = target[0] - x;
    const dy = target[1] - y;
    const arc = (p: number) => -52 * p * (1 - p);
    for (let dot = 0; dot <= Math.floor(progress * 25); dot++) {
      const p = dot / 25;
      block('#b8aa81', x + dx * p, y + dy * p + arc(p), 2, 2);
    }
    if (!still && time < arrival) {
      block('#ead59d', x + dx * progress - 2, y + dy * progress + arc(progress) - 1, 5, 3);
    }
    const impact = time - arrival;
    if (still || (impact >= 0 && impact < 700)) {
      const radius = still ? 5 : 3 + Math.floor(impact / 115);
      block('#805643', target[0] - radius, target[1] - radius, radius * 2, radius * 2);
      block('#c9a069', target[0] - 2, target[1] - 2, 4, 4);
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

  function patrolField(still: boolean) {
    block('#565651', 0, 0, canvas.width, canvas.height);
    for (let row = 0; row < RIDGE.length; row++) {
      const rim = RIDGE[row];
      block('#454845', 0, row * 30, rim, 30);
      block('#494a44', canvas.width - rim, row * 30, rim, 30);
      block('#686b5d', rim + 7, row * 30 + 15, 12, 3);
      block('#66685c', canvas.width - rim - 20, row * 30 + 6, 13, 3);
    }
    block('#74705d', 88, 103, 224, 34);
    const approach = still ? 1 : Math.min(1, time / 2550);
    const stepBack = still ? 0 : Math.min(6, Math.max(0, (time - 3300) / 100));
    for (const [side, color] of PATROL_COLORS) {
      for (let person = 0; person < 3; person++) {
        const x = 200 - side * (105 - approach * 102 + person * 7 + stepBack);
        const y = 116 + (person - 1) * 8;
        block('#3b3d36', x - 3, y - 2, 7, 6);
        block(color, x - 2, y - 2, 4, 4);
      }
    }
  }

  return {
    render(reduced: boolean) {
      if (action === 'patrol-contact') {
        patrolField(reduced);
        return;
      }
      if (action === 'maritime') seaField();
      else airField();
      for (const flight of tracks) track(flight, reduced);
    },
    step(milliseconds: number) {
      const before = time;
      time = Math.min(DURATION, time + milliseconds);
      for (const { arrival } of tracks) if (before < arrival && time >= arrival) cue('explosion');
    },
    finished: () => time >= DURATION,
    reset() { time = 0; },
  };
}
