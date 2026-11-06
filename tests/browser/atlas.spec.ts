import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { parse } from 'csv-parse/sync';
import type { NativeRow } from '../../src/data/types';

const rowKey = (row: NativeRow) => `${row.conflict_id}:${row.year}`;
const natural = new Intl.Collator('ru', { numeric: true }).compare;
// Same lazy-module boundary in Vite development and the compiled release.
const rendererModule = /\/(?:src\/ui\/GlobeCanvas\.tsx|assets\/GlobeCanvas-[\w-]+\.js)(?:\?.*)?$/;
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

test('landing defaults to a shared register and synchronizes flat map markers with search and selection', async ({ page }) => {
  await page.goto('/');
  const list = page.getByRole('region', { name: 'Реестр событий' });
  const map = page.getByTestId('flat-map');
  await expect(page.getByRole('button', { name: 'Все записи', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(map).toBeVisible();
  await expect(map.locator('[data-marker-kind="history"]').first()).toBeVisible();
  await expect(map.locator('[data-marker-kind="ucdp"]').first()).toBeVisible();
  await expect(list.locator('[data-conflict-id]')).toHaveCount(206);
  await expect(list.locator('[data-conflict-id="11345"]')).toContainText('Без метки на карте');

  await page.getByRole('searchbox', { name: 'Поиск по названию, региону, стране' }).fill('Первая мировая');
  await expect(list.locator('[data-conflict-id]')).toHaveCount(1);
  await expect(map.getByTestId('map-marker')).toHaveCount(1);
  await map.locator('[data-record-ids="ww1"]').click();
  await expect(list.locator('[data-conflict-id="ww1"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Подробности записи' })).toContainText('Около 16 млн');
});

test('landing historical preview pins on activation and repeated activation closes', async ({ page }) => {
  await page.goto('/?layer=history');
  const list = page.getByRole('region', { name: 'Реестр событий' });
  await expect(list.locator('[data-conflict-id]')).toHaveCount(4);
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(detail).toContainText('Более 65 млн');
  const first = list.locator('[data-conflict-id="ww1"]');
  await first.hover();
  await expect(detail).toContainText('Около 16 млн');
  await first.click();
  await expect(detail).toContainText('Около 16 млн');
  const korea = list.locator('[data-conflict-id="korea"]');
  await korea.focus();
  await expect(detail).toContainText('Около 16 млн');
  await first.click();
  await expect(detail).toHaveCount(0);
  await korea.focus();
  await expect(detail).toContainText('гражданских');
  await korea.press('Enter');
  await expect(detail).toContainText('Около 2 млн');
  await first.hover();
  await expect(detail).toContainText('Около 2 млн');
  await korea.press('Enter');
  await expect(detail).toHaveCount(0);
  await korea.press('Enter');
  await expect(detail).toContainText('Около 2 млн');
  await page.keyboard.press('Escape');
  await expect(detail).toHaveCount(0);
  await expect(korea).toBeFocused();
});

test('landing modern layer exposes all unknown and coincident anchors with whole source totals', async ({ page }) => {
  await page.goto('/?layer=ucdp');
  await expect(page.getByTestId('map-coverage')).toContainText('94 из 202 на карте · 108 без метки');
  const list = page.getByRole('region', { name: 'Реестр событий' });
  await expect(list.locator('[data-conflict-id]')).toHaveCount(202);
  await list.locator('[data-conflict-id="11345"]').click();
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(detail).toContainText('весь доступный ряд');
  await expect(detail).toContainText('без координат');
  await expect(page.getByTestId('map-period')).toContainText(/наблюдени|наблюдаем/i);
  const coincident = await page.locator('#atlas-initial').evaluate(element => {
    const placements = JSON.parse(element.textContent!).data.placements as { conflict_id?: string; latitude: number | null; longitude: number | null }[];
    const groups = new Map<string, string[]>();
    for (const placement of placements) {
      if (!placement.conflict_id || placement.latitude === null) continue;
      const key = `${placement.latitude}:${placement.longitude}`;
      groups.set(key, [...(groups.get(key) ?? []), placement.conflict_id]);
    }
    return [...groups.values()].find(group => group.length > 1)!;
  });
  expect(coincident.length).toBeGreaterThan(1);
  for (const id of coincident.slice(0, 2)) {
    await list.locator(`[data-conflict-id="${id}"]`).click();
    await expect(detail).toContainText(`Конфликт ID ${id}:`);
  }
  await page.getByRole('button', { name: 'Исторические примеры', exact: true }).click();
  await expect(list.locator('[data-conflict-id]')).toHaveCount(4);
  await expect(page.getByTestId('map-coverage')).toContainText('4 из 4 на карте');
});

test('globe unavailable keeps navigable historical records', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: any[]) {
      return type.includes('webgl') ? null : (getContext as any).call(this, type, ...args);
    } as any;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  await expect(page.getByTestId('globe-status')).toContainText('Выберите плоскую карту или запись в реестре');
  await page.locator('[data-conflict-id="ww1"]').click();
  await expect(page.getByRole('region', { name: 'Подробности записи' })).toContainText('Около 16 млн');
});

test('globe reduced motion and mobile layout retain readable controls', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  await expect(page.getByTestId('flat-map')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Включить вращение' })).toBeVisible();
  await expect(page.getByTestId('globe-host')).toHaveAttribute('data-rotation', 'paused');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

test('globe import rejection preserves the list and source details', async ({ page }) => {
  await page.route(rendererModule, route => route.fulfill({ contentType: 'text/javascript',
    body: 'throw new Error("Test-only unavailable renderer module")' }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  await expect(page.getByTestId('globe-status')).toContainText('Выберите плоскую карту или запись в реестре');
  await page.locator('[data-conflict-id="us-civil"]').click();
  await expect(page.getByRole('region', { name: 'Подробности записи' })).toContainText('Не менее 750 тыс.');
});

test('globe real marker preview pins across hover and repeat click or tap closes', async ({ browser }) => {
  test.slow();
  const context = await browser.newContext({ viewport: { width: 1536, height: 1024 }, hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    // Test-only inspection of the real renderer; shipped production has no global probe.
    await page.route('**/src/ui/GlobeCanvas.tsx*', async route => {
      const response = await route.fetch();
      const body = (await response.text()).replace('globe = new Globe(', 'globe = window.__testGlobe = new Globe(');
      await route.fulfill({ response, body });
    });
    await page.goto('/?layer=history');
    await page.getByRole('button', { name: 'Глобус', exact: true }).click();
    await expect(page.locator('[data-renderer="ready"]')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('globe-host').scrollIntoViewIfNeeded();
    await page.evaluate(() => {
      const globe = (window as any).__testGlobe, hover = globe.onObjectHover();
      globe.onObjectHover((marker: { ids: string[] } | null, ...rest: unknown[]) => {
        (window as any).__testHovered = marker?.ids ?? [];
        hover(marker, ...rest);
      });
    });
    const point = await page.evaluate(() => {
      const globe = (window as any).__testGlobe;
      const coords = globe.getScreenCoords(46.5, 2.5, .012);
      const bounds = globe.renderer().domElement.getBoundingClientRect();
      return { x: bounds.left + coords.x, y: bounds.top + coords.y };
    });
    await page.mouse.move(point.x, point.y);
    const detail = page.getByRole('region', { name: 'Подробности записи' });
    await expect(detail).toContainText('Около 16 млн');
    await page.mouse.click(point.x, point.y);
    await expect(detail).toContainText('Около 16 млн');
    const other = await page.evaluate(() => {
      const globe = (window as any).__testGlobe;
      const coords = globe.getScreenCoords(51, 9.5, .012);
      const bounds = globe.renderer().domElement.getBoundingClientRect();
      return { x: bounds.left + coords.x, y: bounds.top + coords.y };
    });
    await page.mouse.move(other.x, other.y);
    await expect.poll(() => page.evaluate(() => (window as any).__testHovered)).toContain('ww2');
    await expect(detail).toContainText('Около 16 млн');
    await page.mouse.move(point.x, point.y);
    await expect.poll(() => page.evaluate(() => (window as any).__testHovered)).toContain('ww1');
    await page.mouse.click(point.x, point.y);
    await expect(detail).toHaveCount(0);
    await page.touchscreen.tap(point.x, point.y);
    await expect(detail).toContainText('Около 16 млн');
    await page.touchscreen.tap(point.x, point.y);
    await expect(detail).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__testGlobe.controls().autoRotate)).toBe(false);
  } finally { await context.close(); }
});

for (const mobile of [false, true]) test(`globe shared marker exposes individual members with ${mobile ? 'mobile touch' : 'mouse and keyboard'}`, async ({ browser }) => {
  test.slow();
  const context = await browser.newContext({ viewport: mobile ? { width: 360, height: 800 } : { width: 1536, height: 1024 },
    hasTouch: true, reducedMotion: 'reduce' });
  try {
    const page = await context.newPage();
    await page.route('**/src/ui/GlobeCanvas.tsx*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: (await response.text()).replace('globe = new Globe(', 'globe = window.__testGlobe = new Globe(') });
    });
    await page.goto('/?layer=ucdp');
    await page.getByRole('button', { name: 'Глобус', exact: true }).click();
    await expect(page.locator('[data-renderer="ready"]')).toBeVisible({ timeout: 15_000 });
    await page.getByTestId('globe-host').scrollIntoViewIfNeeded();
    const cluster = page.getByRole('region', { name: 'Конфликты у выбранной метки' });
    if (!mobile) await page.evaluate(() => {
      const globe = (window as any).__testGlobe, hover = globe.onObjectHover();
      globe.onObjectHover((point: { ids: string[] } | null, ...rest: unknown[]) => {
        (window as any).__testHovered = point?.ids ?? [];
        hover(point, ...rest);
      });
    });
    const openAnchor = async (lat: number, lng: number, verifyHoverId?: string) => {
      const point = await page.evaluate(async ({ lat, lng }) => {
        const globe = (window as any).__testGlobe;
        globe.pointOfView({ lat, lng, altitude: 1.65 }, 0);
        // Let OrbitControls update camera matrices before projecting the click.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const coords = globe.getScreenCoords(lat, lng, .012);
        const bounds = globe.renderer().domElement.getBoundingClientRect();
        return { x: bounds.left + coords.x, y: bounds.top + coords.y };
      }, { lat, lng });
      if (mobile) {
        await page.touchscreen.tap(point.x, point.y);
      } else {
        if (verifyHoverId) {
          await page.mouse.move(point.x, point.y);
          await expect.poll(() => page.evaluate(() => (window as any).__testHovered)).toContain(verifyHoverId);
          await expect(cluster).toHaveCount(0);
        }
        await page.mouse.click(point.x, point.y);
      }
    };
    await openAnchor(11, 122.5, '209');
    await expect(cluster).toBeVisible();
    await expect(cluster.locator('[data-cluster-member]')).toHaveCount(2);
    const detail = page.getByRole('region', { name: 'Подробности записи' });
    const first = cluster.locator('[data-cluster-member="209"]');
    if (mobile) await first.tap(); else { await first.focus(); await first.press('Enter'); }
    await expect(detail).toContainText('Конфликт ID 209:');
    const second = cluster.locator('[data-cluster-member="14275"]');
    if (mobile) await second.tap(); else { await second.focus(); await second.press('Enter'); }
    await expect(detail).toContainText('Конфликт ID 14275:');
    if (mobile) await second.tap(); else await second.press('Enter');
    await expect(detail).toHaveCount(0);
    await second.press('Enter');
    await second.press('Escape');
    await expect(detail).toHaveCount(0);
    await expect(second).toBeFocused();
    if (!mobile) {
      await cluster.getByRole('button', { name: 'Закрыть список метки' }).click();
      await page.getByTestId('globe-host').scrollIntoViewIfNeeded();
      await openAnchor(22.5, 79.5);
      await expect(cluster.locator('[data-cluster-member]')).toHaveCount(9);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(mobile ? 360 : 1536);
  } finally { await context.close(); }
});

test('globe remount cleanup cancels animation frames and releases observers', async ({ page }) => {
  await page.addInitScript(() => {
    const probe = (window as any).__resources = { raf: new Set<number>(), observed: new Set<object>() };
    const raf = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    window.requestAnimationFrame = callback => {
      const id = raf(time => { probe.raf.delete(id); callback(time); });
      probe.raf.add(id); return id;
    };
    window.cancelAnimationFrame = id => { probe.raf.delete(id); cancel(id); };
    const NativeObserver = window.ResizeObserver;
    window.ResizeObserver = class extends NativeObserver {
      observe(target: Element, options?: ResizeObserverOptions) { probe.observed.add(this); super.observe(target, options); }
      disconnect() { probe.observed.delete(this); super.disconnect(); }
      unobserve(target: Element) { probe.observed.delete(this); super.unobserve(target); }
    };
  });
  await page.goto('/data');
  await page.waitForLoadState('networkidle');
  const resources = () => page.evaluate(() => ({ raf: (window as any).__resources.raf.size, observers: (window as any).__resources.observed.size }));
  const baseline = await resources();
  for (let i = 0; i < 3; i++) {
    await page.getByRole('navigation').locator('a[href="/"]').click();
    await page.getByRole('button', { name: 'Глобус', exact: true }).click();
    await expect(page.locator('[data-renderer="ready"]')).toBeVisible();
    await page.getByRole('navigation').getByRole('link', { name: 'Данные и источники', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Данные за каждой точкой' })).toBeVisible();
    await expect.poll(resources).toEqual(baseline);
    await expect(page.locator('.globe-canvas canvas')).toHaveCount(0);
  }
});

test('globe late module load does not recreate an unmounted renderer', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const requestStarted = new Promise<void>(resolve => { requested = resolve; });
  await page.route(rendererModule, async route => {
    requested(); await gate; await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  await requestStarted;
  await page.getByRole('navigation').getByRole('link', { name: 'Данные и источники', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Данные за каждой точкой' })).toBeVisible();
  release();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('landing timeline filters inclusively while preserving a conflict full source series', async ({ page }) => {
  await page.goto('/?layer=ucdp&from=2011&to=2011&q=11345&selected=11345');
  await expect(page.getByTestId('map-coverage')).toContainText('0 из 1 на карте');
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(detail).toContainText('последний 2025');
  await expect(detail).toContainText('5 822');
  await page.getByRole('combobox', { name: 'Год, от', exact: true }).selectOption('2010');
  await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe('2010');
  await expect(detail).toContainText('5 822');
  await page.getByRole('link', { name: 'Как читать данные', exact: true }).click();
  await expect(page).toHaveURL(/#reading-guide$/);
});

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

for (const [layer, fromLabel, toLabel, fromYear, toYear] of [
  ['ucdp', 'Первый год наблюдения, от', 'Первый год наблюдения, до', '2000', '2010'],
  ['history', 'Год начала войны, от', 'Год начала войны, до', '1900', '1950'],
] as const) {
  test(`period keyboard editing preserves incomplete drafts and commits both bounds in ${layer}`, async ({ page }) => {
    if (layer === 'history') await page.getByRole('tab', { name: 'Исторические примеры' }).click();
    const from = page.getByLabel(fromLabel, { exact: true });
    const to = page.getByLabel(toLabel, { exact: true });
    const beforeUrl = page.url();
    await from.focus();
    await from.press('ControlOrMeta+A');
    await from.press('Backspace');
    await expect(from).toHaveValue('');
    await from.pressSequentially(fromYear.slice(0, 2));
    await expect(from).toHaveValue(fromYear.slice(0, 2));
    expect(page.url()).toBe(beforeUrl);
    await from.pressSequentially(fromYear.slice(2));
    await expect(from).toHaveValue(fromYear);
    await from.press('Enter');
    await expect.poll(() => new URL(page.url()).searchParams.get('from')).toBe(fromYear);
    await to.focus();
    await to.press('ControlOrMeta+A');
    await to.press('Backspace');
    await expect(to).toHaveValue('');
    await to.pressSequentially(toYear);
    await to.press('Tab');
    await expect.poll(() => new URL(page.url()).searchParams.get('to')).toBe(toYear);
    // Invalid completed input is explained and retained for correction; it does
    // not silently replace the valid source filter or mutate its shareable URL.
    const validUrl = page.url();
    await from.focus();
    await from.press('ControlOrMeta+A');
    await from.pressSequentially('2050');
    await from.press('Enter');
    await expect(page.getByRole('alert')).toContainText('Период не применён');
    await expect(from).toHaveValue('2050');
    expect(page.url()).toBe(validUrl);
    await page.getByRole('button', { name: 'Сбросить фильтры' }).click();
    await expect(from).toHaveValue(layer === 'ucdp' ? '1989' : '1861');
    await expect(to).toHaveValue('2025');
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('historical detail Escape returns focus to the record trigger and preserves native return path', async ({ page }) => {
  await page.getByRole('tab', { name: 'Исторические примеры' }).click();
  const trigger = page.getByRole('button', { name: 'Вторая мировая война', exact: true });
  await trigger.click();
  const details = page.getByRole('region', { name: 'Подробности записи' });
  await details.getByRole('button', { name: 'Закрыть подробности' }).focus();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await page.getByRole('tab', { name: 'UCDP: конфликт — год' }).click();
  const region = page.getByRole('region', { name: 'Таблица исходных данных' });
  await region.focus();
  await region.press('End');
  await page.keyboard.press('Enter');
  await details.getByRole('button', { name: 'Закрыть подробности' }).focus();
  await page.keyboard.press('Escape');
  await expect(details).toHaveCount(0);
  await expect(region).toBeFocused();
});
