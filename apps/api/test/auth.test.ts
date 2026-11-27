import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AdminUser, AuthResponse, ServerInfo, User } from '@camnotlar/shared';
import { Client, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await setup();
});
afterAll(() => env.close());

const PW = 'cok-gizli-parola-1';

describe('ilk kurulum ve yönetim', () => {
  // Bu bölüm sırayla çalışır: boş sunucu → kurulum → yönetici kullanıcı açar.
  let admin: Client;

  it('boş sunucu kurulum ister; ilk yönetici kurulumla açılır, ikinci kurulum reddedilir', async () => {
    const c = new Client(env.app);
    expect((await c.req<ServerInfo>('GET', '/v1/info')).body.needsSetup).toBe(true);
    const r = await c.req<AuthResponse>('POST', '/v1/setup', { username: 'Yonetici', password: PW, platform: 'android', deviceName: 'kurulum' });
    expect(r.status).toBe(200);
    expect(r.body.user).toMatchObject({ username: 'yonetici', isAdmin: true });
    expect((await c.req<ServerInfo>('GET', '/v1/info')).body.needsSetup).toBe(false);
    const again = await c.req<{ error: { code: string } }>('POST', '/v1/setup', { username: 'baska', password: PW, platform: 'android' });
    expect(again.body.error.code).toBe('setup_done');
    admin = new Client(env.app, 'Yönetim');
    await admin.login('yonetici', PW);
  });

  it('kayıt uç noktası yok; kullanıcıyı yönetici açar', async () => {
    const anon = new Client(env.app);
    expect((await anon.req('POST', '/v1/auth/register', { username: 'x', password: PW })).status).toBe(404);
    const created = await admin.req<User>('POST', '/v1/admin/users', { username: 'ayse', password: PW, displayName: 'Ayşe' });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ username: 'ayse', displayName: 'Ayşe', isAdmin: false });
    const dup = await admin.req<{ error: { code: string } }>('POST', '/v1/admin/users', { username: 'AYSE', password: PW });
    expect(dup.body.error.code).toBe('username_taken');
    const bad = await admin.req<{ error: { code: string } }>('POST', '/v1/admin/users', { username: 'a b', password: PW });
    expect(bad.body.error.code).toBe('invalid_username');
    const weak = await admin.req<{ error: { code: string } }>('POST', '/v1/admin/users', { username: 'mehmet', password: 'kisa' });
    expect(weak.body.error.code).toBe('weak_password');

    const ayse = new Client(env.app, 'Telefon');
    await ayse.login('ayse', PW);
    const list = await admin.req<{ users: AdminUser[] }>('GET', '/v1/admin/users');
    expect(list.body.users.map((u) => u.username)).toEqual(['yonetici', 'ayse']);
    expect(list.body.users[1]?.devices).toBe(1);
    // Yönetici olmayan yönetim uçlarına erişemez.
    expect((await ayse.req('GET', '/v1/admin/users')).status).toBe(403);
  });

  it('parola sıfırlama oturumları kapatır; son yönetici korunur; kullanıcı silinir', async () => {
    const ayse = new Client(env.app, 'Tablet');
    await ayse.login('ayse', PW);
    const list = await admin.req<{ users: AdminUser[] }>('GET', '/v1/admin/users');
    const ayseId = list.body.users.find((u) => u.username === 'ayse')?.id as string;
    const adminId = list.body.users.find((u) => u.username === 'yonetici')?.id as string;
    expect((await admin.req('PATCH', `/v1/admin/users/${ayseId}`, { password: 'yeni-cok-gizli-parola' })).status).toBe(200);
    expect((await ayse.req('GET', '/v1/me')).status).toBe(401);
    await ayse.login('ayse', 'yeni-cok-gizli-parola');

    const demote = await admin.req<{ error: { code: string } }>('PATCH', `/v1/admin/users/${adminId}`, { isAdmin: false });
    expect(demote.body.error.code).toBe('last_admin');
    expect((await admin.req('DELETE', `/v1/admin/users/${adminId}`)).status).toBe(409);

    expect((await admin.req('DELETE', `/v1/admin/users/${ayseId}`)).status).toBe(200);
    expect((await ayse.req('GET', '/v1/me')).status).toBe(401);
  });
});

describe('kimlik doğrulama', () => {
  it('giriş büyük/küçük harf duyarsız; /me ve varsayılan klasör', async () => {
    const a = new Client(env.app, 'A', env.db);
    const { username, password } = await a.register();
    const me = await a.req<{ user: { username: string } }>('GET', '/v1/me');
    expect(me.body.user.username).toBe(username);
    const folders = await a.req<{ folders: { name: string }[] }>('GET', '/v1/folders');
    expect(folders.body.folders.map((f) => f.name)).toEqual(['Notlar']);
    const b = new Client(env.app, 'İkinci cihaz');
    await b.login(username.toUpperCase(), password);
    expect(b.userId).toBe(a.userId);
    expect(b.deviceId).not.toBe(a.deviceId);
  });

  it('yanlış parola reddedilir', async () => {
    const a = new Client(env.app, 'A', env.db);
    const { username } = await a.register();
    const bad = await a.req<{ error: { code: string } }>('POST', '/v1/auth/login', { username, password: 'yanlis-parola-xx', platform: 'android' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('invalid_credentials');
  });

  it('yenileme belirteci döner; eski belirteç tekrar kullanılırsa oturum kapanır', async () => {
    const a = new Client(env.app, 'A', env.db);
    await a.register();
    const first = a.refreshToken;
    const r1 = await a.req<AuthResponse>('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first);
    a.adopt(r1.body);
    const reuse = await a.req<{ error: { code: string } }>('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(reuse.body.error.code).toBe('token_reused');
    expect((await a.req('GET', '/v1/me')).status).toBe(401);
    expect((await a.req('POST', '/v1/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
  });

  it('web: yenileme belirteci yalnızca HttpOnly çerezde', async () => {
    const a = new Client(env.app, 'A', env.db);
    const { username, password } = await a.register();
    const res = await env.app.inject({ method: 'POST', url: '/v1/auth/login', payload: { username, password, platform: 'web', deviceName: 'Chrome' } });
    const body = JSON.parse(res.body) as AuthResponse;
    expect(body.refreshToken).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'cn_refresh');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/refresh', cookies: { cn_refresh: cookie!.value } });
    expect(r.statusCode).toBe(200);
  });

  it('cihaz listesi ve uzaktan çıkış', async () => {
    const a = new Client(env.app, 'Pixel 8', env.db);
    const cred = await a.register();
    const b = new Client(env.app, 'Firefox');
    await b.login(cred.username, cred.password);
    const list = await a.req<{ devices: { id: string; name: string; current: boolean }[] }>('GET', '/v1/devices');
    expect(list.body.devices).toHaveLength(2);
    expect(list.body.devices.find((d) => d.current)?.name).toBe('Pixel 8');
    expect((await a.req('DELETE', `/v1/devices/${b.deviceId}`)).status).toBe(200);
    expect((await b.req('GET', '/v1/me')).status).toBe(401);
  });

  it('girişte oran sınırı (15 dakikada 10 deneme)', async () => {
    const a = new Client(env.app);
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await a.req('POST', '/v1/auth/login', { username: 'kaba', password: 'xxxxxxxxxxxx', platform: 'android' })).status;
    expect(last).toBe(429);
  });
});
