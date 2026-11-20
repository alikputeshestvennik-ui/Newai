import { readFileSync } from 'node:fs';
import { expect, test, type Page, type TestInfo } from '@playwright/test';

const ru = JSON.parse(readFileSync(new URL('../../data/ru.json', import.meta.url), 'utf8')) as
  typeof import('../../data/ru.json');
const chapter = JSON.parse(readFileSync(new URL('../../data/turkey-preview.json', import.meta.url), 'utf8')) as
  typeof import('../../data/turkey-preview.json');

const words = ru.preview;

async function capture(page: Page, testInfo: TestInfo, stage: string) {
  const stats = page.locator('#stats');
  await expect(stats).toBeVisible({ timeout: 15_000 });
  await expect(stats).toHaveText(/кадр\/с.*треугольников/, { timeout: 15_000 });
  const metrics = await stats.innerText();
  const [fps, calls, triangles] = metrics.match(/\d+/g)!.map(Number);
  expect(fps).toBeGreaterThan(0);
  expect(calls).toBeGreaterThan(0);
  expect(calls).toBeLessThanOrEqual(150);
  expect(triangles).toBeGreaterThan(0);
  expect(triangles).toBeLessThanOrEqual(200_000);
  console.log(`${stage}: ${metrics}`);
  await page.screenshot({ path: testInfo.outputPath(`${stage}.png`) });
  return metrics;
}


test('previews the cutscene, board signal, and runner and saves the ending', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('button', { name: words.enter })).toBeHidden();
  await page.evaluate(() => localStorage.setItem('route-1010:harbor-ticket:v1', 'complete'));
  const actors = ['courier', 'leila'].map((name) => page.waitForResponse((response) =>
    new RegExp(`/assets/${name}-[^/]+\\.glb$`).test(response.url())));
  await page.goto('/?stats');
  for (const response of await Promise.all(actors)) expect(response.ok()).toBe(true);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  const title = (name: string) => page.getByRole('heading', { name, exact: true });
  const metrics: Record<string, string> = {};

  await button(words.enter).tap();
  await expect(title(words.titles.intro)).toBeVisible();
  metrics.cutscene = await capture(page, testInfo, 'cutscene');
  await expect(page.getByText(chapter.intro[0].line, { exact: true })).toBeVisible();
  await button(words.next).tap();
  metrics.courier = await capture(page, testInfo, 'courier');
  await button(words.next).tap();
  await button(words.aim).tap();
  await expect(title(words.titles.aim)).toBeVisible();
  await expect(button(words.confirm)).toBeDisabled();
  await button(words.targets.ring).tap();
  await button(words.confirm).tap();
  await expect(page.getByText(words.signalWrong, { exact: true })).toBeVisible();
  metrics.viewfinder = await capture(page, testInfo, 'viewfinder');
  await button(words.targets.board).tap();
  await expect(button(words.targets.board)).toHaveAttribute('aria-pressed', 'true');
  await button(words.confirm).tap();
  await expect(page.getByText(words.signalOk, { exact: true })).toBeVisible();
  await expect(button(words.toRun)).toBeVisible();

  await page.reload();
  await button(words.resume).tap();
  await expect(title(words.titles.runner)).toBeVisible();
  metrics.runner = await capture(page, testInfo, 'runner');

  await button(words.runStart).tap();
  await expect(page.getByText(words.run.blocked, { exact: true })).toBeVisible({ timeout: 25_000 });
  await button(words.retry).tap();
  await button(words.right).tap();
  await page.screenshot({ path: testInfo.outputPath('running.png') });
  await expect(page.getByText(words.runGates[1], { exact: true })).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByText(words.runGates[2], { exact: true })).toBeVisible({ timeout: 25_000 });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(title(words.titles.junction)).toBeVisible({ timeout: 30_000 });
  metrics.junction = await capture(page, testInfo, 'junction');
  await button(words.continue).tap();
  await expect(title(words.titles.outro)).toBeVisible();
  await expect(page.getByText(chapter.detour.continued.line, { exact: true })).toBeVisible();
  for (const beat of chapter.outro) {
    await button(words.next).tap();
    await expect(page.getByText(beat.line, { exact: true })).toBeVisible();
  }
  await button(words.skip).tap();
  await expect(page.getByText(words.summary, { exact: true })).toBeVisible();
  metrics.ending = await capture(page, testInfo, 'ending');
  await testInfo.attach('render-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });

  await page.reload();
  await button(words.resume).tap();
  await expect(page.getByText(words.summary, { exact: true })).toBeVisible();
  await button(words.replay).tap();
  await expect(title(words.titles.intro)).toBeVisible();
  await button(words.back).tap();
  await expect(page.getByText(ru.ticket.complete, { exact: true })).toBeVisible();
  await page.reload();
  await button(ru.journal.open).tap();
  const journal = page.getByRole('dialog', { name: ru.journal.title });
  await expect(journal.getByText(ru.journal.orientation)).toBeVisible();
  await expect(journal.getByText(ru.journal.connection)).toBeVisible();
  await expect(journal.getByText(ru.journal.help)).toBeHidden();
  expect(errors).toEqual([]);
});

test('returns from an older ending and saves the help after escorting the family', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('route-1010:harbor-ticket:v1', 'complete');
    localStorage.setItem('route-1010:turkey-preview:v1', 'complete');
  });
  const samir = page.waitForResponse((response) => /\/assets\/samir-[^/]+\.glb$/.test(response.url()));
  await page.goto('/?stats');
  expect((await samir).ok()).toBe(true);
  const button = (name: string) => page.getByRole('button', { name, exact: true });
  await button(words.resume).tap();
  await expect(page.getByText(words.summary, { exact: true })).toBeVisible();
  await button(words.returnToJunction).tap();
  await button(words.detour).tap();
  await expect(page.getByText(chapter.detour.escort.line, { exact: true })).toBeVisible();

  await page.reload();
  await button(words.resume).tap();
  await expect(page.getByRole('heading', { name: words.titles.escort })).toBeVisible();
  const metrics: Record<string, string> = {};
  metrics.escort = await capture(page, testInfo, 'escort');
  await button(words.rails.red).tap();
  await expect(page.getByText(chapter.detour.wrongRail, { exact: true })).toBeVisible();
  await button(words.rails.blue).tap();
  await expect(page.getByText(chapter.detour.walking, { exact: true })).toBeVisible();
  metrics.walking = await capture(page, testInfo, 'walking');
  await expect(page.getByText(chapter.detour.helped.line, { exact: true })).toBeVisible({ timeout: 25_000 });
  metrics.samir = await capture(page, testInfo, 'samir');
  await button(words.skip).tap();
  await expect(page.getByText(words.summaryHelped, { exact: true })).toBeVisible();
  await testInfo.attach('detour-metrics', { body: JSON.stringify(metrics), contentType: 'application/json' });

  await page.reload();
  await button(ru.journal.open).tap();
  const journal = page.getByRole('dialog', { name: ru.journal.title });
  await expect(journal.getByText(ru.journal.orientation)).toBeVisible();
  await expect(journal.getByText(ru.journal.connection)).toBeVisible();
  await expect(journal.getByText(ru.journal.help)).toBeVisible();
  await button(ru.journal.close).tap();
  await button(words.resume).tap();
  await expect(page.getByText(words.summaryHelped, { exact: true })).toBeVisible();
});
