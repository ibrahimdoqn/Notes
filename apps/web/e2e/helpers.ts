import { expect, type Page } from '@playwright/test';

let n = 0;
export const uniqueEmail = () => `e2e${Date.now()}${n++}@ornek.com`;
export const PASSWORD = 'cok-gizli-parola-1';

export async function register(page: Page, email = uniqueEmail()): Promise<string> {
  await page.goto('/');
  await expect(page.locator('#auth')).toBeVisible();
  await page.locator('#authMode [data-m=register]').click();
  await page.fill('#aEmail', email);
  await page.fill('#aPass', PASSWORD);
  await page.click('#aGo');
  await expect(page.locator('#auth')).toBeHidden();
  await expect(page.locator('#sync')).toContainText('Eşitlendi');
  return email;
}

export async function login(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#auth')).toBeVisible();
  await page.fill('#aEmail', email);
  await page.fill('#aPass', PASSWORD);
  await page.click('#aGo');
  await expect(page.locator('#auth')).toBeHidden();
}

/** Yeni not açıp verilen satırları yazar (ilk satır başlık). */
export async function writeNote(page: Page, lines: string[]): Promise<void> {
  await page.keyboard.press('Alt+KeyN');
  const ed = page.locator('#ed');
  await expect(ed).toBeFocused();
  for (let i = 0; i < lines.length; i++) {
    if (i) await page.keyboard.press('Enter');
    await page.keyboard.type(lines[i] as string);
  }
}

export const listTitles = (page: Page) => page.locator('#notes .item .tt');
