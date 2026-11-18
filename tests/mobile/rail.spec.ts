import { test, expect } from './fixtures';
import { createWorld } from '../../src/sim/world';
import { T } from '../../src/sim/config';

test('электричка: покупка, выбор платформ и выделение новой линии',async({page})=>{
  const world=createWorld();world.served=T.suburban.unlockServed;world.money=500000;
  await page.addInitScript(world=>localStorage.setItem('gorodskoy-marshrut:stage2:v2',JSON.stringify(world)),world);
  await page.goto('/');await page.getByRole('button',{name:'Пауза',exact:true}).click();
  await page.locator('[data-tab="fleet"]').click();await page.locator('[data-buy="suburban"]').click();await page.locator('[data-plan="suburban"]').click();
  await expect(page.locator('#draft-hint')).toContainText('платформу');await expect(page.locator('[data-stop="1"]')).toHaveClass(/off-platform/);
  for(const stop of [0,11,10])await page.locator(`[data-stop="${stop}"]`).press('Enter');
  await page.locator('#confirm').click();await expect(page.locator('.route-card').nth(1)).toContainText('Электричка');
  await page.locator('[data-focus="2"]').click();await expect(page.locator('.network-ink [data-route="2"]')).toHaveAttribute('d',/^M/);
  await page.screenshot({path:'artifacts/suburban-line.png'});
});
