/**
 * Eşitleme simülatörü: 3 sahte istemci rastgele aralıklarla çevrimdışı olur, not oluşturur
 * ve aynı notları düzenler. Sonunda herkes çevrimiçi olup eşitlendiğinde:
 *   1) tüm istemciler sunucuyla aynı duruma gelmeli,
 *   2) hiçbir istemcinin son yazdığı içerik kaybolmamalı (ana notta ya da çakışma kopyasında).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { uuidv7, type ChangeIn, type Note } from '@camnotlar/shared';
import { Client, setup, type TestEnv } from './helpers.ts';

let env: TestEnv;
beforeAll(async () => {
  env = await setup();
});
afterAll(() => env.close());

// Tekrarlanabilir rastgelelik (mulberry32).
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class SimClient {
  notes = new Map<string, { html: string; version: number; createdAt: number }>();
  outbox = new Map<string, { change: ChangeIn; rev: number }>();
  online = true;
  rev = 0;
  constructor(public api: Client, public name: string) {}

  write(id: string, html: string) {
    const cur = this.notes.get(id);
    const createdAt = cur?.createdAt ?? Date.now();
    this.notes.set(id, { html, version: cur?.version ?? 0, createdAt });
    const pending = this.outbox.get(id);
    // Aynı nota ardışık yazımlar kuyrukta birleşir; base_version ilk bekleyen yazımınki kalır.
    const baseVersion = pending ? pending.change.baseVersion : cur?.version ?? 0;
    this.outbox.set(id, {
      rev: ++this.rev,
      change: {
        entity: 'note', id, op: 'upsert', baseVersion,
        data: { folderId: null, html, pinned: false, createdAt, updatedAt: Date.now(), trashedAt: null },
      },
    });
  }

  async sync() {
    if (!this.online) return;
    const batch = [...this.outbox.values()].slice(0, 100);
    if (batch.length) {
      const res = await this.api.push(batch.map((b) => b.change));
      res.results.forEach((r, i) => {
        const sent = batch[i];
        if (!sent) return;
        const local = this.notes.get(r.id);
        if ((r.status === 'ok' || r.status === 'conflict') && local) local.version = r.version ?? local.version;
        const now = this.outbox.get(r.id);
        if (now && now.rev === sent.rev) this.outbox.delete(r.id);
        else if (now) now.change.baseVersion = r.version ?? now.change.baseVersion;
      });
    }
    for (;;) {
      const p = await this.api.pull();
      for (const c of p.changes) {
        if (c.entity !== 'note' || this.outbox.has(c.id)) continue;
        if (c.op === 'delete') this.notes.delete(c.id);
        else {
          const n = c.data as Note;
          this.notes.set(c.id, { html: n.html, version: n.version, createdAt: n.createdAt });
        }
      }
      if (!p.hasMore) break;
    }
  }
}

describe('eşitleme simülatörü', () => {
  for (const seed of [1, 7, 42]) {
    it(`3 istemci, rastgele çevrimdışı aralıklar (tohum ${seed})`, async () => {
      const rand = rng(seed);
      const first = new Client(env.app, 'sim-0', env.db);
      const cred = await first.register();
      const clients = [new SimClient(first, 'sim-0')];
      for (let i = 1; i < 3; i++) {
        const c = new Client(env.app, `sim-${i}`);
        await c.login(cred.username, cred.password);
        clients.push(new SimClient(c, `sim-${i}`));
      }
      let k = 0;
      for (let step = 0; step < 120; step++) {
        const c = clients[Math.floor(rand() * clients.length)] as SimClient;
        const roll = rand();
        if (roll < 0.12) c.online = !c.online;
        else if (roll < 0.3 || c.notes.size === 0) c.write(uuidv7(), `<div>Not</div><div>${c.name}-${++k}</div>`);
        else if (roll < 0.8) {
          const ids = [...c.notes.keys()];
          const id = ids[Math.floor(rand() * ids.length)] as string;
          c.write(id, `<div>Not</div><div>${c.name}-${++k}</div>`);
        } else await c.sync();
      }
      // Her istemcinin en son yerel içeriği (kaybolmaması gerekenler):
      const mustSurvive = new Set<string>();
      for (const c of clients) for (const [id] of c.outbox) mustSurvive.add(String(c.notes.get(id)?.html.match(/sim-\d+-\d+/)?.[0]));

      clients.forEach((c) => (c.online = true));
      for (let round = 0; round < 3; round++) for (const c of clients) await c.sync();

      const server = (await first.req<{ notes: Note[] }>('GET', '/v1/export')).body.notes;
      const serverMap = new Map(server.map((n) => [n.id, n.html]));
      for (const c of clients) {
        expect(c.outbox.size).toBe(0);
        expect(new Map([...c.notes].map(([id, n]) => [id, n.html]))).toEqual(serverMap);
      }
      const allHtml = server.map((n) => n.html).join('\n');
      for (const marker of mustSurvive) expect(allHtml).toContain(marker);
    });
  }
});
