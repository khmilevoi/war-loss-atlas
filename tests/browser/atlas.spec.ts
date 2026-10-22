import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { parse } from 'csv-parse/sync';
import type { NativeRow } from '../../src/data/types';

const rowKey = (row: NativeRow) => `${row.conflict_id}:${row.year}`;
const natural = new Intl.Collator('ru', { numeric: true }).compare;
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('/data');
  await page.waitForLoadState('networkidle');
  // Attach for assertions after each complete flow, including hydration and HMR.
  (page as any).atlasErrors = errors;
});
test.afterEach(async ({ page }) => { expect((page as any).atlasErrors).toEqual([]); });

test('virtual table keeps all 1650 records with bounded DOM and reaches final sorted row', async ({ page }) => {
  const region = page.getByRole('region', { name: 'Таблица исходных данных' });
  await expect(region).toBeVisible();
  await region.evaluate(element => { element.style.height = '480px'; });
  const table = region.getByRole('table');
  await expect(table).toHaveAttribute('aria-rowcount', '1651');
  await expect.poll(() => region.locator('[data-row-id]').count()).toBeLessThanOrEqual(26);
  const rows = await page.locator('#atlas-initial').evaluate(element => JSON.parse(element.textContent!).data.nativeRows as NativeRow[]);
  const sorted = rows.sort((a, b) => a.year - b.year || natural(rowKey(a), rowKey(b)));
  await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(region.locator('[data-row-id]').last()).toHaveAttribute('data-row-id', rowKey(sorted.at(-1)!));
  await expect(region.locator('[data-row-id]').last()).toHaveAttribute('aria-rowindex', '1651');
  await page.getByLabel('Сортировка').selectOption('bd_best:desc');
  const bestSorted = rows.sort((a, b) => (a.bd_best === null ? 1 : b.bd_best === null ? -1 : b.bd_best - a.bd_best)
    || natural(rowKey(a), rowKey(b)));
  await expect(region.locator('[data-row-id]').first()).toHaveAttribute('data-row-id', rowKey(bestSorted[0]));
  await region.evaluate(element => { element.scrollTop = element.scrollHeight; });
  await expect(region.locator('[data-row-id]').last()).toHaveAttribute('data-row-id', rowKey(bestSorted.at(-1)!));
});

test('virtual table keyboard focus survives End Arrow Enter Escape and unmounted selection', async ({ page }) => {
  const region = page.getByRole('region', { name: 'Таблица исходных данных' });
  await region.focus();
  await region.press('End');
  const active = region.locator('[data-row-id]:focus-within');
  await expect(active).toHaveAttribute('aria-rowindex', '1651');
  await page.keyboard.press('ArrowUp');
  await expect(active).toHaveAttribute('aria-rowindex', '1650');
  const key = await active.getAttribute('data-row-id');
  await page.keyboard.press('Enter');
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(detail).toBeVisible();
  await expect(detail.locator('[data-native-field]')).toHaveCount(25);
  await detail.getByRole('button', { name: 'Закрыть подробности' }).focus();
  await region.evaluate(element => { element.scrollTop = 0; });
  await expect(region.locator(`[data-row-id="${key}"]`)).toHaveCount(0);
  await expect(detail).toBeVisible();
  await detail.getByRole('button', { name: 'Закрыть подробности' }).focus();
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(region).toBeFocused();
  // Sort reorders around the same active source row, rather than reusing an index.
  await page.getByLabel('Сортировка').selectOption('year:desc');
  await region.focus();
  await page.keyboard.press('ArrowDown');
  await expect(region.locator('[data-row-id]:focus-within')).toHaveCount(1);
});

test('virtual table search covers offscreen participants and CSV exports every filtered row and field', async ({ page }) => {
  await page.getByLabel('Поиск по исходным данным').fill('Paraguay');
  await expect(page.getByText('Включая участников; показываем все годы найденного конфликта')).toBeVisible();
  const table = page.getByRole('table', { name: 'Исходные строки UCDP' });
  await expect.poll(async () => Number(await table.getAttribute('aria-rowcount'))).toBeGreaterThan(2);
  const allRows = await page.locator('#atlas-initial').evaluate(element => JSON.parse(element.textContent!).data.nativeRows as NativeRow[]);
  const ids = new Set(allRows.filter(row => Object.values(row).some(value => String(value).toLowerCase().includes('paraguay'))).map(row => row.conflict_id));
  const expected = allRows.filter(row => ids.has(row.conflict_id));
  await expect(table).toHaveAttribute('aria-rowcount', String(expected.length + 1));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV' }).click();
  const download = await downloadPromise;
  const parsed = parse(await readFile((await download.path())!), { columns: true }) as NativeRow[];
  expect(parsed).toHaveLength(expected.length);
  expect(Object.keys(parsed[0])).toHaveLength(25);
  expect(new Set(parsed.map((row: NativeRow) => rowKey(row)))).toEqual(new Set(expected.map(rowKey)));
  await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
  await expect(table).toHaveAttribute('aria-rowcount', '1651');
  const fullDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV' }).click();
  const fullDownload = await fullDownloadPromise;
  expect(parse(await readFile((await fullDownload.path())!), { columns: true })).toHaveLength(1650);
  await page.getByLabel('Поиск по исходным данным').fill('нет-такого-конфликта-xyz');
  await expect(page.getByRole('status')).toContainText('Ничего не найдено');
  await expect(page.getByRole('button', { name: 'Скачать CSV' })).toBeDisabled();
});

test('virtual table responds to region resize and 360px horizontal scroll stays inside table', async ({ page }) => {
  const region = page.getByRole('region', { name: 'Таблица исходных данных' });
  await region.evaluate(element => { element.style.height = '480px'; element.scrollTop = 6400; });
  await expect.poll(() => region.locator('[data-row-id]').count()).toBeGreaterThan(20);
  const before = await region.locator('[data-row-id]').count();
  await region.evaluate(element => { element.style.height = '720px'; });
  await expect.poll(() => region.locator('[data-row-id]').count()).toBeGreaterThan(before);
  await page.setViewportSize({ width: 360, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await region.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
  await region.evaluate(element => { element.scrollLeft = element.scrollWidth; });
  expect(await region.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});

test('data filters use first observation and keep historical definitions separate with their own CSV', async ({ page }) => {
  await expect(page.getByText('Первый год наблюдения в UCDP', { exact: true })).toBeVisible();
  await page.getByLabel('Первый год наблюдения, от').fill('2025');
  await page.getByLabel('Полнота оценок').selectOption('complete');
  await expect(page.getByText(/не по началу войны/).first()).toBeVisible();
  await page.getByRole('tab', { name: 'Исторические примеры' }).click();
  await expect(page.locator('[data-history-id]')).toHaveCount(4);
  await expect(page.getByText('Около 16 млн — оценка NARA')).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать CSV' }).click();
  const download = await downloadPromise;
  const parsed = parse(await readFile((await download.path())!), { columns: true }) as Record<string, string>[];
  expect(parsed).toHaveLength(4);
  expect(Object.keys(parsed[0])).toContain('source_url');
  expect(Object.keys(parsed[0])).not.toContain('bd_best');
  await page.getByRole('tab', { name: 'UCDP: конфликт — год' }).click();
  await expect(page.getByRole('table')).toHaveAttribute('aria-rowcount', '1651');
  await page.goto('/data?q=India&selected=11345');
  await expect(page.locator('section[data-layer]')).toHaveAttribute('data-selected-id', '11345');
  await expect(page.getByRole('region', { name: 'Подробности записи' })).toBeVisible();
});

test('native development navigation retains one push and Back with direct query hydration', async ({ page }) => {
  const source = await readFile(new URL('./native-navigation.browser.js', import.meta.url), 'utf8');
  const regression = Function(`return (${source})`)();
  await regression(page);
});

test('historical layer shows its own coverage instead of UCDP statistics', async ({ page }) => {
  await page.getByRole('tab', { name: 'Исторические примеры' }).click();
  const coverage = page.getByRole('definition').filter({ hasText: '1861–1953' });
  await expect(coverage).toBeVisible();
  await expect(page.locator('.dataset-stats')).toContainText('4');
  await expect(page.locator('.dataset-stats')).not.toContainText('1 650');
  await expect(page.locator('.source-summary')).toContainText('NARA');
  await expect(page.locator('.source-summary')).not.toContainText('1989–2025');
});

test('historical layer and expanded details fit 360px without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByRole('tab', { name: 'Исторические примеры' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Вторая мировая война', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Подробности записи' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
