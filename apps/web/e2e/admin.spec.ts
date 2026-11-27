import { expect, test } from '@playwright/test';
import { ADMIN, adminToken, BASE, login } from './helpers.ts';

test.describe('sunucu yönetimi (/yonetim/)', () => {
  test('yönetici girişi, kullanıcı oluşturma, yeni kullanıcının girişi ve silinmesi', async ({ browser }) => {
    await adminToken(BASE); // sunucu kurulu olsun
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto('/yonetim/');
    await expect(page.locator('#gateT')).toHaveText('Sunucu yönetimi');
    await page.fill('#gUser', ADMIN.username);
    await page.fill('#gPass', ADMIN.password);
    await page.click('#gGo');
    await expect(page.locator('#panel')).toBeVisible();
    await expect(page.locator('.utable')).toContainText(ADMIN.username);

    const username = `panel${Date.now().toString(36)}`;
    await page.fill('#nUser', username);
    await page.fill('#nName', 'Panel Kullanıcısı');
    await page.click('#nGen');
    const password = await page.inputValue('#nPass');
    expect(password).toHaveLength(14);
    await page.click('#nGo');
    await expect(page.locator('.cred')).toContainText(`Kullanıcı adı: ${username}`);
    await page.locator('.dlg .cn').click();
    await expect(page.locator(`tr[data-u="${username}"]`)).toContainText('Panel Kullanıcısı');

    // Yeni kullanıcı uygulamaya girebilir; yönetim sayfasına giremez.
    const userCtx = await browser.newContext();
    const app = await userCtx.newPage();
    await login(app, username, password);
    await expect(app.locator('#sync')).toContainText('Eşitlendi');
    await app.goto('/yonetim/');
    await expect(app.locator('#gErr')).toContainText('yönetici');

    // Silinen kullanıcının oturumu kapanır.
    page.on('dialog', (d) => void d.accept());
    await page.locator(`tr[data-u="${username}"] [data-a=del]`).click();
    await page.locator('.dlg .ok').click();
    await expect(page.locator(`tr[data-u="${username}"]`)).toHaveCount(0);
    await ctx.close();
    await userCtx.close();
  });

  test('uygulamada kayıt yok; giriş ekranı yöneticiye yönlendirir', async ({ page }) => {
    await adminToken(BASE);
    await page.goto('/');
    await expect(page.locator('#auth')).toBeVisible();
    await expect(page.locator('#auth')).not.toContainText('Hesap oluştur');
    await expect(page.locator('#auth')).toContainText('Sunucu yöneticisi oluşturur');
  });
});
