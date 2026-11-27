import { expect, request as pwRequest, type APIRequestContext, type Page } from '@playwright/test';

let n = 0;
export const BASE = process.env.E2E_BASE ?? 'http://localhost:4174';
export const PASSWORD = 'cok-gizli-parola-1';
export const ADMIN = { username: 'yonetici', password: 'yonetici-parola-123' };
export const uniqueUser = () => `e2e${Date.now().toString(36)}${n++}`;

async function api(baseURL: string): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL });
}

/** Sunucu boşsa ilk yöneticiyi kurar; yönetici belirteci döner. */
let cachedToken: string | null = null;
export async function adminToken(baseURL: string): Promise<string> {
  // Giriş oran sınırına (15 dk'da 10) takılmamak için belirteç test dosyası boyunca yeniden kullanılır.
  if (cachedToken) return cachedToken;
  const ctx = await api(baseURL);
  const info = await (await ctx.get('/v1/info')).json();
  const body = { ...ADMIN, platform: 'android', deviceName: 'e2e' };
  const res = info.needsSetup ? await ctx.post('/v1/setup', { data: body }) : await ctx.post('/v1/auth/login', { data: body });
  expect(res.ok()).toBe(true);
  cachedToken = (await res.json()).accessToken as string;
  await ctx.dispose();
  return cachedToken;
}

/** Yönetici olarak yeni kullanıcı açar (uygulamalarda kayıt yok). */
export async function createUser(baseURL: string, username = uniqueUser()): Promise<string> {
  const token = await adminToken(baseURL);
  const ctx = await api(baseURL);
  const res = await ctx.post('/v1/admin/users', { data: { username, password: PASSWORD }, headers: { authorization: `Bearer ${token}` } });
  expect(res.status()).toBe(201);
  await ctx.dispose();
  return username;
}

export async function login(page: Page, username: string, password = PASSWORD): Promise<void> {
  await page.goto('/');
  await expect(page.locator('#auth')).toBeVisible();
  await page.fill('#aUser', username);
  await page.fill('#aPass', password);
  await page.click('#aGo');
  await expect(page.locator('#auth')).toBeHidden();
}

/** Yeni kullanıcı açıp onunla giriş yapar. */
export async function register(page: Page): Promise<string> {
  const username = await createUser(BASE);
  await login(page, username);
  await expect(page.locator('#sync')).toContainText('Eşitlendi');
  return username;
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
