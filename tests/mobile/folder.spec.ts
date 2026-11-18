import { test, expect } from './fixtures';
for(const viewport of [{width:390,height:844},{width:844,height:390}]){
  test(`письма, цена решения и архив после перезапуска ${viewport.width}`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/');
    await page.getByRole('button',{name:'Дело Корнеева · новое письмо'}).click();
    await expect(page.getByRole('dialog')).toContainText('Ключи от депо');
    await page.screenshot({path:`artifacts/folder-${viewport.width}.png`});
    await page.getByRole('button',{name:/Оплатить ночную смену/}).click();
    await expect(page.getByRole('dialog')).toContainText('Полоса отвода');
    await page.reload();await page.locator('#folder').click();await page.getByText('Принятые решения').click();
    await expect(page.locator('.folio li')).toContainText('Оплатить ночную смену');
  });
}
