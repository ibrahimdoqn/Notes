import type { Db } from '../db/pool.ts';
import { tx } from '../db/pool.ts';
import { logChange } from '../sync/log.ts';

export interface CleanupResult {
  purgedTrash: number;
  purgedTombstones: number;
  expiredSessions: number;
}

/**
 * Gece işi:
 * - Son Silinenler'de `trashDays` günden uzun kalan notları kalıcı siler (silme izi bırakır).
 * - `tombstoneDays` günden eski silme izlerini, süresi dolmuş oturumları ve davetleri tamamen kaldırır.
 */
export async function cleanup(db: Db, trashDays: number, tombstoneDays: number): Promise<CleanupResult> {
  const purgedTrash = await tx(db, async (c) => {
    const r = await c.query<{ id: string; user_id: string; version: number }>(
      `UPDATE notes SET deleted_at=now(), html='', title='', snippet='', plain_text='', version=version+1
        WHERE deleted_at IS NULL AND trashed_at < now() - make_interval(days => $1) RETURNING id, user_id, version`,
      [trashDays],
    );
    for (const n of r.rows) {
      await c.query('DELETE FROM note_revisions WHERE note_id=$1', [n.id]);
      await logChange(c, n.user_id, 'note', n.id, n.version, 'delete');
    }
    return r.rowCount ?? 0;
  });
  const t1 = await db.query('DELETE FROM notes WHERE deleted_at < now() - make_interval(days => $1)', [tombstoneDays]);
  const t2 = await db.query('DELETE FROM folders f WHERE deleted_at < now() - make_interval(days => $1) AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.folder_id=f.id)', [tombstoneDays]);
  const s = await db.query(`DELETE FROM sessions WHERE expires_at < now() - interval '7 days' OR revoked_at < now() - interval '7 days'`);
  await db.query(`DELETE FROM invites WHERE expires_at < now() - interval '30 days'`);
  return { purgedTrash, purgedTombstones: (t1.rowCount ?? 0) + (t2.rowCount ?? 0), expiredSessions: s.rowCount ?? 0 };
}
