import { noteMeta, REVISION_KEEP, sanitizeNoteHtml, uuidv7, type ChangeIn, type NoteInput, type PushResult } from '@camnotlar/shared';
import type { Tx } from '../db/pool.ts';
import { defaultFolder } from './folders.ts';
import { logChange } from './log.ts';
import { toNote, type NoteRow } from './mappers.ts';

const MAX_HTML = 2_000_000;
const ts = (n: unknown, def: number): number => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.min(n, Date.now() + 60_000) : def);

async function deviceName(c: Tx, id: string): Promise<string> {
  const r = await c.query<{ name: string }>('SELECT name FROM devices WHERE id=$1', [id]);
  return r.rows[0]?.name ?? 'başka cihaz';
}

/** Not hedef klasörü silinmiş ya da başkasınınsa varsayılan klasöre alınır. */
async function resolveFolder(c: Tx, userId: string, folderId: unknown): Promise<string> {
  if (typeof folderId === 'string') {
    const r = await c.query('SELECT 1 FROM folders WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [folderId, userId]);
    if (r.rowCount) return folderId;
  }
  return defaultFolder(c, userId);
}

async function addRevision(c: Tx, row: NoteRow, deviceId: string | null): Promise<void> {
  await c.query('INSERT INTO note_revisions(id, note_id, html, title, version, device_id) VALUES ($1,$2,$3,$4,$5,$6)', [
    uuidv7(), row.id, row.html, row.title, row.version, deviceId,
  ]);
  await c.query(
    `DELETE FROM note_revisions WHERE note_id=$1 AND id NOT IN
       (SELECT id FROM note_revisions WHERE note_id=$1 ORDER BY version DESC, created_at DESC LIMIT $2)`,
    [row.id, REVISION_KEEP],
  );
}

interface Applied { r: PushResult; seq: number }

/**
 * Not değişikliğini uygular.
 * - base_version eşleşirse ya da son yazan aynı cihazsa: doğrudan yazılır.
 * - Eşleşmezse: gelen içerik kabul edilir (son yazan kazanır) ve üstüne yazılan sürüm
 *   "… (çakışma kopyası — Cihaz)" adıyla aynı klasörde yeni not olarak saklanır.
 */
export async function applyNote(c: Tx, userId: string, deviceId: string, ch: ChangeIn): Promise<Applied> {
  const cur = (await c.query<NoteRow>('SELECT * FROM notes WHERE id=$1 FOR UPDATE', [ch.id])).rows[0];
  if (cur && cur.user_id !== userId) return { r: { entity: 'note', id: ch.id, status: 'invalid', message: 'Kimlik kullanımda.' }, seq: 0 };
  if (cur?.deleted_at) return { r: { entity: 'note', id: ch.id, status: 'gone' }, seq: 0 };

  if (ch.op === 'delete') {
    if (!cur) return { r: { entity: 'note', id: ch.id, status: 'gone' }, seq: 0 };
    const v = cur.version + 1;
    await c.query(
      `UPDATE notes SET deleted_at=now(), html='', title='', snippet='', plain_text='', version=$2 WHERE id=$1`, [ch.id, v],
    );
    await c.query('DELETE FROM note_revisions WHERE note_id=$1', [ch.id]);
    const seq = await logChange(c, userId, 'note', ch.id, v, 'delete');
    return { r: { entity: 'note', id: ch.id, status: 'ok', version: v }, seq };
  }

  const d = (ch.data ?? {}) as Partial<NoteInput>;
  if (typeof d.html !== 'string' || d.html.length > MAX_HTML) {
    return { r: { entity: 'note', id: ch.id, status: 'invalid', message: 'Not içeriği geçersiz ya da çok büyük.' }, seq: 0 };
  }
  const html = sanitizeNoteHtml(d.html, MAX_HTML);
  const meta = noteMeta(html);
  const now = Date.now();
  const folderId = await resolveFolder(c, userId, d.folderId);
  const values = {
    html, title: meta.title, snippet: meta.snippet, plain: meta.plain, pinned: !!d.pinned,
    createdAt: ts(d.createdAt, cur?.created_at.getTime() ?? now), updatedAt: ts(d.updatedAt, now),
    trashedAt: d.trashedAt == null ? null : ts(d.trashedAt, now),
  };
  let seq = 0;
  let conflictCopyId: string | undefined;

  if (!cur) {
    const row = (await c.query<NoteRow>(
      `INSERT INTO notes(id, user_id, folder_id, html, title, snippet, plain_text, pinned, created_at, updated_at, trashed_at,
                         version, base_version, last_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,to_timestamp($9::double precision/1000),to_timestamp($10::double precision/1000),
               to_timestamp($11::double precision/1000),1,0,$12) RETURNING *`,
      [ch.id, userId, folderId, values.html, values.title, values.snippet, values.plain, values.pinned,
        values.createdAt, values.updatedAt, values.trashedAt, deviceId],
    )).rows[0] as NoteRow;
    await addRevision(c, row, deviceId);
    seq = await logChange(c, userId, 'note', row.id, row.version, 'upsert');
    return { r: { entity: 'note', id: row.id, status: 'ok', version: row.version, data: toNote(row) }, seq };
  }

  const stale = ch.baseVersion !== cur.version;
  // Aynı cihazdan ardışık yazımlar ve içeriği değişmeyen yazımlar çakışma sayılmaz.
  const conflict = stale && cur.last_device_id !== deviceId && cur.html !== html;
  if (conflict) {
    conflictCopyId = uuidv7();
    const who = cur.last_device_id ? await deviceName(c, cur.last_device_id) : 'başka cihaz';
    const copyHtml = sanitizeNoteHtml(cur.html.replace(/^(<(div|h2)>)?([^<]*)/, (_m, open = '', _t, text: string) =>
      `${open}${text} (çakışma kopyası — ${who.replace(/[<>&]/g, '')})`));
    const cm = noteMeta(copyHtml);
    const copy = (await c.query<NoteRow>(
      `INSERT INTO notes(id, user_id, folder_id, html, title, snippet, plain_text, pinned, created_at, updated_at, trashed_at,
                         version, last_device_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9,$10,1,$11) RETURNING *`,
      [conflictCopyId, userId, cur.folder_id ?? folderId, copyHtml, cm.title, cm.snippet, cm.plain, cur.created_at, cur.updated_at,
        cur.trashed_at, cur.last_device_id],
    )).rows[0] as NoteRow;
    await addRevision(c, copy, cur.last_device_id);
    await logChange(c, userId, 'note', copy.id, 1, 'upsert');
  }
  const row = (await c.query<NoteRow>(
    `UPDATE notes SET folder_id=$2, html=$3, title=$4, snippet=$5, plain_text=$6, pinned=$7,
            created_at=to_timestamp($8::double precision/1000), updated_at=to_timestamp($9::double precision/1000),
            trashed_at=to_timestamp($10::double precision/1000), version=version+1, base_version=$11, last_device_id=$12
      WHERE id=$1 RETURNING *`,
    [ch.id, folderId, values.html, values.title, values.snippet, values.plain, values.pinned,
      values.createdAt, values.updatedAt, values.trashedAt, ch.baseVersion, deviceId],
  )).rows[0] as NoteRow;
  if (cur.html !== row.html) await addRevision(c, row, deviceId);
  seq = await logChange(c, userId, 'note', row.id, row.version, 'upsert');
  return {
    r: { entity: 'note', id: row.id, status: conflict ? 'conflict' : 'ok', version: row.version, conflictCopyId, data: toNote(row) },
    seq,
  };
}
