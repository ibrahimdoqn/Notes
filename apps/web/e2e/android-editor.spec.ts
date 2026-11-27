/**
 * Android uygulamasının WebView editörü (apps/android/app/src/main/assets/editor) Chromium'da
 * denenir: web ile aynı HTML sözleşmesini ürettiği ve fixture'ları kayıpsız taşıdığı doğrulanır.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { sanitizeNoteHtml } from '@camnotlar/shared';

const DIR = join(import.meta.dirname, '../../android/app/src/main/assets/editor');
const FIX = join(import.meta.dirname, '../../../packages/shared/fixtures');

test.describe('Android editörü', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { Android: object; __changes: string[]; __state: string; __need: string[]; __open: string[] };
      w.__changes = [];
      w.__need = [];
      w.__open = [];
      w.Android = {
        onChange: (h: string) => w.__changes.push(h), onState: (s: string) => (w.__state = s),
        needAtt: (id: string) => w.__need.push(id), openAtt: (id: string) => w.__open.push(id),
      };
    });
    await page.goto(`file://${DIR}/editor.html`);
  });

  test('ortak fixture içerikleri yükleyip geri okununca değişmez', async ({ page }) => {
    for (const f of readdirSync(FIX).filter((x) => x.endsWith('.html'))) {
      const html = readFileSync(join(FIX, f), 'utf8').trim();
      await page.evaluate((h) => (window as unknown as { CamEditor: { load(h: string, e: boolean, s: string): void } }).CamEditor.load(h, true, ''), html);
      const out = await page.locator('#ed').evaluate((e) => e.innerHTML);
      expect(sanitizeNoteHtml(out), f).toBe(html);
    }
  });

  test('yazma, kontrol listesi ve kalın: çıktı sözleşmeye uygun', async ({ page }) => {
    await page.evaluate(() => (window as unknown as { CamEditor: { load(h: string, e: boolean, s: string): void; focusEnd(): void } }).CamEditor.load('<div><br></div>', true, ''));
    await page.evaluate(() => (window as unknown as { CamEditor: { focusEnd(): void } }).CamEditor.focusEnd());
    await page.keyboard.type('Market');
    await page.keyboard.press('Enter');
    await page.evaluate(() => (window as unknown as { CamEditor: { fmt(c: string): void } }).CamEditor.fmt('check'));
    await page.keyboard.type('Süt');
    await page.evaluate(() => (window as unknown as { CamEditor: { fmt(c: string): void } }).CamEditor.fmt('bold'));
    await page.keyboard.type(' acil');
    const li = page.locator('#ed ul.check > li').first();
    const box = await li.boundingBox();
    await page.mouse.click((box?.x ?? 0) + 8, (box?.y ?? 0) + 10);
    await expect(li).toHaveClass(/done/);
    await page.waitForTimeout(400);
    const last = await page.evaluate(() => {
      const w = window as unknown as { __changes: string[] };
      return w.__changes[w.__changes.length - 1] ?? '';
    });
    const clean = sanitizeNoteHtml(last);
    // Tarayıcı listeyi bulunduğu satırın div'i içine yerleştirebilir; önemli olan sözleşmeye uyması.
    expect(sanitizeNoteHtml(clean)).toBe(clean);
    expect(clean).toMatch(/^<div>Market<\/div>(<div>)?<ul class="check"><li class="done">Süt<b>(&nbsp;| )acil<\/b><\/li><\/ul>/);
    const state = await page.evaluate(() => JSON.parse((window as unknown as { __state: string }).__state));
    expect(state.check).toBe(true);
  });

  test('ekler: resim istenir ve gösterilir, kaydedilen HTML temiz kalır, dosyaya dokununca açılır', async ({ page }) => {
    const html = readFileSync(join(FIX, 'attachments.html'), 'utf8').trim();
    type W = { CamEditor: { load(h: string, e: boolean, s: string): void; setAtt(id: string, u: string): void; html(): string }; __need: string[]; __open: string[] };
    await page.evaluate((h) => (window as unknown as W).CamEditor.load(h, true, ''), html);
    const need = await page.evaluate(() => (window as unknown as W).__need);
    expect(need).toEqual(['01a21c30-0000-7000-8000-0000000000aa']);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    await page.evaluate((u) => (window as unknown as W).CamEditor.setAtt('01a21c30-0000-7000-8000-0000000000aa', u), png);
    await expect(page.locator('#ed img.att')).toHaveAttribute('src', /^data:image\/png/);
    // Kaydedilecek HTML'de görüntüleme öznitelikleri yok; sözleşmeyle birebir aynı.
    expect(await page.evaluate(() => (window as unknown as W).CamEditor.html())).toBe(html);
    await page.locator('#ed span.file').click();
    expect(await page.evaluate(() => (window as unknown as W).__open)).toEqual(['01a21c30-0000-7000-8000-0000000000bb']);
  });
});
