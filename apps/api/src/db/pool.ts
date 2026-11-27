import pg from 'pg';

// bigint (seq) değerlerini sayı olarak oku; 2^53 sınırına pratikte ulaşılmaz.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));

export type Db = pg.Pool;
export type Tx = pg.PoolClient;
export type Queryable = Pick<pg.Pool, 'query'>;

export function createPool(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

/** Bir işlemi BEGIN/COMMIT arasında çalıştırır; hata olursa geri alır. */
export async function tx<T>(db: Db, fn: (c: Tx) => Promise<T>): Promise<T> {
  const c = await db.connect();
  try {
    await c.query('BEGIN');
    const r = await fn(c);
    await c.query('COMMIT');
    return r;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export const ms = (d: Date | null | undefined): number | null => (d ? d.getTime() : null);
export const toDate = (n: number | null | undefined): Date | null => (n == null ? null : new Date(n));
