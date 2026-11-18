import { test, expect } from './fixtures';
import { createWorld } from '../../src/sim/world';
import { applyCommand } from '../../src/sim/commands';

for (const viewport of [{width:390,height:844},{width:844,height:390}]) {
  test(`общая улица, осмотр линии и возврат к городу ${viewport.width}`, async ({page}) => {
    await page.setViewportSize(viewport);
    const world=createWorld();expect(applyCommand(world,{type:'buildRoute',mode:'marshrutka',stops:[3,2,1]}).ok).toBe(true);
    await page.addInitScript(world=>localStorage.setItem('gorodskoy-marshrut:stage2:v2',JSON.stringify(world)),world);
    await page.goto('/');const tracks=page.locator('.network-ink [data-route]');
    await expect(tracks).toHaveCount(2);await expect(tracks.first()).toHaveAttribute('d',/^M/);
    await expect(page.locator('.network-ink circle[r="5.3"]')).toHaveCount(3);
    await page.screenshot({path:`artifacts/network-${viewport.width}.png`});
    await page.locator('[data-tab="routes"]').click();await page.locator('[data-focus="2"]').click();
    await expect(tracks).toHaveCount(1);await expect(tracks).toHaveAttribute('data-route','2');
    await expect(page.locator('[data-stop="3"]')).toHaveAttribute('data-badge','1');
    await page.locator('#all-lines').click();await expect(tracks).toHaveCount(2);
    await expect(page.locator('#build-bar')).toBeHidden();
  });
}
