import { expect, test } from '@playwright/test';

test('globe recovers from WebGL context loss without resetting the view', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));

  await page.goto('/?layer=ucdp&from=2011&to=2011&q=11345&selected=11345');
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
  await page.getByRole('tab', { name: 'Исторические примеры' }).click();
  await expect(page.getByTestId('map-coverage')).toContainText('4 на глобусе');
  expect(errors).toEqual([]);
});

test('activating the current globe layer keeps its filters and selected record', async ({ page }) => {
  await page.goto('/?layer=ucdp&from=2011&to=2011&q=11345&selected=11345');
  const tab = page.getByRole('tab', { name: 'UCDP 1989–2025' });
  const coverage = page.getByTestId('map-coverage');
  const search = page.getByRole('searchbox', { name: 'Найти конфликт, страну или участника' });
  const detail = page.getByRole('region', { name: 'Подробности записи' });
  await expect(page.locator('.globe-view')).not.toHaveAttribute('data-renderer', 'loading');
  await expect(tab).toHaveAttribute('aria-selected', 'true');
  await expect(coverage).toContainText('1 всего');
  await tab.click();
  await expect(search).toHaveValue('11345');
  await expect(page.getByLabel('Период глобуса, от')).toHaveValue('2011');
  await expect(page.getByLabel('Период глобуса, до')).toHaveValue('2011');
  await expect(coverage).toContainText('1 всего');
  await expect(detail).toContainText('5 822');
  expect(new URL(page.url()).searchParams.get('selected')).toBe('11345');
});

test('globe rotation caption and timeline label do not overlap on a tablet', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/');
  const caption = page.getByText('Пауза вращения', { exact: true });
  const timeline = page.getByText('Год начала войны', { exact: true });
  await expect(caption).toBeVisible();
  await expect(timeline).toBeVisible();
  const captionBox = (await caption.boundingBox())!;
  const timelineBox = (await timeline.boundingBox())!;
  const overlapX = captionBox.x < timelineBox.x + timelineBox.width && timelineBox.x < captionBox.x + captionBox.width;
  const overlapY = captionBox.y < timelineBox.y + timelineBox.height && timelineBox.y < captionBox.y + captionBox.height;
  expect(overlapX && overlapY, 'rotation caption must not cover the timeline label').toBe(false);
});
