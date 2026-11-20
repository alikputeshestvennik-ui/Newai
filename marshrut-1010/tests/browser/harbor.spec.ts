import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ru = JSON.parse(readFileSync(new URL('../../data/ru.json', import.meta.url), 'utf8'));

test('renders the bundled harbor only in landscape', async ({ page }, testInfo) => {
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

  const canvas = page.locator('#harbor');
  const rotateHint = page.getByText(ru.rotateHint, { exact: true });
  const markModel = page.waitForResponse((response) => /\/assets\/mark-[^/]+\.glb$/.test(response.url()));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?stats');
  await expect(rotateHint).toBeVisible();
  await expect(canvas).toBeHidden();

  await page.setViewportSize({ width: 844, height: 390 });
  await expect(rotateHint).toBeHidden();
  expect((await markModel).ok()).toBe(true);
  await expect(page.getByRole('heading', { name: ru.title })).toBeVisible();
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();

  const stats = page.locator('#stats');
  await expect(stats).toBeVisible();
  const summary = await stats.innerText();
  const [fps, calls, triangles] = summary.match(/\d+/g)!.map(Number);
  expect(fps).toBeGreaterThan(0);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(150);
  expect(triangles).toBeGreaterThan(20_000);
  expect(triangles).toBeLessThanOrEqual(200_000);
  console.log(summary);

  await expect(canvas).toHaveAttribute('width', '1266');
  await expect(canvas).toHaveAttribute('height', '585');
  await page.screenshot({ path: testInfo.outputPath('landscape.png') });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(rotateHint).toBeVisible();
  await expect(canvas).toBeHidden();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(errors).toEqual([]);
});

test('camera turns with the swipe and stays still while the finger holds that spot', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();
  const canvas = page.locator('#harbor');
  const touch = await page.context().newCDPSession(page);
  const start = await canvas.screenshot();
  const finger = { x: 640, y: 200, id: 1 };
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  expect((await canvas.screenshot()).equals(start)).toBe(true);

  finger.x -= 36;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  await expect.poll(async () => (await canvas.screenshot()).equals(start)).toBe(false);
  const afterSwipe = await canvas.screenshot();

  // Leave the finger down across multiple animation frames.
  await page.evaluate(() => new Promise<void>((resolve) => {
    let frames = 12;
    function tick() {
      if (--frames === 0) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  expect((await canvas.screenshot()).equals(afterSwipe)).toBe(true);

  finger.x += 1;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  expect((await canvas.screenshot()).equals(afterSwipe)).toBe(true);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  finger.x = 455;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [finger] });
  finger.x += 384;
  await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [finger] });
  await expect.poll(async () => (await canvas.screenshot()).equals(afterSwipe)).toBe(false);
  await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.screenshot({ path: testInfo.outputPath('mark-front.png') });
});

test('walks on hold, steps sideways, and steers with a second finger', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const stick = page.getByRole('img', { name: ru.moveStick });
  const canvas = page.locator('#harbor');
  const session = await page.context().newCDPSession(page);
  await expect(page.getByText(ru.ready, { exact: true })).toBeVisible();
  await expect(stick).toBeHidden();
  const move = { x: 200, y: 285, id: 0 };
  const look = { x: 615, y: 200, id: 1 };

  const beforeWalk = await canvas.screenshot();
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move] });
  await expect(stick).toBeVisible();
  const { x, y, width, height } = (await stick.boundingBox())!;
  expect(x + width / 2).toBeCloseTo(move.x);
  expect(y + height / 2).toBeCloseTo(move.y);
  await expect.poll(async () => (await canvas.screenshot()).equals(beforeWalk)).toBe(false);

  move.x -= 22;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
  await expect(stick.locator('span')).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  move.x += 11;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
  await expect(stick.locator('span')).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  move.x += 11;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move] });
  await expect(stick.locator('span')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

  let atWall = await canvas.screenshot();
  await expect.poll(async () => {
    const frame = await canvas.screenshot();
    const still = frame.equals(atWall);
    atWall = frame;
    return still;
  }, { timeout: 12000, intervals: [400, 700] }).toBe(true);

  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [move, look] });
  look.y -= 44;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, look] });
  expect((await canvas.screenshot()).equals(atWall)).toBe(true);
  look.x += 80;
  await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [move, look] });
  await expect.poll(async () => (await canvas.screenshot()).equals(atWall)).toBe(false);
  await expect(stick).toBeVisible();
  await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(stick).toBeHidden();
});
