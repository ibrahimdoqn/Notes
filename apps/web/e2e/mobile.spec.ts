import { expect, test } from '@playwright/test';
import { register } from './helpers.ts';

test('mobil: klasörler → liste → not arasında gezinme', async ({ page }) => {
  await register(page);
  await expect(page.locator('#app')).toHaveAttribute('data-mob', 'list');
  await page.locator('.list .pf [data-act=new]').click();
  await expect(page.locator('#app')).toHaveAttribute('data-mob', 'note');
  await page.keyboard.type('Telefondan not');
  await page.locator('.edit > .back').click();
  await expect(page.locator('#app')).toHaveAttribute('data-mob', 'list');
  await expect(page.locator('#notes .item .tt').first()).toHaveText('Telefondan not');
  await page.locator('.list .back').click();
  await expect(page.locator('#app')).toHaveAttribute('data-mob', 'folders');
});
