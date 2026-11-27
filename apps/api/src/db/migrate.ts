import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Db } from './pool.ts';

// Kaynakta src/db/migrations, pakette dist/migrations (cli/ alt klasöründen bir üst).
const DIR = process.env.MIGRATIONS_DIR ??
  [join(import.meta.dirname, 'migrations'), join(import.meta.dirname, '..', 'migrations')].find((d) => existsSync(d)) ??
  join(import.meta.dirname, 'migrations');

/** migrations/ altındaki .sql dosyalarını ad sırasıyla bir kez uygular. */
export async function migrate(db: Db, log: (m: string) => void = () => {}): Promise<string[]> {
  const c = await db.connect();
  const applied: string[] = [];
  try {
    // Aynı anda başlayan api ve worker göçü iki kez uygulamasın.
    await c.query('SELECT pg_advisory_lock(727274)');
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const done = new Set((await c.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
    for (const f of readdirSync(DIR).filter((x) => x.endsWith('.sql')).sort()) {
      if (done.has(f)) continue;
      await c.query('BEGIN');
      try {
        await c.query(readFileSync(join(DIR, f), 'utf8'));
        await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [f]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK');
        throw new Error(`Göç başarısız: ${f}: ${(e as Error).message}`);
      }
      applied.push(f);
      log(`göç uygulandı: ${f}`);
    }
  } finally {
    await c.query('SELECT pg_advisory_unlock(727274)').catch(() => {});
    c.release();
  }
  return applied;
}
