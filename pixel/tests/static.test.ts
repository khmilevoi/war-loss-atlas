import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderStartupHtml, validateInterfaceCopy } from '../src/content/build';

const locales = [
  ['ru', 'Карта собирается', 'Не удалось загрузить карту.', 'Повторить загрузку'],
  ['en', 'Assembling the map', 'The map could not be loaded.', 'Try loading again'],
] as const;

describe('static locale entries', () => {
  for (const [locale, status, error, retry] of locales) {
    it(`shows the ${locale} loading status before the client starts`, () => {
      const entry = new URL(`../${locale}/index.html`, import.meta.url);
      expect(existsSync(entry), `missing ${locale} entry HTML`).toBe(true);
      const html = renderStartupHtml(readFileSync(entry, 'utf8'));

      expect(html).toContain(`<html lang="${locale}">`);
      expect(html).toMatch(new RegExp(`<p[^>]+role="status"[^>]*>${status}</p>`));
      expect(html).toContain(`data-startup-error="${error}"`);
      expect(html).toContain(`data-startup-retry="${retry}"`);
      expect(html).toContain('src="/src/app/main.tsx"');
      expect(html).not.toMatch(/%atlas-[a-z-]+%/u);
    });
  }

  it('rejects a missing interface translation in either locale', () => {
    expect(() => validateInterfaceCopy({ ru: { title: 'Атлас' }, en: {} })).toThrow('Missing en interface copy: title');
    expect(() => validateInterfaceCopy({ ru: {}, en: { title: 'Atlas' } })).toThrow('Missing ru interface copy: title');
  });
});
