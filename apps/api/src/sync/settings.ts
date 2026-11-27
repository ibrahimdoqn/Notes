import { normalizePrefs, type ChangeIn, type PushResult, type SettingsData } from '@camnotlar/shared';
import type { Queryable, Tx } from '../db/pool.ts';
import { logChange } from './log.ts';

export async function getSettings(db: Queryable, userId: string): Promise<{ data: SettingsData; version: number }> {
  const r = await db.query<{ data: SettingsData; version: number }>('SELECT data, version FROM user_settings WHERE user_id=$1', [userId]);
  return r.rows[0] ? { data: normalizePrefs(r.rows[0].data) as unknown as SettingsData, version: r.rows[0].version } : {
    data: normalizePrefs({}) as unknown as SettingsData, version: 0,
  };
}

/** Ayarlar tek belge; kimliği kullanıcı kimliğiyle aynıdır. Son yazan kazanır. */
export async function applySettings(c: Tx, userId: string, ch: ChangeIn): Promise<{ r: PushResult; seq: number }> {
  const data = normalizePrefs(ch.data);
  const cur = (await c.query<{ version: number }>('SELECT version FROM user_settings WHERE user_id=$1 FOR UPDATE', [userId])).rows[0];
  const status = cur && ch.baseVersion !== cur.version ? 'conflict' : 'ok';
  const { rows } = await c.query<{ version: number }>(
    `INSERT INTO user_settings(user_id, data) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET data=EXCLUDED.data, version=user_settings.version+1, updated_at=now()
     RETURNING version`,
    [userId, JSON.stringify(data)],
  );
  const version = (rows[0] as { version: number }).version;
  const seq = await logChange(c, userId, 'settings', userId, version, 'upsert');
  return { r: { entity: 'settings', id: userId, status, version }, seq };
}
