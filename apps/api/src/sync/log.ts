import type { Entity, Op } from '@camnotlar/shared';
import type { Queryable } from '../db/pool.ts';

/** Eşitleme imlecine bir satır ekler, yeni seq'i döner. */
export async function logChange(db: Queryable, userId: string, entity: Entity, id: string, version: number, op: Op): Promise<number> {
  const { rows } = await db.query<{ seq: number }>(
    'INSERT INTO change_log(user_id, entity, entity_id, version, op) VALUES ($1,$2,$3,$4,$5) RETURNING seq',
    [userId, entity, id, version, op],
  );
  return (rows[0] as { seq: number }).seq;
}

export async function currentSeq(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ s: number | null }>('SELECT max(seq) AS s FROM change_log WHERE user_id=$1', [userId]);
  return rows[0]?.s ?? 0;
}
