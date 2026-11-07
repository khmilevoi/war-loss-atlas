const person = (label, role = 'infantry', extra = {}) => ({ label, role, ...extra });
const machine = (label, sheet, row, kind, stats) => ({ label, sheet, row, kind, stats });
const gun = { speed: 6, range: 103, health: 5, rate: 3.2, damage: 2 };
const tank = { speed: 11, range: 95, health: 8, rate: 2.5, damage: 2 };

export const equipmentSheets = { 'early-equipment': 4, 'world-equipment': 4, 'vietnam-equipment': 3 };

export const units = {
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
};

const team = (fighters, support = [], vehicles = []) => ({ fighters, support, vehicles });

export const scenarios = {
  'south-carolina': {
    label: 'Южная Каролина · 1863', speed: 13, range: 52, fire: 1.8,
    teams: [team(['union'], ['union-scout'], ['parrott']), team(['confederate'], [], ['napoleon'])],
  },
  palestine: {
    label: 'Палестинская кампания · 1917–1918', speed: 16, range: 69, fire: 1.1,
    teams: [team(['light-horse-rider']), team(['ottoman-1917'], ['ottoman-medic'], ['krupp'])],
  },
  'western-front': {
    label: 'Западный фронт · 1918', speed: 17, range: 72, fire: 1,
    teams: [team(['tirailleur-1918'], ['nurse-1918'], ['renault']), team(['german-1918'], [], ['a7v'])],
  },
  'eastern-front': {
    label: 'Восточный фронт · 1943', speed: 18, range: 72, fire: .8,
    teams: [team(['soviet-sniper'], ['soviet-tanker'], ['t34']), team(['german-1943'], [], ['stug'])],
  },
  'tank-battle': {
    label: 'Танковое сражение', speed: 17, range: 72, fire: 2, armoredBattle: true,
    teams: [
      team(['soviet-sniper'], [], Array(5).fill('t34')),
      team(['german-1943'], [], Array(5).fill('stug')),
    ],
  },
  vietnam: {
    label: 'Вьетнам · конец 1960-х', speed: 20, range: 72, fire: .65, nuclear: true,
    teams: [team(['us-paratrooper', 'australian-vietnam'], ['nurse-vietnam'], ['huey', 'm113', 'centurion']),
      team(['nva', 'viet-guerrilla'])],
  },
};

export const spriteFiles = [
  ...Object.keys(equipmentSheets),
  ...Object.entries(units).filter(([, unit]) => !unit.sheet).map(([id]) => id),
].map(id => `${id}.webp`);
