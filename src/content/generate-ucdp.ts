import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadAtlasData } from '../data';
import type { AtlasData, NativeRow } from '../data';
import { briefSections } from './parse';
import type { BriefLocale } from './parse';
import { actorLabelsByConflict, additionalCountriesRu, territoriesRu } from './ucdp-names-ru';

const regionNames: Readonly<Record<string, Readonly<Record<BriefLocale, string>>>> = {
  '1': { ru: 'Европа', en: 'Europe' },
  '2': { ru: 'Ближний Восток', en: 'Middle East' },
  '3': { ru: 'Азия', en: 'Asia' },
  '4': { ru: 'Африка', en: 'Africa' },
  '5': { ru: 'Северная и Южная Америка', en: 'Americas' },
};

const ucdpSources = {
  ru: [
    '[UCDP BRD 26.1 — определения и методика](https://ucdp.uu.se/downloads/brd/ucdp-brd-codebook-261.pdf)',
    '[Davies, Pettersson и Öberg — публикация и материалы к версии 26.1](https://ucdp.uu.se/downloads/replication_data.html)',
  ],
  en: [
    '[UCDP BRD 26.1 — definitions and methods](https://ucdp.uu.se/downloads/brd/ucdp-brd-codebook-261.pdf)',
    '[Davies, Pettersson and Öberg — release paper and replication data](https://ucdp.uu.se/downloads/replication_data.html)',
  ],
} as const;

function splitLabels(value: string | null): string[] {
  return value ? value.split(/,\s*/u).filter(Boolean) : [];
}

function valuesFor(rows: readonly NativeRow[], key: 'location_inc' | 'battle_location' | 'region'): string[] {
  return [...new Set(rows.flatMap(row => splitLabels(row[key])))];
}

function russianCountries(data: AtlasData): ReadonlyMap<string, string> {
  const names = new Map(data.countryAnchors.flatMap(anchor =>
    anchor.aliases.map(alias => [alias, anchor.display_name] as const)));
  for (const [country, name] of Object.entries(additionalCountriesRu)) names.set(country, name);
  return names;
}

function countryName(name: string, year: number, locale: BriefLocale, russian: ReadonlyMap<string, string>): string {
  // Keep the original dataset alias in the transition year, which has no month in BRD.
  let label = name;
  if (name === 'Russia (Soviet Union)' && year !== 1991) label = year < 1991 ? 'Soviet Union' : 'Russia';
  if (name === 'Yemen (North Yemen)' && year !== 1990) label = year < 1990 ? 'North Yemen' : 'Yemen';
  if (name === 'DR Congo (Zaire)' && year !== 1997) label = year < 1997 ? 'Zaire' : 'DR Congo';
  if (name === 'Vietnam (North Vietnam)') label = 'Vietnam';
  if (locale === 'en') return label;
  const translation = russian.get(label);
  if (!translation) throw new Error('Untranslated country: ' + label);
  return translation;
}

function countriesFor(
  rows: readonly NativeRow[], key: 'location_inc' | 'battle_location', locale: BriefLocale,
  russian: ReadonlyMap<string, string>,
): string[] {
  return [...new Set(rows.flatMap(row => splitLabels(row[key]).map(name => countryName(name, row.year, locale, russian))))];
}

function territoryName(name: string, locale: BriefLocale): string {
  if (locale === 'en') return name;
  const translation = territoriesRu[name];
  if (!translation) throw new Error('Untranslated territory: ' + name);
  return translation;
}

function joined(names: readonly string[], locale: BriefLocale): string {
  return new Intl.ListFormat(locale, { type: 'conjunction' }).format(names);
}

function actorNames(
  value: string | null, row: NativeRow, locale: BriefLocale, russian: ReadonlyMap<string, string>,
  maxNames = Infinity,
): string {
  if (!value) return locale === 'ru' ? 'сторона не указана' : 'side unspecified';
  // Party names can include comma-separated notes in parentheses.
  const labels = value.split(/,\s*(?![^()]*\))/u);
  const names = labels.slice(0, maxNames).map(name => {
    const translation = actorLabelsByConflict[row.conflict_id]?.[name];
    if (translation) return translation[locale];
    const government = name.match(/^Government of (.+)$/u);
    if (government) {
      const country = countryName(government[1], row.year, locale, russian);
      return locale === 'ru' ? 'правительство (' + country + ')' : 'Government of ' + country;
    }
    return locale === 'ru' ? russian.get(name) ?? name : name;
  });
  const remaining = labels.length - names.length;
  if (remaining > 0) names.push(locale === 'ru' ? `ещё ${remaining} из списка UCDP` : `${remaining} others in the UCDP record`);
  return joined(names, locale);
}

function describeParties(
  first: NativeRow,
  last: NativeRow,
  locale: BriefLocale,
  russian: ReadonlyMap<string, string>,
): string {
  const a = actorNames(first.side_a, first, locale, russian);
  const b = actorNames(first.side_b, first, locale, russian);
  const aLater = actorNames(last.side_a, last, locale, russian);
  const bLater = actorNames(last.side_b, last, locale, russian);
  const unchanged = a === aLater && b === bLater;
  if (locale === 'ru') {
    const initial = 'В записи UCDP за ' + first.year + ' год сторона А — ' + a + '. Сторона Б — ' + b + '.';
    if (unchanged) return initial;
    return initial + ' В записи за ' + last.year + ' год перечень меняется. Сторона А — ' + aLater + '. Сторона Б — ' + bLater + '.';
  }
  const initial = 'In the ' + first.year + ' UCDP record, side A is ' + a + '. Side B is ' + b + '.';
  if (unchanged) return initial;
  return initial + ' The ' + last.year + ' record gives a different line-up. Side A is ' + aLater + '. Side B is ' + bLater + '.';
}

function describeCoverage(rows: readonly NativeRow[], locale: BriefLocale): string | null {
  const years = rows.map(row => row.year);
  if (years.length === 1) return null;
  const runs = [{ first: years[0], last: years[0] }];
  for (const year of years.slice(1)) {
    const previous = runs[runs.length - 1];
    if (year === previous.last + 1) previous.last = year;
    else runs.push({ first: year, last: year });
  }
  if (runs.length < 2) return null;
  if (runs.length <= 4) {
    const periods = joined(runs.map(run => formatYears(run.first, run.last)), locale);
    return locale === 'ru'
      ? 'В наборе есть записи за ' + periods + '. Пропуски не означают, что боевых потерь не было.'
      : 'The dataset has records for ' + periods + '. Gaps do not establish that there were no battle deaths.';
  }
  return locale === 'ru'
    ? 'В этом интервале UCDP приводит данные за ' + years.length + ' отдельных лет с перерывами.'
    : 'UCDP reports observations for ' + years.length + ' years within this span, with gaps between them.';
}

function describeGeography(
  rows: readonly NativeRow[],
  locale: BriefLocale,
  russian: ReadonlyMap<string, string>,
): string | null {
  const locations = new Set(countriesFor(rows, 'location_inc', locale, russian));
  const battles = countriesFor(rows, 'battle_location', locale, russian);
  if (battles.length === locations.size && battles.every(country => locations.has(country))) return null;
  const names = joined(battles, locale);
  return locale === 'ru'
    ? 'UCDP отмечает боевые потери в следующих странах — ' + names + '. Набор не распределяет сумму по странам.'
    : 'UCDP records battle deaths in ' + names + '. These records do not divide the total by country.';
}

function describeTroopSupport(
  rows: readonly NativeRow[],
  locale: BriefLocale,
  russian: ReadonlyMap<string, string>,
): string | null {
  const supported = rows.find(row => row.side_a_2nd || row.side_b_2nd);
  if (!supported) return null;
  const troopSides = [];
  for (const [support, party] of [
    [supported.side_a_2nd, supported.side_a],
    [supported.side_b_2nd, supported.side_b],
  ] as const) {
    if (!support) continue;
    const side = actorNames(party, supported, locale, russian);
    const supporters = actorNames(support, supported, locale, russian, 4);
    troopSides.push(side + ' — ' + supporters);
  }
  const detail = troopSides.join(' / ');
  return locale === 'ru'
    ? 'В ' + supported.year + ' году UCDP также фиксирует участие иностранных войск на стороне основных участников (' + detail + ').'
    : 'In ' + supported.year + ', UCDP also records foreign troop support for the main parties (' + detail + ').';
}

function describeConcentration(rows: readonly NativeRow[], locale: BriefLocale): string | null {
  if (rows.length < 2 || rows.some(row => row.bd_best === null)) return null;
  const peak = rows.reduce((largest, row) => (row.bd_best ?? 0) > (largest.bd_best ?? 0) ? row : largest);
  const value = peak.bd_best ?? 0;
  const total = rows.reduce((sum, row) => sum + (row.bd_best ?? 0), 0);
  if (value <= total / 2) return null;
  const number = new Intl.NumberFormat(locale).format(value);
  return locale === 'ru'
    ? 'Более половины учтённых в этом ряду потерь приходится на ' + peak.year + ' год. Основная оценка UCDP за этот год — ' + number + ' погибших.'
    : 'More than half the deaths in the series fall in ' + peak.year + ', when UCDP’s best estimate was ' + number + ' deaths.';
}

function formatYears(from: number, to: number): string {
  return from === to ? String(from) : from + '–' + to;
}

function generateRecord(
  conflictId: string,
  rows: readonly NativeRow[],
  locale: BriefLocale,
  russian: ReadonlyMap<string, string>,
): string {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const country = joined(countriesFor([first], 'location_inc', locale, russian), locale);
  const territory = first.territory_name && territoryName(first.territory_name, locale);
  const issue = territory ?? (locale === 'ru' ? 'государственная власть' : 'government');
  const title = country + ' — ' + issue;
  const period = formatYears(first.year, last.year);
  const regions = joined(valuesFor(rows, 'region').map(code => {
    const region = regionNames[code];
    if (!region) throw new Error('Unrecognized UCDP region: ' + code);
    return region[locale];
  }), locale);
  const locations = joined(countriesFor(rows, 'location_inc', locale, russian), locale);
  const region = regions + ' · ' + locations;
  const paragraphs = [
    describeParties(first, last, locale, russian),
    describeGeography(rows, locale, russian),
    describeTroopSupport(rows, locale, russian) ?? describeCoverage(rows, locale) ?? describeConcentration(rows, locale),
  ].filter((paragraph): paragraph is string => paragraph !== null);
  const sections = briefSections[locale];
  const dataset = locale === 'ru' ? 'данные «конфликт–год»' : 'conflict-year data';
  const actorSource = locale === 'ru' ? 'Справочник участников UCDP 26.1' : 'UCDP Actor Dataset 26.1';
  return [
    '# ucdp:' + conflictId,
    '## ' + title,
    '',
    '### ' + sections.period,
    period,
    '',
    '### ' + sections.region,
    region,
    '',
    '### ' + sections.context,
    paragraphs.join('\n\n'),
    '',
    '### ' + sections.sources,
    `- [UCDP BRD 26.1 — ${dataset}, ID ${conflictId}](https://ucdp.uu.se/downloads/brd/ucdp-brd-conf-261-csv.zip)`,
    ...(actorLabelsByConflict[conflictId] ? [`- [${actorSource}](https://ucdp.uu.se/downloads/actor/ucdp-actor-261-csv.zip)`] : []),
    ...ucdpSources[locale].map(source => '- ' + source),
  ].join('\n');
}

/** Derive bounded case briefs directly from the versioned conflict-year input. */
export function generateUcdpBriefs(data: AtlasData, locale: BriefLocale): string {
  const russian = russianCountries(data);
  const rowsByConflict = new Map<string, NativeRow[]>();
  for (const row of data.nativeRows) {
    const rows = rowsByConflict.get(row.conflict_id) ?? [];
    rows.push(row);
    rowsByConflict.set(row.conflict_id, rows);
  }

  const records = data.conflicts.map(({ id }) => {
    const rows = rowsByConflict.get(id);
    if (!rows?.length) throw new Error('Missing conflict-year rows for ' + id);
    rows.sort((a, b) => a.year - b.year);
    return generateRecord(id, rows, locale, russian);
  });
  return records.join('\n\n') + '\n';
}

const entry = process.argv[1];
if (entry && pathToFileURL(entry).href === import.meta.url) {
  const data = loadAtlasData();
  for (const locale of ['ru', 'en'] as const) {
    writeFileSync(new URL('./ucdp-' + locale + '.md', import.meta.url), generateUcdpBriefs(data, locale), 'utf8');
  }
}
