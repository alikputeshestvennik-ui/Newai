import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ru = JSON.parse(readFileSync(new URL('../../data/ru.json', import.meta.url), 'utf8'));

test('renders the bundled harbor and resizes it when the phone rotates', async ({ page }, testInfo) => {
  const externalRequests: string[] = [];
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://127.0.0.1:4173') {
      await route.continue();
    } else {
      externalRequests.push(url.href);
      await route.abort();
    }
  });

  await page.goto('/?stats');
  await expect(page.getByRole('heading', { name: ru.title })).toBeVisible();
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();

  const stats = page.locator('#stats');
  await expect(stats).toBeVisible();
  const summary = await stats.innerText();
  const [fps, calls, triangles] = summary.match(/\d+/g)!.map(Number);
  expect(fps).toBeGreaterThan(0);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(150);
  expect(triangles).toBeGreaterThan(0);
  expect(triangles).toBeLessThanOrEqual(200_000);
  console.log(summary);

  const canvas = page.locator('#harbor');
  await expect(canvas).toHaveAttribute('width', '585');
  await expect(canvas).toHaveAttribute('height', '1266');
  await page.screenshot({ path: testInfo.outputPath('portrait.png') });

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(canvas).toHaveAttribute('width', '1266');
  await expect(canvas).toHaveAttribute('height', '585');
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('landscape.png') });
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});
