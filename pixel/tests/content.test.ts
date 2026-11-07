import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseBriefCollection, readBriefCollections, readCardContent, validateContentCoverage } from '../src/content';
import { readCatalog } from '../src/catalog';
import { loadAtlasData } from '../../src/data';
import { generateUcdpBriefs } from '../src/content/generate-ucdp';
import ucdpRu from '../src/content/ucdp-ru.md?raw';
import ucdpEn from '../src/content/ucdp-en.md?raw';

const minimal = [
  '# ucdp:205',
  '## Iran — Kurdistan',
  '### Period',
  '1990–2018',
  '### Region',
  'Middle East · Iran',
  '### Context',
  'The records name the KDPI among the opposing parties.',
  '### Sources',
  '- [UCDP v26.1](https://ucdp.uu.se/downloads/)',
].join('\n');

describe('brief collections', () => {
  it('keeps the two episode identities and their specific dates and sources', () => {
    const hiroshima = readCardContent({ warId: 'history:ww2', episodeId: 'hiroshima' }, 'en');
    const nagasaki = readCardContent({ warId: 'history:ww2', episodeId: 'nagasaki' }, 'ru');
    expect(hiroshima).toMatchObject({ period: '6 August 1945', region: 'Hiroshima, Japan' });
    expect(hiroshima?.paragraphs.join(' ')).toMatch(/140,000.*December 1945/);
    expect(nagasaki).toMatchObject({ period: '9 августа 1945 года', region: 'Ураками, Нагасаки, Япония' });
    expect(nagasaki?.paragraphs.join(' ')).toMatch(/73 884.*декабря 1945/);
    expect(readCardContent({ warId: 'history:ww1', episodeId: 'hiroshima' }, 'ru')).toBeNull();
  });

  it('fails closed on HTML, disallowed URLs and repeated IDs', () => {
    expect(() => parseBriefCollection(minimal.replace('The records', '<img onerror=alert(1)>'), 'en')).toThrow(/HTML/);
    expect(() => parseBriefCollection(minimal.replace('https://ucdp.uu.se/downloads/', 'javascript:alert(1)'), 'en')).toThrow(/source link/i);
    expect(() => parseBriefCollection(minimal.replace('https://ucdp.uu.se/downloads/', 'https://ucdp.uu.se@evil.example'), 'en')).toThrow(/source link/i);
    expect(() => parseBriefCollection([minimal, minimal].join('\n'), 'en')).toThrow(/Duplicate/);
  });

  it('rejects a missing translation and a record outside the release inventory', () => {
    const en = parseBriefCollection(minimal, 'en');
    expect(() => validateContentCoverage({ ru: new Map(), en }, ['ucdp:205'])).toThrow(/Missing ru.*ucdp:205/);
    expect(() => validateContentCoverage({ ru: en, en }, [])).toThrow(/Unexpected ru.*ucdp:205/);
  });

  it('has paired, sourced briefs for every published war, including unplaced records', () => {
    const { wars } = readCatalog();
    validateContentCoverage(readBriefCollections(), [
      ...wars.map(war => war.id),
      'history:ww1/beersheba',
      'history:ww2/hiroshima',
      'history:ww2/nagasaki',
    ]);
    for (const { id, period } of wars) {
      const en = readCardContent(id, 'en');
      const ru = readCardContent(id, 'ru');
      const expectedPeriod = period.from === period.to ? String(period.from) : [period.from, period.to].join('–');
      expect(en, id).toMatchObject({ period: expectedPeriod });
      expect(ru, id).toMatchObject({ period: expectedPeriod });
      expect(en?.sources.map(source => source.url), id).toEqual(ru?.sources.map(source => source.url));
    }
    expect(readCardContent('ucdp:205', 'ru')).toMatchObject({ title: 'Иран — Курдистан' });
    expect(readCardContent('ucdp:205', 'en')?.paragraphs.join(' ')).toContain('Iraq');
    expect(readCardContent('ucdp:218', 'ru')).toMatchObject({ title: 'Индия и Пакистан — Кашмир' });
  });

  it('reproduces both published UCDP collections from the frozen source', () => {
    const data = loadAtlasData();
    const digest = (value: string) => createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');
    expect(digest(generateUcdpBriefs(data, 'ru'))).toBe(digest(ucdpRu));
    expect(digest(generateUcdpBriefs(data, 'en'))).toBe(digest(ucdpEn));
  });

  it('uses readable, period-appropriate actor and country names in both languages', () => {
    const context = (id: `ucdp:${string}`, locale: 'ru' | 'en') =>
      readCardContent(id, locale)?.paragraphs.join(' ');

    expect(context('ucdp:13246', 'ru')).toContain('правительство (Россия)');
    expect(context('ucdp:13246', 'en')).toContain('Government of Russia');
    expect(context('ucdp:13246', 'en')).not.toContain('Soviet Union');
    expect(context('ucdp:234', 'ru')).toContain('ХАМАС');
    expect(context('ucdp:234', 'ru')).not.toContain('Северный Йемен');
    expect(context('ucdp:371', 'ru')).toContain('правительство (Бахрейн)');
    expect(context('ucdp:371', 'ru')).not.toContain('Government of');
    expect(context('ucdp:205', 'ru')).toContain('Демократическая партия Иранского Курдистана');
  });
});
