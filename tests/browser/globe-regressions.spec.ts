import { expect, test } from '@playwright/test';

test('globe recovers from WebGL context loss without resetting the view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?layer=ucdp&from=2011&to=2011&q=11345&selected=11345');
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  const renderer = page.locator('.globe-view');
  const host = page.getByTestId('globe-host');
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(renderer).toHaveAttribute('data-renderer', 'ready');
  await renderer.getByRole('button', { name: 'Приостановить вращение' }).click();
  await expect(host).toHaveAttribute('data-rotation', 'paused');

  const canvas = host.locator('canvas');
  await canvas.evaluate(async (element: HTMLCanvasElement) => {
    const context = element.getContext('webgl2');
    const loseContext = context?.getExtension('WEBGL_lose_context');
    if (!loseContext) throw new Error('WEBGL_lose_context is required for this browser test');
    element.dataset.contextProbe = 'original';
    element.addEventListener('atlas-test-restore', () => loseContext.restoreContext(), { once: true });
    const lost = new Promise<void>(resolve =>
      element.addEventListener('webglcontextlost', () => resolve(), { once: true }));
    loseContext.loseContext();
    await lost;
  });
  await expect(renderer).toHaveAttribute('data-renderer', 'recovering');
  await expect(detail).toContainText('5 822');

  await canvas.dispatchEvent('atlas-test-restore');
  await expect(renderer).toHaveAttribute('data-renderer', 'ready');
  await expect(canvas).toHaveAttribute('data-context-probe', 'original');
  await expect(host).toHaveAttribute('data-rotation', 'paused');
  await expect(detail).toContainText('5 822');
  await renderer.getByRole('button', { name: 'Включить вращение' }).click();
  await expect(host).toHaveAttribute('data-rotation', 'rotating');
  expect(errors).toEqual([]);
});

test('switching map projections and activating the current source keeps filters and selection', async ({ page }) => {
  await page.goto('/?layer=ucdp&from=2011&to=2011&q=11345&selected=11345');
  const source = page.getByRole('button', { name: 'UCDP', exact: true });
  const coverage = page.getByTestId('map-coverage');
  const search = page.getByRole('searchbox', { name: 'Поиск по названию, региону, стране' });
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(page.getByTestId('flat-map')).toBeVisible();
  await expect(source).toHaveAttribute('aria-pressed', 'true');
  await expect(coverage).toContainText('0 из 1 на карте');
  await source.click();
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  await expect(page.locator('.globe-view')).toBeVisible();
  await expect(detail).toContainText('5 822');
  await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.getByTestId('flat-map')).toBeVisible();
  await expect(page.locator('.globe-view')).toHaveCount(0);
  await expect(search).toHaveValue('11345');
  await expect(page.getByRole('combobox', { name: 'Год, от', exact: true })).toHaveValue('2011');
  await expect(page.getByRole('combobox', { name: 'Год, до', exact: true })).toHaveValue('2011');
  await expect(coverage).toContainText('0 из 1 на карте');
  await expect(detail).toContainText('5 822');
  expect(new URL(page.url()).searchParams.get('selected')).toBe('11345');
});

test('globe rotation caption and timeline label do not overlap on a tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Глобус', exact: true }).click();
  const caption = page.locator('.rotation-button');
  const timeline = page.getByRole('combobox', { name: 'Год, от', exact: true });
  await expect(caption).toBeVisible();
  await expect(timeline).toBeVisible();
  const captionBox = (await caption.boundingBox())!;
  const timelineBox = (await timeline.boundingBox())!;
  const overlapX = captionBox.x < timelineBox.x + timelineBox.width && timelineBox.x < captionBox.x + captionBox.width;
  const overlapY = captionBox.y < timelineBox.y + timelineBox.height && timelineBox.y < captionBox.y + captionBox.height;
  expect(overlapX && overlapY, 'rotation caption must not cover the timeline label').toBe(false);
});
