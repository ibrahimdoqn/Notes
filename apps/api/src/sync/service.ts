import {
  isUuid, PULL_LIMIT, PUSH_LIMIT, type ChangeIn, type ChangeOut, type Entity, type PullResponse, type PushResponse, type PushResult,
} from '@camnotlar/shared';
import { tx, type Db } from '../db/pool.ts';
import { ApiError, badRequest } from '../lib/errors.ts';
import { applyFolder } from './folders.ts';
import { currentSeq } from './log.ts';
import { toFolder, toNote, type FolderRow, type NoteRow } from './mappers.ts';
import { applyNote } from './notes.ts';
import { applySettings, getSettings } from './settings.ts';

const ENTITIES = new Set<Entity>(['note', 'folder', 'settings']);

function validate(ch: unknown): ch is ChangeIn {
  const c = ch as ChangeIn;
  return !!c && ENTITIES.has(c.entity) && isUuid(c.id) && (c.op === 'upsert' || c.op === 'delete') &&
    Number.isInteger(c.baseVersion) && c.baseVersion >= 0;
}

/**
 * İstemci kuyruğunu sırayla uygular. Her değişiklik kendi kayıt noktasında (SAVEPOINT)
 * çalışır; biri hata verirse yalnızca o "invalid" döner, diğerleri yazılır.
 */
export async function push(db: Db, userId: string, deviceId: string, changes: unknown): Promise<PushResponse> {
  if (!Array.isArray(changes)) throw badRequest('changes bir dizi olmalı.');
  if (changes.length > PUSH_LIMIT) throw new ApiError(413, 'too_many_changes', `Tek seferde en fazla ${PUSH_LIMIT} değişiklik gönderilebilir.`);
  return tx(db, async (c) => {
    const results: PushResult[] = [];
    const now = Date.now();
    for (const raw of changes) {
      if (!validate(raw)) {
        const r = raw as Partial<ChangeIn>;
        results.push({ entity: (r?.entity ?? 'note') as Entity, id: String(r?.id ?? ''), status: 'invalid', message: 'Geçersiz değişiklik.' });
        continue;
      }
      await c.query('SAVEPOINT ch');
      try {
        const out = raw.entity === 'note' ? await applyNote(c, userId, deviceId, raw)
          : raw.entity === 'folder' ? await applyFolder(c, userId, raw, now)
            : await applySettings(c, userId, { ...raw, id: userId });
        results.push(out.r);
        await c.query('RELEASE SAVEPOINT ch');
      } catch (e) {
        await c.query('ROLLBACK TO SAVEPOINT ch');
        results.push({ entity: raw.entity, id: raw.id, status: 'invalid', message: (e as Error).message.slice(0, 200) });
      }
    }
    return { results, seq: await currentSeq(c, userId) };
  });
}

/**
 * since'ten sonraki değişiklikleri döner. Aynı kayda ait birden çok satır tek satıra indirilir
 * ve kaydın güncel hâli eklenir.
 */
export async function pull(db: Db, userId: string, since: number, limit = PULL_LIMIT): Promise<PullResponse> {
  const lim = Math.min(Math.max(1, limit | 0), PULL_LIMIT);
  const { rows } = await db.query<{ seq: number; entity: Entity; entity_id: string; op: 'upsert' | 'delete'; version: number }>(
    'SELECT seq, entity, entity_id, op, version FROM change_log WHERE user_id=$1 AND seq > $2 ORDER BY seq LIMIT $3',
    [userId, since, lim + 1],
  );
  const hasMore = rows.length > lim;
  const page = rows.slice(0, lim);
  const lastSeq = page.length ? (page[page.length - 1] as { seq: number }).seq : since;
  const latest = new Map<string, (typeof page)[number]>();
  for (const r of page) latest.set(`${r.entity}:${r.entity_id}`, r);

  const ids = (e: Entity) => [...latest.values()].filter((r) => r.entity === e).map((r) => r.entity_id);
  const noteIds = ids('note');
  const folderIds = ids('folder');
  const notes = new Map<string, NoteRow>();
  const folders = new Map<string, FolderRow>();
  if (noteIds.length) {
    for (const n of (await db.query<NoteRow>('SELECT * FROM notes WHERE user_id=$1 AND id = ANY($2)', [userId, noteIds])).rows) notes.set(n.id, n);
  }
  if (folderIds.length) {
    for (const f of (await db.query<FolderRow>('SELECT * FROM folders WHERE user_id=$1 AND id = ANY($2)', [userId, folderIds])).rows) folders.set(f.id, f);
  }
  const settings = ids('settings').length ? await getSettings(db, userId) : null;

  const changes: ChangeOut[] = [];
  for (const r of [...latest.values()].sort((a, b) => a.seq - b.seq)) {
    const base = { seq: r.seq, entity: r.entity, id: r.entity_id };
    if (r.entity === 'note') {
      const n = notes.get(r.entity_id);
      if (!n || n.deleted_at) changes.push({ ...base, op: 'delete', version: n?.version ?? r.version });
      else changes.push({ ...base, op: 'upsert', version: n.version, data: toNote(n) });
    } else if (r.entity === 'folder') {
      const f = folders.get(r.entity_id);
      if (!f || f.deleted_at) changes.push({ ...base, op: 'delete', version: f?.version ?? r.version });
      else changes.push({ ...base, op: 'upsert', version: f.version, data: toFolder(f) });
    } else if (settings) {
      changes.push({ ...base, op: 'upsert', version: settings.version, data: settings.data });
    }
  }
  return { changes, seq: lastSeq, hasMore };
}
