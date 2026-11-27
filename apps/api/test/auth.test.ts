import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthResponse } from '@camnotlar/shared';
import { createInvite } from '../src/auth/service.ts';
import { Client, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await setup();
});
afterAll(() => env.close());

describe('kimlik doğrulama', () => {
  it('kayıt, giriş, /me ve varsayılan klasör', async () => {
    const a = new Client(env.app);
    const { email, password } = await a.register();
    const me = await a.req<{ user: { email: string } }>('GET', '/v1/me');
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(email);
    const folders = await a.req<{ folders: { name: string }[] }>('GET', '/v1/folders');
    expect(folders.body.folders.map((f) => f.name)).toEqual(['Notlar']);

    const b = new Client(env.app, 'İkinci cihaz');
    await b.login(email.toUpperCase(), password);
    expect(b.userId).toBe(a.userId);
    expect(b.deviceId).not.toBe(a.deviceId);
  });

  it('yanlış parola, zayıf parola ve aynı e-posta reddedilir', async () => {
    const a = new Client(env.app);
    const { email } = await a.register();
    const bad = await a.req<{ error: { code: string } }>('POST', '/v1/auth/login', { email, password: 'yanlis-parola-xx', platform: 'android' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('invalid_credentials');
    const weak = await a.req<{ error: { code: string } }>('POST', '/v1/auth/register', { email: 'yeni@ornek.com', password: 'kisa', platform: 'android' });
    expect(weak.body.error.code).toBe('weak_password');
    const dup = await a.req<{ error: { code: string } }>('POST', '/v1/auth/register', { email, password: 'baska-bir-parola-1', platform: 'android' });
    expect(dup.status).toBe(409);
  });

  it('yenileme belirteci döner; eski belirteç tekrar kullanılırsa oturum kapanır', async () => {
    const a = new Client(env.app);
    await a.register();
    const first = a.refreshToken;
    const r1 = await a.req<AuthResponse>('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(first);
    a.adopt(r1.body);
    // Çalınmış eski belirteç:
    const reuse = await a.req<{ error: { code: string } }>('POST', '/v1/auth/refresh', { refreshToken: first });
    expect(reuse.body.error.code).toBe('token_reused');
    // Oturum kapandığı için güncel erişim belirteci de artık geçmez.
    expect((await a.req('GET', '/v1/me')).status).toBe(401);
    expect((await a.req('POST', '/v1/auth/refresh', { refreshToken: a.refreshToken })).status).toBe(401);
  });

  it('web: yenileme belirteci yalnızca HttpOnly çerezde', async () => {
    const email = 'web@ornek.com';
    const res = await env.app.inject({
      method: 'POST', url: '/v1/auth/register',
      payload: { email, password: 'cok-gizli-parola-1', platform: 'web', deviceName: 'Chrome' },
    });
    const body = JSON.parse(res.body) as AuthResponse;
    expect(body.refreshToken).toBeUndefined();
    const cookie = res.cookies.find((c) => c.name === 'cn_refresh');
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    const r = await env.app.inject({ method: 'POST', url: '/v1/auth/refresh', cookies: { cn_refresh: cookie!.value } });
    expect(r.statusCode).toBe(200);
    expect((JSON.parse(r.body) as AuthResponse).refreshToken).toBeUndefined();
  });

  it('cihaz listesi ve uzaktan çıkış', async () => {
    const a = new Client(env.app, 'Pixel 8');
    const cred = await a.register();
    const b = new Client(env.app, 'Firefox');
    await b.login(cred.email, cred.password);
    const list = await a.req<{ devices: { id: string; name: string; current: boolean }[] }>('GET', '/v1/devices');
    expect(list.body.devices).toHaveLength(2);
    expect(list.body.devices.find((d) => d.current)?.name).toBe('Pixel 8');
    expect((await a.req('DELETE', `/v1/devices/${b.deviceId}`)).status).toBe(200);
    expect((await b.req('GET', '/v1/me')).status).toBe(401);
    expect((await a.req('GET', '/v1/me')).status).toBe(200);
  });

  it('girişte oran sınırı (15 dakikada 10 deneme)', async () => {
    const a = new Client(env.app);
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await a.req('POST', '/v1/auth/login', { email: 'kaba@ornek.com', password: 'xxxxxxxxxxxx', platform: 'android' })).status;
    }
    expect(last).toBe(429);
  });
});

describe('kayıt kapalı', () => {
  let closed: TestEnv;
  beforeAll(async () => {
    closed = await setup({ allowSignup: false });
  });
  afterAll(() => closed.close());

  it('davet kodu olmadan kayıt olunamaz, kodla bir kez olunur', async () => {
    const a = new Client(closed.app);
    const no = await a.req<{ error: { code: string } }>('POST', '/v1/auth/register', { email: 'a@ornek.com', password: 'cok-gizli-parola-1', platform: 'android' });
    expect(no.body.error.code).toBe('signup_closed');
    const code = await createInvite(closed.db, null, null);
    const ok = await a.req('POST', '/v1/auth/register', { email: 'a@ornek.com', password: 'cok-gizli-parola-1', platform: 'android', inviteCode: code });
    expect(ok.status).toBe(200);
    const again = await a.req<{ error: { code: string } }>('POST', '/v1/auth/register', { email: 'b@ornek.com', password: 'cok-gizli-parola-1', platform: 'android', inviteCode: code });
    expect(again.body.error.code).toBe('invalid_invite');
  });
});
