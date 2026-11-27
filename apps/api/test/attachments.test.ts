import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7, type Attachment } from '@camnotlar/shared';
import { cleanup } from '../src/jobs/cleanup.ts';
import { Client, note, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await setup();
});
afterAll(() => env.close());

const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

describe('dosya ekleri', () => {
  it('yükle, meta, indir; başka kullanıcı göremez', async () => {
    const a = new Client(env.app, 'A', env.db);
    await a.register();
    const id = uuidv7();
    const up = await a.req<Attachment>('PUT', `/v1/attachments/${id}`, PNG, { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('kapak ğ.png') });
    expect(up.status).toBe(201);
    expect(up.body).toMatchObject({ id, name: 'kapak ğ.png', mime: 'image/png', size: PNG.length });
    // Aynı kimlikle tekrar yükleme zararsız (kuyruk yeniden denemesi).
    expect((await a.req('PUT', `/v1/attachments/${id}`, PNG, { 'content-type': 'image/png' })).status).toBe(200);

    const dl = await a.req('GET', `/v1/attachments/${id}`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('image/png');
    expect(dl.headers['content-security-policy']).toContain('sandbox');
    expect(Buffer.compare(dl.raw, PNG)).toBe(0);

    const b = new Client(env.app, 'B', env.db);
    await b.register();
    expect((await b.req('GET', `/v1/attachments/${id}`)).status).toBe(404);
    expect((await b.req('PUT', `/v1/attachments/${id}`, PNG, { 'content-type': 'image/png' })).status).toBe(409);
  });

  it('HTML ya da betik içerikli dosya indirme olarak verilir', async () => {
    const a = new Client(env.app, 'A', env.db);
    await a.register();
    const id = uuidv7();
    await a.req('PUT', `/v1/attachments/${id}`, Buffer.from('<script>alert(1)</script>'), { 'content-type': 'text/html', 'x-file-name': '../../etc/passwd' });
    const meta = await a.req<Attachment>('GET', `/v1/attachments/${id}/meta`);
    expect(meta.body.name).toBe('.._.._etc_passwd');
    const dl = await a.req('GET', `/v1/attachments/${id}`);
    expect(dl.headers['content-type']).toBe('application/octet-stream');
    expect(String(dl.headers['content-disposition'])).toMatch(/^attachment;/);
  });

  it('boyut sınırı uygulanır', async () => {
    const a = new Client(env.app, 'A', env.db);
    await a.register();
    const big = Buffer.alloc(env.cfg.maxAttachmentBytes + 10);
    expect((await a.req('PUT', `/v1/attachments/${uuidv7()}`, big, { 'content-type': 'application/pdf' })).status).toBe(413);
  });

  it('notta kullanılmayan ekler temizlikte silinir, kullanılan kalır', async () => {
    const a = new Client(env.app, 'A', env.db);
    await a.register();
    const used = uuidv7();
    const orphan = uuidv7();
    for (const id of [used, orphan]) await a.req('PUT', `/v1/attachments/${id}`, PNG, { 'content-type': 'image/png' });
    await a.push([note(`<div>Resimli</div><div><img class="att" data-att="${used}" alt="r.png"></div>`)]);
    await env.db.query(`UPDATE attachments SET created_at = now() - interval '2 days'`);
    const res = await cleanup(env.db, 30, 90, env.attachments);
    expect(res.removedAttachments).toBeGreaterThanOrEqual(1);
    expect((await a.req('GET', `/v1/attachments/${used}`)).status).toBe(200);
    expect((await a.req('GET', `/v1/attachments/${orphan}`)).status).toBe(404);
    expect(await env.attachments.exists(orphan)).toBe(false);
  });
});
