import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { AtlasData } from '../../../src/data/types.ts';
import { ww1Episodes } from '../catalog/ww1-episodes.ts';
import { ww2Episodes } from '../catalog/ww2-episodes.ts';
import { copy, startupCopy } from '../i18n/atlas-copy.ts';
import { contentId, parseBriefCollection, validateContentCoverage } from './parse.ts';

const moduleId = 'virtual:pixel-atlas-briefs';
const resolvedId = '\0' + moduleId;
const locales = ['ru', 'en'] as const;

export function renderStartupHtml(html: string): string {
  const locale = /<html lang="(ru|en)">/u.exec(html)?.[1] as keyof typeof startupCopy | undefined;
  if (!locale) throw new Error('Missing supported locale in initial HTML');

  const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  return html
    .replaceAll('%atlas-title%', escapeHtml(startupCopy[locale].title))
    .replaceAll('%atlas-startup-status%', escapeHtml(startupCopy[locale].startupStatus))
    .replaceAll('%atlas-startup-no-script%', escapeHtml(startupCopy[locale].startupNoScript))
    .replaceAll('%atlas-startup-error%', escapeHtml(startupCopy[locale].startupError))
    .replaceAll('%atlas-startup-retry%', escapeHtml(startupCopy[locale].startupRetry));
}

export function validateInterfaceCopy(dictionaries: Readonly<Record<string, Readonly<Record<string, unknown>>>>): void {
  const keys = new Set(locales.flatMap(locale => Object.keys(dictionaries[locale] ?? {})));
  if (keys.size === 0) throw new Error('Missing atlas interface copy');

  for (const key of keys) {
    const values = locales.map(locale => {
      const value = dictionaries[locale]?.[key];
      const strings = Array.isArray(value) ? value : [value];
      if (strings.length === 0 || strings.some(text => typeof text !== 'string' || !text.trim())) {
        throw new Error(`Missing ${locale} interface copy: ${key}`);
      }
      return value;
    });
    const [ru, en] = values;
    if (Array.isArray(ru) !== Array.isArray(en)
      || (Array.isArray(ru) && Array.isArray(en) && ru.length !== en.length)) {
      throw new Error(`Mismatched interface copy: ${key}`);
    }
  }
}

export function atlasContent(): Plugin {
  return {
    name: 'pixel-atlas-content',
    transformIndexHtml: renderStartupHtml,
    resolveId(id) {
      if (id === moduleId) return resolvedId;
    },
    load(id) {
      if (id !== resolvedId) return;

      validateInterfaceCopy(copy);
      const readInput = (file: string) => {
        const path = fileURLToPath(new URL(file, import.meta.url));
        this.addWatchFile(path);
        return readFileSync(path, 'utf8');
      };
      const readLocale = (locale: typeof locales[number]) => parseBriefCollection(
        readInput(`historical-${locale}.md`) + '\n' + readInput(`ucdp-${locale}.md`),
        locale,
      );
      const collections = { ru: readLocale('ru'), en: readLocale('en') };
      const atlas: Pick<AtlasData, 'conflicts' | 'historicalHighlights'> = JSON.parse(
        readInput('../../../src/data/generated/atlas.json'),
      );
      validateContentCoverage(collections, [
        ...atlas.conflicts.map(({ id }) => `ucdp:${id}`),
        ...atlas.historicalHighlights.map(({ highlight_id }) => `history:${highlight_id}`),
        ...[...ww1Episodes, ...ww2Episodes].map(contentId),
      ]);

      return 'export default ' + JSON.stringify({ ru: [...collections.ru], en: [...collections.en] });
    },
  };
}
