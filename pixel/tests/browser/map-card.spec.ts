import { expect, test } from '@playwright/test';

test('opens the sourced Russian WWII card and restores map zoom and keyboard focus on Escape', async ({ page }, testInfo) => {
  await page.goto('/ru/');
  const flag = page.getByRole('button', { name: 'Атомная бомбардировка Хиросимы', exact: true });
  const viewport = page.getByTestId('map-viewport');
  await expect(page.getByTestId('map-land')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Отдалить', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Приблизить', exact: true }).locator('svg[data-pixel-icon="plus"]'))
    .toHaveAttribute('viewBox', '0 0 16 16');
  await expect.poll(() => viewport.evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath('desktop-map.png') });
  await page.getByRole('button', { name: 'Приблизить', exact: true }).click();
  await flag.focus();
  const position = await viewport.evaluate(element => [element.scrollLeft, element.scrollTop]);
  await flag.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Вторая мировая война' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Более 65 000 000', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Национальный музей армии Великобритании/ })).toHaveAttribute('href', 'https://www.nam.ac.uk/explore/second-world-war');
  await expect(dialog.getByText('Европа, Северная Африка, Азия и Тихий океан', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeFocused();
  await expect(dialog.getByRole('button', { name: 'Закрыть' }).locator('svg[data-pixel-icon="close"]'))
    .toHaveAttribute('aria-hidden', 'true');
  await expect(dialog.getByRole('button', { name: 'Перезапустить' }).locator('svg[data-pixel-icon="restart"]'))
    .toHaveAttribute('viewBox', '0 0 16 16');
  await page.screenshot({ path: testInfo.outputPath('desktop-card.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(flag).toBeFocused();
  await expect(page.getByTestId('map-zoom')).toHaveText('150%');
  await expect.poll(() => viewport.evaluate(element => [element.scrollLeft, element.scrollTop])).toEqual(position);
});

test('supports browser Back and Forward and English estimates at narrow desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto('/en/');
  const flag = page.getByRole('button', { name: 'Atomic bombing of Nagasaki', exact: true });
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await flag.hover();
  const cloth = flag.locator('.flag-icon__cloth');
  await expect(cloth).toBeVisible();
  await cloth.click();
  await expect(page).toHaveURL(/\/en\/\?war=history%3Aww2&flag=episode%3Ahistory%3Aww2%2Fnagasaki$/);
  await expect(dialog.getByText('More than 65,000,000', { exact: true })).toBeVisible();
  await expect(dialog.locator('.war-dialog__period')).toHaveText('1939–1945');
  await page.goBack();
  await expect(dialog).toHaveCount(0);
  await expect(flag).toBeFocused();
  await page.goForward();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Back to the map' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(flag).toBeFocused();
});

test('coincident placements are individually reachable from their shared map marker', async ({ page }) => {
  await page.goto('/en/');
  const group = page.locator('button[data-flag-count]').first();
  const count = Number(await group.getAttribute('data-flag-count'));
  expect(count).toBeGreaterThan(1);
  await group.focus();
  await group.press('Enter');
  const choices = page.getByRole('group', { name: 'Flags at this point' });
  const options = choices.getByRole('list').getByRole('button');
  await expect(options).toHaveCount(count);
  const first = options.first();
  await expect(first).toBeFocused();
  await first.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(first).toBeFocused();
});

test('keeps the map and text readable at a narrow width with reduced motion', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/ru/');
  const flag = page.getByRole('button', { name: 'Атомная бомбардировка Хиросимы', exact: true });
  await flag.focus();
  await expect(flag.locator('.flag-icon')).toBeVisible();
  await expect(flag.locator('.flag-icon__cloth')).toHaveCSS('animation-name', 'none');
  await page.screenshot({ path: testInfo.outputPath('mobile-map.png') });
  await flag.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Вторая мировая война' });
  await expect(dialog.getByText('Более 65 000 000', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: testInfo.outputPath('mobile-card.png') });
});

test('offers a reload after the map chunk fails to load', async ({ page }) => {
  const module = '**/assets/atlas-view-*.js';
  await page.route(module, route => route.abort());
  await page.goto('/en/');
  await expect(page.getByRole('alert')).toHaveText('The map could not be loaded.');
  await page.unroute(module);
  await page.getByRole('button', { name: 'Try loading again' }).click();
  await expect(page.getByTestId('map-land')).toBeVisible();
});

test('exposes every estimate band and explains shared map points', async ({ page }) => {
  await page.goto('/en/');
  const method = page.locator('.map-legend__method');
  await method.getByText('How to read the scale', { exact: true }).click();
  await expect(method.getByRole('listitem')).toHaveText(['0–999', '1,000–9,999', '10,000–49,999', '50,000+']);
  await expect(method.getByText(/largest individual estimate/)).toBeVisible();
});

test('opens the WWII overview from each episode flag and keeps separate episode estimates', async ({ page }) => {
  await page.goto('/en/');
  const hiroshima = 'Atomic bombing of Hiroshima';
  const nagasaki = 'Atomic bombing of Nagasaki';
  const map = page.getByTestId('map-viewport');
  const hiroshimaFlag = map.getByRole('button', { name: hiroshima, exact: true });
  const nagasakiFlag = map.getByRole('button', { name: nagasaki, exact: true });
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await expect(page.getByRole('button', { name: 'Second World War', exact: true })).toHaveCount(0);
  await hiroshimaFlag.click();
  const first = dialog.getByRole('button', { name: hiroshima, exact: true });
  const second = dialog.getByRole('button', { name: nagasaki, exact: true });
  await expect(dialog.locator('canvas[data-scene-canvas="ww2-overview"]')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'US Holocaust Memorial Museum', exact: true }))
    .toHaveAttribute('href', /the-soviet-union-and-the-eastern-front$/);
  await expect(dialog.getByText('More than 65,000,000', { exact: true })).toBeVisible();
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(second).toHaveAttribute('aria-expanded', 'false');

  await first.click();
  await expect(dialog.getByText('About 140,000', { exact: true })).toBeVisible();
  await expect(dialog.locator('canvas[data-scene-canvas="hiroshima"]')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'History of Hiroshima', exact: true }))
    .toHaveAttribute('href', /1009928\.html$/);
  await expect(dialog.getByText('6 August 1945', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /City of Hiroshima.*death estimate/ })).toBeVisible();
  await second.click();
  await expect(first).toHaveAttribute('aria-expanded', 'false');
  await expect(dialog.getByText('73,884', { exact: true })).toBeVisible();
  await expect(dialog.locator('canvas[data-scene-canvas="nagasaki"]')).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Nagasaki city archive', exact: true }))
    .toHaveAttribute('href', /part_2_01\.html$/);
  await expect(dialog.locator('canvas[data-scene-canvas]')).toHaveCount(1);
  await expect(dialog.getByText('9 August 1945', { exact: true })).toBeVisible();
  const back = dialog.getByRole('button', { name: 'Back to the map' });
  await expect(back).toBeInViewport({ ratio: 1 });
  await back.click();
  await expect(dialog).toHaveCount(0);
  await expect(hiroshimaFlag).toBeFocused();

  await nagasakiFlag.click();
  await expect(dialog.getByText('More than 65,000,000', { exact: true })).toBeVisible();
  await expect(dialog.locator('canvas[data-scene-canvas="ww2-overview"]')).toBeVisible();
  await expect(second).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(nagasakiFlag).toBeFocused();
});

test('keeps the card readable during scene failure and retries the first frame', async ({ page }) => {
  const sprite = '**/assets/battle-topdown-infantry-*';
  await page.route(sprite, route => route.abort());
  await page.goto('/en/');
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await expect(dialog.getByText('More than 65,000,000', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('alert')).toHaveText('The scene could not be loaded.');
  await expect(dialog.getByRole('button', { name: 'Restart', exact: true })).toBeDisabled();
  await page.unroute(sprite);
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.locator('canvas[data-scene-canvas="ww2-overview"]')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Restart', exact: true })).toBeEnabled();
});

test('restores the selected episode when retrying a failed scene module import', async ({ page }) => {
  const module = '**/assets/mount-scene-*.js';
  await page.route(module, route => route.abort());
  await page.goto('/en/');
  await page.getByRole('button', { name: 'Atomic bombing of Nagasaki', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await dialog.getByRole('button', { name: 'Atomic bombing of Nagasaki', exact: true }).click();
  await expect(page).toHaveURL(/&episode=nagasaki$/);
  await expect(dialog.getByRole('alert')).toHaveText('The scene could not be loaded.');
  await page.unroute(module);
  await dialog.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(dialog.locator('canvas[data-scene-canvas="nagasaki"]')).toBeVisible();
  await expect(dialog.getByText('73,884', { exact: true })).toBeVisible();
});

test('opens a direct stable war link and closes it without leaving the map', async ({ page }) => {
  await page.goto('/en/?war=history%3Aww2');
  const dialog = page.getByRole('dialog', { name: 'Second World War' });
  await expect(dialog.getByText('More than 65,000,000', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page).toHaveURL('/en/');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true })).toBeFocused();
});

test('keeps a catalog entry without coordinates readable from a stable link', async ({ page }) => {
  await page.goto('/ru/?war=ucdp%3A205');
  const dialog = page.getByRole('dialog', { name: 'Иран — Курдистан' });
  await expect(dialog.locator('.war-dialog__period')).toHaveText('1990–2018');
  await expect(dialog.locator('canvas[data-scene-canvas]')).toHaveCount(0);
  await expect(page.locator('[data-flag-id="war:ucdp:205"]')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page).toHaveURL('/ru/');
  await expect(page.getByRole('heading', { name: 'Карта мира', exact: true })).toBeFocused();
});

test('persists interface sound separately and unlocks audio only after a user action', async ({ page }) => {
  await page.addInitScript(() => {
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      constructor() {
        super();
        const root = document.documentElement;
        root.dataset.audioContexts = String(Number(root.dataset.audioContexts ?? '0') + 1);
      }
      override close() {
        const root = document.documentElement;
        root.dataset.closedAudioContexts = String(Number(root.dataset.closedAudioContexts ?? '0') + 1);
        return super.close();
      }
    };
  });
  await page.goto('/en/');
  const root = page.locator('html');
  const toggle = page.getByRole('button', { name: 'Interface sounds', exact: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await root.getAttribute('data-audio-contexts')).toBeNull();
  await toggle.press('Enter');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  await expect(root).toHaveAttribute('data-audio-contexts', '1');

  await page.reload();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await root.getAttribute('data-audio-contexts')).toBeNull();
  await page.getByRole('button', { name: 'Atomic bombing of Hiroshima', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const sceneSound = dialog.getByRole('button', { name: 'Sound', exact: true });
  await expect(sceneSound).toBeEnabled();
  await expect(sceneSound).toHaveAttribute('aria-pressed', 'false');
  await expect(root).toHaveAttribute('data-audio-contexts', '1');
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(root).toHaveAttribute('data-closed-audio-contexts', '1');
});
