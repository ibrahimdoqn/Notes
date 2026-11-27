import { uuidv7, type ChangeIn, type FolderInput, type PushResult } from '@camnotlar/shared';
import type { Tx } from '../db/pool.ts';
import { logChange } from './log.ts';
import { toFolder, type FolderRow } from './mappers.ts';

const cleanName = (s: unknown) => (typeof s === 'string' ? s.trim().slice(0, 60) : '') || 'Klasör';

/** Kullanıcının varsayılan "Notlar" klasörü; yoksa oluşturulur. */
export async function defaultFolder(c: Tx, userId: string): Promise<string> {
  const r = await c.query<{ id: string }>(
    `SELECT id FROM folders WHERE user_id=$1 AND deleted_at IS NULL ORDER BY (name='Notlar') DESC, sort_order, id LIMIT 1`, [userId],
  );
  if (r.rows[0]) return r.rows[0].id;
  const id = uuidv7();
  await c.query("INSERT INTO folders(id, user_id, name) VALUES ($1,$2,'Notlar')", [id, userId]);
  await logChange(c, userId, 'folder', id, 1, 'upsert');
  return id;
}

/** Klasör değişikliği: son yazan kazanır, çakışma kopyası üretilmez. */
export async function applyFolder(c: Tx, userId: string, ch: ChangeIn, trashAt: number): Promise<{ r: PushResult; seq: number }> {
  const cur = (await c.query<FolderRow>('SELECT * FROM folders WHERE id=$1 FOR UPDATE', [ch.id])).rows[0];
  if (cur && cur.user_id !== userId) return { r: { entity: 'folder', id: ch.id, status: 'invalid', message: 'Kimlik kullanımda.' }, seq: 0 };
  if (cur?.deleted_at) return { r: { entity: 'folder', id: ch.id, status: 'gone' }, seq: 0 };
  const status = cur && ch.baseVersion !== cur.version ? 'conflict' : 'ok';

  if (ch.op === 'delete') {
    if (!cur) return { r: { entity: 'folder', id: ch.id, status: 'gone' }, seq: 0 };
    const v = cur.version + 1;
    await c.query('UPDATE folders SET deleted_at=now(), updated_at=now(), version=$2 WHERE id=$1', [ch.id, v]);
    let seq = await logChange(c, userId, 'folder', ch.id, v, 'delete');
    // İçindeki etkin notlar Son Silinenler'e taşınır.
    const moved = await c.query<{ id: string; version: number }>(
      `UPDATE notes SET trashed_at=to_timestamp($3::double precision / 1000), version=version+1, updated_at=updated_at
        WHERE user_id=$1 AND folder_id=$2 AND trashed_at IS NULL AND deleted_at IS NULL RETURNING id, version`,
      [userId, ch.id, trashAt],
    );
    for (const n of moved.rows) seq = await logChange(c, userId, 'note', n.id, n.version, 'upsert');
    return { r: { entity: 'folder', id: ch.id, status: 'ok', version: v }, seq };
  }

  const d = (ch.data ?? {}) as Partial<FolderInput>;
  const name = cleanName(d.name);
  const order = Number.isInteger(d.sortOrder) ? (d.sortOrder as number) : 0;
  let row: FolderRow;
  if (!cur) {
    row = (await c.query<FolderRow>('INSERT INTO folders(id, user_id, name, sort_order) VALUES ($1,$2,$3,$4) RETURNING *', [
      ch.id, userId, name, order,
    ])).rows[0] as FolderRow;
  } else {
    row = (await c.query<FolderRow>(
      'UPDATE folders SET name=$2, sort_order=$3, version=version+1, updated_at=now() WHERE id=$1 RETURNING *', [ch.id, name, order],
    )).rows[0] as FolderRow;
  }
  const seq = await logChange(c, userId, 'folder', row.id, row.version, 'upsert');
  return { r: { entity: 'folder', id: row.id, status, version: row.version, data: toFolder(row) }, seq };
}
