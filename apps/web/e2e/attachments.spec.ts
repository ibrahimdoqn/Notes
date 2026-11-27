import { expect, test } from '@playwright/test';
import { listTitles, login, register, writeNote } from './helpers.ts';

// 1×1 kırmızı PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');

test('resim ve dosya eki: eklenir, yüklenir, diğer cihazda görünür ve indirilir', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  const user = await register(a);
  await writeNote(a, ['Faturalar']);
  await a.keyboard.press('Enter');
  await a.setInputFiles('#attIn', [
    { name: 'kapak.png', mimeType: 'image/png', buffer: PNG },
    { name: 'fatura.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 deneme') },
  ]);
  await expect(a.locator('#ed img.att')).toHaveAttribute('src', /^blob:/);
  await expect(a.locator('#ed span.file')).toHaveText('fatura.pdf');
  await expect(a.locator('#sync')).toContainText('Eşitlendi', { timeout: 10_000 });
  await a.waitForTimeout(2500);
  await expect(a.locator('#sync')).toContainText('Eşitlendi', { timeout: 10_000 });

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await login(b, user);
  await listTitles(b).filter({ hasText: 'Faturalar' }).click();
  const img = b.locator('#ed img.att');
  await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  const download = b.waitForEvent('download');
  await b.locator('#ed span.file').click();
  expect((await download).suggestedFilename()).toBe('fatura.pdf');
  await ctxA.close();
  await ctxB.close();
});

test('çevrimdışı eklenen resim bağlantı gelince yüklenir', async ({ browser }) => {
  const ctx = await browser.newContext();
  const a = await ctx.newPage();
  const user = await register(a);
  await ctx.setOffline(true);
  await a.evaluate(() => dispatchEvent(new Event('offline')));
  await writeNote(a, ['Uçakta foto']);
  await a.setInputFiles('#attIn', [{ name: 'foto.png', mimeType: 'image/png', buffer: PNG }]);
  await expect(a.locator('#sync')).toContainText('bekliyor', { timeout: 10_000 });
  await ctx.setOffline(false);
  await a.evaluate(() => dispatchEvent(new Event('online')));
  await expect(a.locator('#sync')).toContainText('Eşitlendi', { timeout: 15_000 });

  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await login(b, user);
  await listTitles(b).filter({ hasText: 'Uçakta foto' }).click();
  await expect(b.locator('#ed img.att')).toHaveAttribute('src', /^blob:/, { timeout: 10_000 });
  await ctx.close();
  await ctxB.close();
});
