import type { Episode } from './index.ts';

const sourceUrl = 'https://www.awm.gov.au/collection/E84287';

export const ww1Episodes = [
  {
    warId: 'history:ww1',
    episodeId: 'beersheba',
    names: { ru: 'Сражение у Беэр-Шевы', en: 'Battle of Beersheba' },
    period: { from: 1917, to: 1917 },
    date: { iso: '1917-10-31', precision: 'day', sourceUrl },
    anchor: null,
    estimate: {
      metric: 'battle_deaths',
      qualifier: 'unknown',
      value: null,
      low: null,
      high: null,
      comparisonKey: null,
      source: { title: 'Australian War Memorial — Attack on Beersheba', url: sourceUrl },
      scope: 'Погибшие в сражении у Беэр-Шевы.',
      uncertainty: 'В атласе нет отдельной оценки погибших в этом сражении.',
    },
  },
] as const satisfies readonly Episode[];
