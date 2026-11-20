import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const ru = JSON.parse(readFileSync(new URL('../../data/ru.json', import.meta.url), 'utf8')) as
  typeof import('../../data/ru.json');
const chapter = JSON.parse(readFileSync(new URL('../../data/turkey-preview.json', import.meta.url), 'utf8')) as
  typeof import('../../data/turkey-preview.json');

const words = ru.preview;

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
  const capture = async (stage: string) => {
    const stats = page.locator('#stats');
    await expect(stats).toBeVisible({ timeout: 15_000 });
    await expect(stats).toHaveText(/кадр\/с.*треугольников/, { timeout: 15_000 });
    metrics[stage] = await stats.innerText();
    const [fps, calls, triangles] = metrics[stage].match(/\d+/g)!.map(Number);
    expect(fps).toBeGreaterThan(0);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThanOrEqual(150);
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(200_000);
    console.log(`${stage}: ${metrics[stage]}`);
    await page.screenshot({ path: testInfo.outputPath(`${stage}.png`) });
  };

  await button(words.enter).tap();
  await expect(title(words.titles.intro)).toBeVisible();
  await capture('cutscene');
  await expect(page.getByText(chapter.intro[0].line, { exact: true })).toBeVisible();
  await button(words.next).tap();
  await capture('courier');
  await button(words.next).tap();
  await button(words.aim).tap();
  await expect(title(words.titles.aim)).toBeVisible();
  await expect(button(words.confirm)).toBeDisabled();
  await button(words.targets.ring).tap();
  await button(words.confirm).tap();
  await expect(page.getByText(words.signalWrong, { exact: true })).toBeVisible();
  await capture('viewfinder');
  await button(words.targets.board).tap();
  await expect(button(words.targets.board)).toHaveAttribute('aria-pressed', 'true');
  await button(words.confirm).tap();
  await expect(page.getByText(words.signalOk, { exact: true })).toBeVisible();
  await expect(button(words.toRun)).toBeVisible();

  await page.reload();
  await button(words.resume).tap();
  await expect(title(words.titles.runner)).toBeVisible();
  await capture('runner');

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
  await expect(title(words.titles.outro)).toBeVisible({ timeout: 30_000 });
  for (const beat of chapter.outro.slice(1)) {
    await button(words.next).tap();
    await expect(page.getByText(beat.line, { exact: true })).toBeVisible();
  }
  await button(words.skip).tap();
  await expect(page.getByText(words.summary, { exact: true })).toBeVisible();
  await capture('ending');
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
  expect(errors).toEqual([]);
});
