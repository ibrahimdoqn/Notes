import { expect, test } from '@playwright/test';
import { listTitles, login, register, writeNote } from './helpers.ts';

test.describe('notlar ve eşitleme', () => {
  test('not oluştur, düzenle, sabitle, sil ve geri al', async ({ page }) => {
    await register(page);
    await writeNote(page, ['Alışveriş listesi', 'süt ve ekmek']);
    await expect(listTitles(page).first()).toHaveText('Alışveriş listesi');
    await expect(page.locator('#wc')).toHaveText('5 kelime');

    await page.click('.act [data-act=pin]');
    await expect(page.locator('#notes .cap').first()).toHaveText('Sabitlenmiş');

    await page.click('.act [data-act=del]');
    await expect(page.locator('#toast')).toContainText('Son Silinenler’e taşındı');
    await page.locator('#toast button').click();
    await expect(listTitles(page).first()).toHaveText('Alışveriş listesi');
    await expect(page.locator('#sync')).toContainText('Eşitlendi');
  });

  test('kontrol listesi ve biçimler', async ({ page }) => {
    await register(page);
    await writeNote(page, ['Yapılacaklar']);
    await page.keyboard.press('Enter');
    await page.click('[data-f=check]');
    await page.keyboard.type('Birinci madde');
    const li = page.locator('#ed ul.check > li').first();
    await expect(li).toHaveText('Birinci madde');
    const box = await li.boundingBox();
    await page.mouse.click((box?.x ?? 0) + 8, (box?.y ?? 0) + 10);
    await expect(li).toHaveClass(/done/);
    await page.keyboard.press('Enter');
    await page.click('[data-f=bold]');
    await page.keyboard.type('kalın');
    await expect(page.locator('#ed b')).toHaveText('kalın');
  });

  test('iki sekme: birinde yazılan not diğerine canlı gelir', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const email = await register(a);
    await login(b, email);
    await writeNote(a, ['Canlı eşitleme', 'ikinci cihazda görünmeli']);
    // Yazmayı bıraktıktan ~2 sn sonra push, WebSocket sinyaliyle diğer cihaz çeker.
    await expect(listTitles(b)).toContainText(['Canlı eşitleme'], { timeout: 10_000 });
    await listTitles(b).filter({ hasText: 'Canlı eşitleme' }).click();
    await expect(b.locator('#ed')).toContainText('ikinci cihazda görünmeli');
    await ctxA.close();
    await ctxB.close();
  });

  test('çevrimdışı yazılan not bağlantı gelince eşitlenir', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const a = await ctxA.newPage();
    const email = await register(a);
    await ctxA.setOffline(true);
    await a.evaluate(() => dispatchEvent(new Event('offline')));
    await writeNote(a, ['Uçakta yazıldı']);
    await expect(a.locator('#sync')).toContainText('Çevrimdışı', { timeout: 10_000 });
    await expect(a.locator('#sync')).toContainText('1 değişiklik bekliyor', { timeout: 10_000 });
    // Sayfa yenilense de not yerelde durur (IndexedDB).
    await ctxA.setOffline(false);
    await a.reload();
    await expect(listTitles(a).first()).toHaveText('Uçakta yazıldı');
    await expect(a.locator('#sync')).toContainText('Eşitlendi', { timeout: 10_000 });

    const ctxB = await browser.newContext();
    const b = await ctxB.newPage();
    await login(b, email);
    await expect(listTitles(b)).toContainText(['Uçakta yazıldı']);
    await ctxA.close();
    await ctxB.close();
  });

  test('klasör oluştur, nota taşı ve ayarlar eşitlenir', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();
    const email = await register(a);
    await login(b, email);

    await a.click('#newF');
    await a.fill('.dlg .fld', 'İş');
    await a.click('.dlg .ok');
    await expect(a.locator('#lt')).toHaveText('İş');
    await writeNote(a, ['Rapor taslağı']);

    await a.keyboard.press('Control+Comma');
    await a.click('#themes [data-th=ocean]');
    await expect(a.locator('html')).toHaveAttribute('data-accent', 'ocean');
    await a.click('#setX');

    await expect(b.locator('#folders .row .nm')).toContainText(['İş'], { timeout: 10_000 });
    await expect(b.locator('html')).toHaveAttribute('data-accent', 'ocean', { timeout: 10_000 });
    await ctxA.close();
    await ctxB.close();
  });

  test('sunucusuz kullanım: örnek notlar ve sonradan hesaba taşıma', async ({ page }) => {
    await page.goto('/');
    await page.click('#aLocal');
    await expect(listTitles(page).first()).toHaveText('Cam Notlar’a hoş geldin');
    await expect(page.locator('#sync')).toBeHidden();
    await page.keyboard.press('Control+Comma');
    await page.click('#connectB');
    await page.locator('#authMode [data-m=register]').click();
    await page.fill('#aEmail', `yerel${Date.now()}@ornek.com`);
    await page.fill('#aPass', 'cok-gizli-parola-1');
    await page.click('#aGo');
    await expect(page.locator('#sync')).toContainText('Eşitlendi', { timeout: 10_000 });
    // Yerel "Notlar" klasörü sunucudakiyle birleşir; tek "Notlar" kalır.
    await expect(page.locator('#folders .row .nm', { hasText: /^Notlar$/ })).toHaveCount(1);
    const res = await page.evaluate(async () => (await fetch('/v1/info')).json());
    expect(res.name).toBe('camnotlar');
  });

  test('not geçmişi: önceki sürüm geri yüklenir', async ({ page }) => {
    await register(page);
    await writeNote(page, ['Geçmiş', 'ilk sürüm']);
    await expect(page.locator('#sync')).toContainText('Eşitlendi', { timeout: 10_000 });
    await page.waitForTimeout(2500);
    await page.keyboard.type(' ve ekleme');
    await page.waitForTimeout(2500);
    await expect(page.locator('#sync')).toContainText('Eşitlendi', { timeout: 10_000 });
    await page.click('#histB');
    await expect(page.locator('.hitem')).toHaveCount(2);
    await expect(page.locator('.hprev .ed ins')).toContainText('ekleme');
    await page.locator('.hitem').nth(1).click();
    await page.click('[data-restore]');
    await expect(page.locator('#ed')).not.toContainText('ekleme');
  });
});
