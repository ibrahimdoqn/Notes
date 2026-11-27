import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import pg from 'pg';
import { uuidv7, type AuthResponse, type ChangeIn, type PullResponse, type PushResponse } from '@camnotlar/shared';
import { buildApp } from '../src/app.ts';
import { createSigner } from '../src/auth/tokens.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { migrate } from '../src/db/migrate.ts';
import { createPool, type Db } from '../src/db/pool.ts';
import { Hub } from '../src/lib/hub.ts';
import { AttachmentStore } from '../src/attachments/store.ts';
import { createUser } from '../src/auth/service.ts';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** Testler gerçek PostgreSQL'e karşı çalışır; her test dosyası kendi geçici veritabanını kurar. */
const ADMIN_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

export interface TestEnv {
  app: FastifyInstance;
  attachments: AttachmentStore;
  db: Db;
  cfg: Config;
  hub: Hub;
  url: string;
  close(): Promise<void>;
}

export async function setup(overrides: Partial<Config> = {}): Promise<TestEnv> {
  const name = `camnotlar_test_${randomBytes(4).toString('hex')}`;
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = ADMIN_URL.replace(/\/[^/]*$/, `/${name}`);
  const attachmentsDir = mkdtempSync(join(tmpdir(), 'camnotlar-att-'));
  const cfg: Config = { ...loadConfig({}), databaseUrl: url, hibpCheck: false, secureCookies: false, attachmentsDir, maxAttachmentBytes: 1024 * 1024, ...overrides };
  const db = createPool(url);
  await migrate(db);
  const hub = new Hub();
  const signer = await createSigner(undefined, cfg.accessTtlSec, () => {});
  const attachments = new AttachmentStore(cfg.attachmentsDir);
  const app = await buildApp({ cfg, db, signer, hub, attachments }, { logger: false });
  await app.ready();
  return {
    app, db, cfg, hub, url, attachments,
    async close() {
      await app.close();
      await db.end();
      const a = new pg.Client({ connectionString: ADMIN_URL });
      await a.connect();
      await a.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await a.end();
    },
  };
}

/** API'yi bir istemci gibi kullanan küçük yardımcı (Android tarzı: belirteç gövdede). */
export class Client {
  token = '';
  refreshToken = '';
  deviceId = '';
  userId = '';
  seq = 0;

  constructor(private app: FastifyInstance, public deviceName = 'Test cihazı', private db?: Db) {}

  async req<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown, headers: Record<string, string> = {},
  ): Promise<{ status: number; body: T; headers: Record<string, unknown>; raw: Buffer }> {
    const res = await this.app.inject({
      method, url, payload: payload as object,
      headers: { ...(this.token ? { authorization: `Bearer ${this.token}` } : {}), ...headers },
    });
    const ct = String(res.headers['content-type'] ?? '');
    if (!ct.includes('json')) return { status: res.statusCode, body: undefined as T, headers: res.headers, raw: res.rawPayload };
    return { status: res.statusCode, body: res.body ? (JSON.parse(res.body) as T) : (undefined as T), headers: res.headers, raw: res.rawPayload };
  }

  /** Kullanıcıyı doğrudan veritabanında oluşturur (yönetim arayüzünün yaptığı) ve giriş yapar. */
  async register(username = `u${randomBytes(4).toString('hex')}`, password = 'cok-gizli-parola-1', isAdmin = false) {
    if (!this.db) throw new Error('register için Client(db) gerekir');
    await createUser(this.db, username, password, { isAdmin, hibp: false });
    await this.login(username, password);
    return { username, password };
  }

  async login(username: string, password: string) {
    const r = await this.req<AuthResponse>('POST', '/v1/auth/login', { username, password, deviceName: this.deviceName, platform: 'android' });
    if (r.status !== 200) throw new Error(`giriş başarısız: ${JSON.stringify(r.body)}`);
    this.adopt(r.body);
  }

  adopt(a: AuthResponse) {
    this.token = a.accessToken;
    this.refreshToken = a.refreshToken ?? '';
    this.deviceId = a.deviceId;
    this.userId = a.user.id;
  }

  async push(changes: ChangeIn[]) {
    const r = await this.req<PushResponse>('POST', '/v1/sync/push', { changes });
    if (r.status !== 200) throw new Error(`push başarısız: ${JSON.stringify(r.body)}`);
    return r.body;
  }

  async pull(since = this.seq) {
    const r = await this.req<PullResponse>('GET', `/v1/sync/pull?since=${since}`);
    if (r.status !== 200) throw new Error(`pull başarısız: ${JSON.stringify(r.body)}`);
    this.seq = r.body.seq;
    return r.body;
  }
}

export const note = (html: string, folderId: string | null = null, extra: Partial<ChangeIn> = {}): ChangeIn => ({
  entity: 'note', id: uuidv7(), op: 'upsert', baseVersion: 0,
  data: { folderId, html, pinned: false, createdAt: Date.now(), updatedAt: Date.now(), trashedAt: null },
  ...extra,
});
