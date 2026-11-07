import type { EpisodeRef, WarId } from '../catalog/index.ts';

export type BriefLocale = 'ru' | 'en';
export type CardRef = WarId | EpisodeRef;

export interface CardContent {
  readonly title: string;
  readonly period: string;
  readonly region: string;
  readonly paragraphs: readonly string[];
  readonly sources: readonly Readonly<{ title: string; url: string }>[];
}

export const briefSections = {
  ru: { period: 'Период', region: 'Регион', context: 'Контекст', sources: 'Источники' },
  en: { period: 'Period', region: 'Region', context: 'Context', sources: 'Sources' },
} as const;

const cardId = /^(?:ucdp:[0-9]+|history:[a-z][a-z0-9-]*)(?:\/[a-z][a-z0-9-]*)?$/;
const sourceLine = /^- \[([^\][\n]+)\]\((https:\/\/[^\s()]+)\)$/u;

export function contentId(ref: CardRef): string {
  return typeof ref === 'string' ? ref : ref.warId + '/' + ref.episodeId;
}

function parseSources(source: string, id: string): CardContent['sources'] {
  return source.split('\n').map(line => {
    const match = sourceLine.exec(line);
    if (!match) throw new Error('Invalid source link in ' + id);

    const [, title, value] = match;
    const url = URL.parse(value);
    if (!url || url.protocol !== 'https:' || url.username || url.password || value.includes('\\')) {
      throw new Error('Invalid source link in ' + id);
    }
    return { title, url: url.href };
  });
}

/** Read a bounded Markdown dialect and return text and links for escaped rendering. */
export function parseBriefCollection(markdown: string, locale: BriefLocale): ReadonlyMap<string, CardContent> {
  const text = markdown.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  const result = new Map<string, CardContent>();
  if (!text) return result;
  if (/[<>]/u.test(text)) throw new Error('HTML and angle brackets are forbidden in briefs');
  if (/[\u0000-\u0009\u000B-\u001F\u007F]/u.test(text)) throw new Error('Unexpected control character in briefs');

  const headings = briefSections[locale];
  const records = text.split(/(?=^# )/m);
  for (const record of records) {
    const lines = record.trim().split('\n');
    const id = lines[0].slice(2);
    if (!lines[0].startsWith('# ') || !cardId.test(id)) throw new Error('Invalid brief ID: ' + lines[0]);
    if (result.has(id)) throw new Error('Duplicate brief: ' + id);

    const sections = lines.slice(1).join('\n').trim().split(/^### /m);
    if (sections.length !== 5) throw new Error('Expected four sections in ' + id);

    const [heading, ...body] = sections;
    const title = /^## ([^\n]+)\n*$/u.exec(heading)?.[1].trim();
    if (!title) throw new Error('Invalid title in ' + id);

    const values = Object.values(headings).map((label, index) => {
      const section = body[index];
      const labelLine = label + '\n';
      if (!section.startsWith(labelLine)) throw new Error('Missing section ' + label + ' in ' + id);
      const value = section.slice(labelLine.length).trim();
      if (!value) throw new Error('Empty section ' + label + ' in ' + id);
      return value;
    });
    const [period, region, context, sources] = values;
    if (period.includes('\n') || region.includes('\n')) throw new Error('Invalid period or region in ' + id);

    const paragraphs = context.split(/\n{2,}/).map(paragraph => paragraph.replace(/\n/g, ' '));
    if (paragraphs.some(paragraph => /^#{1,6}\s|^!\[|^>/u.test(paragraph))) {
      throw new Error('Unexpected block markup in ' + id);
    }

    result.set(id, { title, period, region, paragraphs, sources: parseSources(sources, id) });
  }
  return result;
}

export function validateContentCoverage(
  collections: Readonly<Record<BriefLocale, ReadonlyMap<string, CardContent>>>,
  requiredIds: readonly string[],
): void {
  const required = new Set(requiredIds);
  for (const locale of ['ru', 'en'] as const) {
    for (const id of required) {
      if (!collections[locale].has(id)) throw new Error('Missing ' + locale + ' brief: ' + id);
    }
    for (const id of collections[locale].keys()) {
      if (!required.has(id)) throw new Error('Unexpected ' + locale + ' brief: ' + id);
    }
  }
}
