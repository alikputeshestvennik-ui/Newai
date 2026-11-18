import {test,expect} from '@playwright/test';
for(const [w,h] of [[412,824],[844,390]])test('play episode '+w+'×'+h,async({page,context},testInfo)=>{
  await page.setViewportSize({width:w,height:h});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?probe');await expect(page.locator('body')).toHaveAttribute('data-phase','quay',{timeout:35000});
  await context.setOffline(true);
  await page.locator('#act').click();await page.locator('#act').click();
  await page.waitForTimeout(800);
  await page.screenshot({path:testInfo.outputPath('watch.jpg')});
  const x=.22*w,y=.43*h;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x+Math.min(w,h)*Math.PI/7,y,{steps:9});await page.mouse.up();
  await expect(page.locator('body')).toHaveAttribute('data-phase','found',{timeout:12000});
  await page.screenshot({path:testInfo.outputPath('engraving.jpg')});
  await page.locator('#act').click();await page.locator('#zoom').click();await page.locator('#zoom').click();
  await page.mouse.click(w*.35,h*.26);await expect(page.locator('#notice')).toContainText('Всплеск');
  await page.locator('#metrics').click();await page.waitForTimeout(1500);
  await page.screenshot({path:testInfo.outputPath('canal.jpg')});
  console.log('Render '+w+'×'+h,await page.locator('#stats').textContent());
  // Exercise the same pointer and mesh intersection path that the player uses.
  await expect(async()=>{
    const p=await page.evaluate(()=> (window as any).veniceProbe.target(0));
    expect(p.x).toBeGreaterThan(w*.08);expect(p.x).toBeLessThan(w*.92);
    await page.mouse.click(p.x,p.y);
    await expect(page.locator('body')).toHaveAttribute('data-phase','won',{timeout:500});
  }).toPass({timeout:40000,intervals:[100,200]});
  await page.locator('#act').click();await expect(page.locator('body')).toHaveAttribute('data-phase','quay');
  expect(errors).toEqual([]);
});
