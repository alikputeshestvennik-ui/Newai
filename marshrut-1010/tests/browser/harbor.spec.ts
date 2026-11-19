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

test('shows the movement stick under the finger and only looks around while stopped', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const stick = page.getByRole('img', { name: ru.moveStick });
  const canvas = page.locator('#harbor');
  const session = await page.context().newCDPSession(page);
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();
  await expect(stick).toBeHidden();
  const move = { x: 105, y: 640, id: 0 };
  const look = { x: 290, y: 400, id: 1 };

  const beforeLook = await canvas.screenshot();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [look] });
  look.y -= 44;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [look] });
  await expect.poll(async () => (await canvas.screenshot()).equals(beforeLook)).toBe(false);
  await expect(stick).toBeHidden();
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
  await expect(stick).toBeVisible();
  const { x, y, width, height } = (await stick.boundingBox())!;
  expect(x + width / 2).toBeCloseTo(move.x);
  expect(y + height / 2).toBeCloseTo(move.y);
  const beforeWalk = await canvas.screenshot();
  move.y -= 22;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
  await expect.poll(async () => (await canvas.screenshot()).equals(beforeWalk)).toBe(false);

  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, look] });
  move.y += 22;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, look] });
  await expect(stick.locator('span')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  const afterWalk = await canvas.screenshot();
  look.x += 44;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, look] });
  expect((await canvas.screenshot()).equals(afterWalk)).toBe(true);
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(stick).toBeHidden();
  const afterCancel = await canvas.screenshot();
  expect((await canvas.screenshot()).equals(afterCancel)).toBe(true);

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(canvas).toHaveAttribute('width', '1266');
  const beforeLandscapeLook = await canvas.screenshot();
  const right = { x: 600, y: 150, id: 1 };
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right] });
  right.x -= 95;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
  await expect.poll(async () => (await canvas.screenshot()).equals(beforeLandscapeLook)).toBe(false);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(stick).toBeHidden();
});
