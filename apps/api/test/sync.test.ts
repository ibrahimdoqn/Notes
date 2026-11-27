import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { uuidv7, type Folder, type Note, type Revision } from '@camnotlar/shared';
import { cleanup } from '../src/jobs/cleanup.ts';
import { Client, note, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await setup();
});
afterAll(() => env.close());

async function pair() {
  const a = new Client(env.app, 'Masaüstü', env.db);
  const cred = await a.register();
  const b = new Client(env.app, 'Pixel 8');
  await b.login(cred.username, cred.password);
  return { a, b };
}

describe('push / pull', () => {
  it('bir cihazın yazdığı not diğerine gelir', async () => {
    const { a, b } = await pair();
    const n = note('<div>Alışveriş</div><ul class="check"><li>Süt</li></ul>');
    const res = await a.push([n]);
    expect(res.results[0]).toMatchObject({ status: 'ok', version: 1 });
    const p = await b.pull(0);
    const got = p.changes.find((c) => c.id === n.id);
    expect(got?.op).toBe('upsert');
    expect((got?.data as Note).title).toBe('Alışveriş');
    expect((got?.data as Note).snippet).toBe('Süt');
    // Varsayılan klasör de gelir; klasörsüz not ona yerleşir.
    const folder = p.changes.find((c) => c.entity === 'folder')?.data as Folder | undefined;
    expect((got?.data as Note).folderId).toBe(folder?.id);
    expect((await b.pull()).changes).toHaveLength(0);
  });

  it('HTML sunucuda temizlenir', async () => {
    const { a } = await pair();
    const n = note('<div onclick="x()">Başlık<script>alert(1)</script></div><img src=x onerror=alert(1)>');
    const r = await a.push([n]);
    expect((r.results[0]?.data as Note).html).toBe('<div>Başlık</div>');
  });

  it('aynı cihazdan ardışık yazımlar çakışma sayılmaz', async () => {
    const { a } = await pair();
    const n = note('<div>v1</div>');
    await a.push([n]);
    // İstemci yanıtı beklemeden ikinci kez eski base_version ile gönderdi.
    const r = await a.push([{ ...n, data: { ...(n.data as object), html: '<div>v2</div>' } }]);
    expect(r.results[0]?.status).toBe('ok');
    expect(r.results[0]?.version).toBe(2);
  });

  it('çakışmada son yazan kazanır ve üstüne yazılan sürüm kopya olarak saklanır', async () => {
    const { a, b } = await pair();
    const n = note('<div>Toplantı</div><div>ilk</div>');
    await a.push([n]);
    await b.pull(0);
    await a.push([{ ...n, baseVersion: 1, data: { ...(n.data as object), html: '<div>Toplantı</div><div>masaüstü</div>' } }]);
    // b hâlâ sürüm 1'i biliyor:
    const r = await b.push([{ ...n, baseVersion: 1, data: { ...(n.data as object), html: '<div>Toplantı</div><div>telefon</div>' } }]);
    expect(r.results[0]?.status).toBe('conflict');
    expect(r.results[0]?.conflictCopyId).toBeTruthy();
    const p = await a.pull(0);
    const notes = p.changes.filter((c) => c.entity === 'note').map((c) => c.data as Note);
    const main = notes.find((x) => x.id === n.id);
    const copy = notes.find((x) => x.id === r.results[0]?.conflictCopyId);
    expect(main?.html).toContain('telefon');
    expect(copy?.title).toBe('Toplantı (çakışma kopyası — Masaüstü)');
    expect(copy?.html).toContain('masaüstü');
  });

  it('başka kullanıcının not kimliğine yazılamaz', async () => {
    const { a } = await pair();
    const other = new Client(env.app, 'Test', env.db);
    await other.register();
    const n = note('<div>gizli</div>');
    await a.push([n]);
    const r = await other.push([{ ...n, baseVersion: 1, data: { ...(n.data as object), html: '<div>ele geçirildi</div>' } }]);
    expect(r.results[0]?.status).toBe('invalid');
    expect((await other.pull(0)).changes.find((c) => c.id === n.id)).toBeUndefined();
  });

  it('kalıcı silme izi diğer cihaza delete olarak gider, sonraki yazımlar "gone" döner', async () => {
    const { a, b } = await pair();
    const n = note('<div>geçici</div>');
    await a.push([n]);
    await b.pull(0);
    await a.push([{ entity: 'note', id: n.id, op: 'delete', baseVersion: 1 }]);
    const p = await b.pull();
    expect(p.changes.find((c) => c.id === n.id)?.op).toBe('delete');
    const late = await b.push([{ ...n, baseVersion: 1 }]);
    expect(late.results[0]?.status).toBe('gone');
  });

  it('klasör silinince içindeki notlar çöp kutusuna, sonradan gelen not varsayılan klasöre gider', async () => {
    const { a, b } = await pair();
    const fid = uuidv7();
    await a.push([{ entity: 'folder', id: fid, op: 'upsert', baseVersion: 0, data: { name: 'İş', sortOrder: 1 } }]);
    const inside = note('<div>rapor</div>', fid);
    await a.push([inside]);
    await b.pull(0);
    await a.push([{ entity: 'folder', id: fid, op: 'delete', baseVersion: 1 }]);
    // b çevrimdışıyken o klasöre yeni not ekledi:
    const late = note('<div>geç gelen</div>', fid);
    const r = await b.push([late]);
    expect((r.results[0]?.data as Note).folderId).not.toBe(fid);
    const p = await b.pull();
    expect(p.changes.find((c) => c.id === fid)?.op).toBe('delete');
    expect((p.changes.find((c) => c.id === inside.id)?.data as Note).trashedAt).toBeTypeOf('number');
  });

  it('sayfalı pull: hasMore ve seq', async () => {
    const { a, b } = await pair();
    await a.push(Array.from({ length: 30 }, (_, i) => note(`<div>not ${i}</div>`)));
    const p1 = await b.req<{ changes: unknown[]; hasMore: boolean; seq: number }>('GET', '/v1/sync/pull?since=0&limit=10');
    expect(p1.body.changes).toHaveLength(10);
    expect(p1.body.hasMore).toBe(true);
    let since = p1.body.seq;
    let total = p1.body.changes.length;
    for (;;) {
      const p = await b.pull(since);
      total += p.changes.length;
      since = p.seq;
      if (!p.hasMore) break;
    }
    expect(total).toBe(31); // 30 not + varsayılan klasör
  });

  it('100 değişiklik sınırı ve geçersiz kayıtlar', async () => {
    const { a } = await pair();
    const tooMany = await a.req('POST', '/v1/sync/push', { changes: Array.from({ length: 101 }, () => note('<div>x</div>')) });
    expect(tooMany.status).toBe(400);
    const r = await a.push([note('<div>iyi</div>'), { entity: 'note', id: 'kimlik-değil', op: 'upsert', baseVersion: 0, data: {} }]);
    expect(r.results.map((x) => x.status)).toEqual(['ok', 'invalid']);
  });
});

describe('ayarlar, geçmiş, arama, dışa aktarma', () => {
  it('ayarlar eşitlenir ve doğrulanır', async () => {
    const { a, b } = await pair();
    await a.push([{ entity: 'settings', id: a.userId, op: 'upsert', baseVersion: 0, data: { theme: 'rose', mode: 'zzz' } }]);
    const s = (await b.pull(0)).changes.find((c) => c.entity === 'settings');
    expect(s?.data).toMatchObject({ theme: 'rose', mode: 'auto' });
    const put = await a.req<{ version: number }>('PUT', '/v1/settings', { theme: 'ocean' });
    expect(put.body.version).toBe(2);
    expect((await b.req<{ data: { theme: string } }>('GET', '/v1/settings')).body.data.theme).toBe('ocean');
  });

  it('not geçmişi sürümleri tutar', async () => {
    const { a } = await pair();
    const n = note('<div>Taslak</div>');
    await a.push([n]);
    await a.push([{ ...n, baseVersion: 1, data: { ...(n.data as object), html: '<div>Taslak</div><div>ikinci</div>' } }]);
    await a.push([{ ...n, baseVersion: 2, data: { ...(n.data as object), html: '<div>Taslak</div><div>üçüncü</div>' } }]);
    const r = await a.req<{ revisions: Revision[] }>('GET', `/v1/notes/${n.id}/revisions`);
    expect(r.body.revisions.map((x) => x.version)).toEqual([3, 2, 1]);
    expect(r.body.revisions[2]?.html).toBe('<div>Taslak</div>');
    expect(r.body.revisions[0]?.deviceName).toBe('Masaüstü');
  });

  it('Türkçe tam metin arama', async () => {
    const { a } = await pair();
    await a.push([note('<div>Mercimek çorbası</div><div>kırmızı mercimek, soğan</div>'), note('<div>Kitaplar</div>')]);
    const r = await a.req<{ notes: Note[] }>('GET', `/v1/search?q=${encodeURIComponent('mercimekler')}`);
    expect(r.body.notes.map((x) => x.title)).toEqual(['Mercimek çorbası']);
    const partial = await a.req<{ notes: Note[] }>('GET', `/v1/search?q=${encodeURIComponent('Kitap')}`);
    expect(partial.body.notes.map((x) => x.title)).toContain('Kitaplar');
  });

  it('liste ucu imleçle sayfalanır, dışa aktarma tüm notları verir', async () => {
    const { a } = await pair();
    await a.push(Array.from({ length: 5 }, (_, i) => note(`<div>n${i}</div>`)));
    const p1 = await a.req<{ notes: Note[]; cursor: string }>('GET', '/v1/notes?limit=3');
    expect(p1.body.notes).toHaveLength(3);
    const p2 = await a.req<{ notes: Note[]; cursor: string | null }>('GET', `/v1/notes?limit=3&cursor=${p1.body.cursor}`);
    expect(p2.body.notes).toHaveLength(2);
    expect(p2.body.cursor).toBeNull();
    const ex = await a.req<{ notes: Note[]; folders: Folder[] }>('GET', '/v1/export');
    expect(ex.body.notes).toHaveLength(5);
    expect(ex.body.folders).toHaveLength(1);
  });

  it('çöp kutusu temizliği eski notları kalıcı siler', async () => {
    const { a, b } = await pair();
    const n = note('<div>eski</div>', null);
    (n.data as { trashedAt: number }).trashedAt = Date.now() - 40 * 864e5;
    await a.push([n]);
    await b.pull(0);
    const res = await cleanup(env.db, 30, 90);
    expect(res.purgedTrash).toBeGreaterThanOrEqual(1);
    expect((await b.pull()).changes.find((c) => c.id === n.id)?.op).toBe('delete');
  });
});

describe('WebSocket', () => {
  it('diğer cihaza "changed" sinyali gider', async () => {
    const { a, b } = await pair();
    await env.app.listen({ port: 0, host: '127.0.0.1' });
    const addr = env.app.server.address() as { port: number };
    const ws = new WebSocket(`ws://127.0.0.1:${addr.port}/v1/ws`);
    const msgs: { type: string; seq?: number }[] = [];
    await new Promise<void>((res, rej) => {
      ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token: b.token })));
      ws.on('message', (m: Buffer) => {
        msgs.push(JSON.parse(m.toString()));
        if (msgs.length === 1) res();
      });
      ws.on('error', rej);
    });
    expect(msgs[0]?.type).toBe('ready');
    const got = new Promise<void>((res) => ws.on('message', () => res()));
    const r = await a.push([note('<div>canlı</div>')]);
    await got;
    expect(msgs[1]).toEqual({ type: 'changed', seq: r.seq });
    ws.close();
  });
});
