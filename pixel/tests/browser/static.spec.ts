import { expect, test } from '@playwright/test';

test('opens both built locale entries and switches through a native link', async ({ page }) => {
  await page.goto('/ru/');
  await page.evaluate(() => { document.documentElement.dataset.sameDocument = 'yes'; });
  await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
  await expect(page.getByRole('heading', { name: 'Пиксельный атлас войн' })).toBeVisible();
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL('/en/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('html')).toHaveAttribute('data-same-document', 'yes');
  await expect(page.getByRole('heading', { name: 'Pixel War Atlas' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'English' })).toHaveAttribute('aria-current', 'page');
});

test('shows a static localized indicator while the client is loading', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/assets/*.js', (route) => route.abort());
  await page.goto('/en/');
  await expect(page.getByRole('status')).toHaveText('Assembling the map');
  await expect(page.locator('.startup__tiles')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.startup__tiles')).toHaveCSS('mask-image', /data:image\/svg\+xml/);
});
