export type BattleBiome = 'desert' | 'snow' | 'ruins' | 'village' | 'generic';

export interface VehicleStats {
  speed: number;
  range: number;
  health: number;
  rate: number;
  damage: number;
}

export interface UnitDefinition {
  label: string;
  role?: 'infantry' | 'scout' | 'crew' | 'medic';
  mount?: string;
  speed?: number;
  range?: number;
  sheet?: string;
  row?: number;
  sprite?: { sheet: 'coldWarUnits' | 'contemporaryUnits' | 'koreaUnits'; frame: number; wreckFrame?: number };
  symbolic?: boolean;
  kind?: 'wheeled' | 'mount' | 'tracked' | 'airborne' | 'carrier';
  stats?: VehicleStats;
}

interface TeamRoster {
  fighters: readonly string[];
  support: readonly string[];
  vehicles: readonly string[];
}

export interface BattleScenario {
  label: string;
  biome: BattleBiome;
  speed: number;
  range: number;
  fire: number;
  armoredBattle?: boolean;
  teams: readonly [TeamRoster, TeamRoster];
}

const person = (label: string, role: UnitDefinition['role'] = 'infantry', extra: Partial<UnitDefinition> = {}): UnitDefinition =>
  ({ label, role, ...extra });
const machine = (label: string, sheet: string, row: number, kind: UnitDefinition['kind'], stats?: VehicleStats): UnitDefinition => ({ label, sheet, row, kind, stats });
const gun = { speed: 6, range: 103, health: 5, rate: 3.2, damage: 2 };
const tank = { speed: 11, range: 95, health: 8, rate: 2.5, damage: 2 };
const carrier = { speed: 14, range: 68, health: 5, rate: 0, damage: 0 };

export const units: Record<string, UnitDefinition> = {
  union: person('Пехотинец 54-го Массачусетского полка'),
  confederate: person('Пехотинец Конфедерации'),
  'union-scout': person('Разведчица Союза', 'scout'),
  'ottoman-1917': person('Османский пехотинец'),
  'light-horse-rider': person('Австралийский конный стрелок', 'infantry', { mount: 'horse', speed: 24 }),
  'ottoman-medic': person('Османский санитар', 'medic'),
  'tirailleur-1918': person('Западноафриканский стрелок французской армии'),
  'german-1918': person('Немецкий пехотинец, 1918'),
  'nurse-1918': person('Австралийская военная медсестра', 'medic'),
  'soviet-sniper': person('Советская снайперка', 'infantry', { range: 112 }),
  'soviet-tanker': person('Советский танкист', 'crew'),
  'german-1943': person('Немецкий пехотинец, 1943'),
  nva: person('Вьетнамский пехотинец'),
  'viet-guerrilla': person('Вьетнамская партизанка'),
  'us-paratrooper': person('Американский десантник'),
  'australian-vietnam': person('Австралийский пехотинец'),
  'nurse-vietnam': person('Австралийская медсестра эвакуации', 'medic'),
  napoleon: machine('Пушка «Наполеон»', 'early-equipment', 0, 'wheeled', gun),
  parrott: machine('Орудие Парротта', 'early-equipment', 1, 'wheeled', { ...gun, speed: 4, range: 124 }),
  horse: machine('Лошадь', 'early-equipment', 2, 'mount'),
  krupp: machine('Крупп M1903', 'early-equipment', 3, 'wheeled', gun),
  renault: machine('Renault FT', 'world-equipment', 0, 'tracked', { ...tank, speed: 8, range: 78 }),
  a7v: machine('A7V', 'world-equipment', 1, 'tracked', { ...tank, speed: 7 }),
  t34: machine('Т‑34/76', 'world-equipment', 2, 'tracked', tank),
  stug: machine('StuG III', 'world-equipment', 3, 'tracked', { ...tank, range: 105 }),
  huey: machine('Bell UH‑1', 'vietnam-equipment', 0, 'airborne', { ...tank, speed: 23, health: 6, range: 89 }),
  m113: machine('M113A1', 'vietnam-equipment', 1, 'tracked', { ...tank, speed: 14, range: 65, rate: 1.2 }),
  centurion: machine('Centurion', 'vietnam-equipment', 2, 'tracked', { ...tank, health: 9, range: 105 }),
  'symbolic-infantry': person('Условный юнит', 'infantry', { symbolic: true }),
  'cold-war-olive': person('Стрелок Холодной войны', 'infantry', { sprite: { sheet: 'coldWarUnits', frame: 0 } }),
  'cold-war-slate': person('Стрелок Холодной войны', 'infantry', { sprite: { sheet: 'coldWarUnits', frame: 1 } }),
  'cold-war-medic': person('Санитар Холодной войны', 'medic', { sprite: { sheet: 'coldWarUnits', frame: 2 } }),
  'cold-war-carrier': {
    label: 'Условный гусеничный бронетранспортёр', kind: 'carrier', stats: carrier,
    sprite: { sheet: 'coldWarUnits', frame: 3, wreckFrame: 4 },
  },
  'cold-war-tank': {
    label: 'Условный танк Холодной войны', kind: 'tracked', stats: tank,
    sprite: { sheet: 'coldWarUnits', frame: 5 },
  },
  'contemporary-olive': person('Современный стрелок', 'infantry', { sprite: { sheet: 'contemporaryUnits', frame: 0 } }),
  'contemporary-slate': person('Современный стрелок', 'infantry', { sprite: { sheet: 'contemporaryUnits', frame: 1 } }),
  'contemporary-medic': person('Современный санитар', 'medic', { sprite: { sheet: 'contemporaryUnits', frame: 2 } }),
  'contemporary-carrier': {
    label: 'Условная колёсная машина', kind: 'carrier', stats: carrier,
    sprite: { sheet: 'contemporaryUnits', frame: 3, wreckFrame: 4 },
  },
  'contemporary-support': {
    label: 'Условная гусеничная машина поддержки', kind: 'tracked', stats: tank,
    sprite: { sheet: 'contemporaryUnits', frame: 5 },
  },
  'osan-us-infantry': person('Пехотинец группы Смита', 'infantry', { sprite: { sheet: 'koreaUnits', frame: 0 } }),
  'osan-kpa-infantry': person('Пехотинец Корейской народной армии', 'infantry', { sprite: { sheet: 'koreaUnits', frame: 1 } }),
  'osan-medic': person('Санитар группы Смита', 'medic', { sprite: { sheet: 'koreaUnits', frame: 2 } }),
  'osan-t34': { ...machine('Т‑34‑85', 'korea', 0, 'tracked', tank), sprite: { sheet: 'koreaUnits', frame: 3, wreckFrame: 4 } },
  'osan-howitzer': { ...machine('105-мм гаубица', 'korea', 2, 'wheeled', gun), sprite: { sheet: 'koreaUnits', frame: 5 } },
};

const team = (fighters: string[], support: string[] = [], vehicles: string[] = []): TeamRoster => ({ fighters, support, vehicles });

export const scenarios = {
  'south-carolina': {
    label: 'Южная Каролина · 1863', biome: 'village', speed: 13, range: 52, fire: 1.8,
    teams: [team(['union'], ['union-scout'], ['parrott']), team(['confederate'], [], ['napoleon'])],
  },
  palestine: {
    label: 'Палестинская кампания · 1917–1918', biome: 'desert', speed: 16, range: 69, fire: 1.1,
    teams: [team(['light-horse-rider']), team(['ottoman-1917'], ['ottoman-medic'], ['krupp'])],
  },
  'western-front': {
    label: 'Западный фронт · 1918', biome: 'ruins', speed: 17, range: 72, fire: 1,
    teams: [team(['tirailleur-1918'], ['nurse-1918'], ['renault']), team(['german-1918'], [], ['a7v'])],
  },
  'eastern-front': {
    label: 'Восточный фронт · 1943', biome: 'snow', speed: 18, range: 72, fire: .8,
    teams: [team(['soviet-sniper'], ['soviet-tanker'], ['t34']), team(['german-1943'], [], ['stug'])],
  },
  'tank-battle': {
    label: 'Танковое сражение', biome: 'snow', speed: 17, range: 72, fire: 2, armoredBattle: true,
    teams: [
      team(['soviet-sniper'], [], Array<string>(5).fill('t34')),
      team(['german-1943'], [], Array<string>(5).fill('stug')),
    ],
  },
  vietnam: {
    label: 'Вьетнам · конец 1960-х', biome: 'village', speed: 20, range: 72, fire: .65,
    teams: [team(['us-paratrooper', 'australian-vietnam'], ['nurse-vietnam'], ['huey', 'm113', 'centurion']),
      team(['nva', 'viet-guerrilla'])],
  },
  'pacific-symbolic': {
    label: 'Условная сцена последствий', biome: 'village', speed: 14, range: 65, fire: 1.1,
    teams: [team(['symbolic-infantry']), team(['symbolic-infantry'])],
  },
  'cold-war-neutral': {
    label: 'Условная сцена Холодной войны', biome: 'generic', speed: 16, range: 70, fire: 1,
    teams: [team(['cold-war-olive'], ['cold-war-medic'], ['cold-war-carrier']), team(['cold-war-slate'], [], ['cold-war-tank'])],
  },
  'contemporary-neutral': {
    label: 'Условная сцена современного конфликта', biome: 'generic', speed: 16, range: 70, fire: 1,
    teams: [team(['contemporary-olive'], ['contemporary-medic'], ['contemporary-carrier']),
      team(['contemporary-slate'], [], ['contemporary-support'])],
  },
  'korea-osan': {
    label: 'Бои у Осана · июль 1950', biome: 'generic', speed: 16, range: 70, fire: 1.3,
    teams: [team(['osan-us-infantry'], ['osan-medic'], ['osan-howitzer']), team(['osan-kpa-infantry'], [], ['osan-t34'])],
  },
} satisfies Record<string, BattleScenario>;

export type BattleScenarioId = keyof typeof scenarios;
