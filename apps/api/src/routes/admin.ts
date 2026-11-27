import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AdminUser } from '@camnotlar/shared';
import type { Ctx } from '../context.ts';
import { requireAuth } from '../auth/guard.ts';
import { checkPassword, hashPassword } from '../auth/password.ts';
import { cleanName, createUser, normUsername, toUser, type UserRow } from '../auth/service.ts';
import { tx } from '../db/pool.ts';
import { ApiError, forbidden, notFound } from '../lib/errors.ts';

const userInput = {
  type: 'object',
  properties: {
    username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 1024 },
    displayName: { type: 'string', maxLength: 60 }, isAdmin: { type: 'boolean' },
  },
} as const;

/**
 * Sunucu yönetimi (/yonetim sayfası bu uçları kullanır). Kayıtlar yalnızca buradan açılır.
 * Yönetici yetkisi belirteçteki işarete değil, her istekte veritabanına bakılarak doğrulanır.
 */
export default async function adminRoutes(app: FastifyInstance, ctx: Ctx) {
  const auth = requireAuth(ctx);
  const admin = async (req: FastifyRequest) => {
    const r = await ctx.db.query<{ is_admin: boolean }>('SELECT is_admin FROM users WHERE id=$1', [req.auth.sub]);
    if (!r.rows[0]?.is_admin) throw forbidden('Bu sayfa yalnızca sunucu yöneticileri içindir.');
  };
  const pre = [auth, admin];

  async function listUsers(): Promise<AdminUser[]> {
    const r = await ctx.db.query<UserRow & { notes: number; bytes: string; last_seen: Date | null; devices: number }>(
      `SELECT u.*,
              (SELECT count(*)::int FROM notes n WHERE n.user_id=u.id AND n.deleted_at IS NULL) AS notes,
              (SELECT coalesce(sum(size_bytes),0) FROM attachments a WHERE a.user_id=u.id) AS bytes,
              (SELECT max(last_seen_at) FROM devices d WHERE d.user_id=u.id) AS last_seen,
              (SELECT count(DISTINCT s.device_id)::int FROM sessions s WHERE s.user_id=u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS devices
         FROM users u ORDER BY u.is_admin DESC, u.username`,
    );
    return r.rows.map((x) => ({
      ...toUser(x), notes: x.notes, attachmentBytes: Number(x.bytes), lastSeenAt: x.last_seen ? x.last_seen.getTime() : null, devices: x.devices,
    }));
  }

  async function adminCount(except?: string): Promise<number> {
    const r = await ctx.db.query<{ n: number }>('SELECT count(*)::int AS n FROM users WHERE is_admin AND id <> coalesce($1::uuid, \'00000000-0000-0000-0000-000000000000\')', [except ?? null]);
    return r.rows[0]?.n ?? 0;
  }

  app.get('/v1/admin/users', { preHandler: pre }, async () => ({ users: await listUsers() }));

  app.post('/v1/admin/users', { preHandler: pre, schema: { body: { ...userInput, required: ['username', 'password'] } } }, async (req, reply) => {
    const b = req.body as { username: string; password: string; displayName?: string; isAdmin?: boolean };
    const u = await createUser(ctx.db, b.username, b.password, { displayName: b.displayName, isAdmin: !!b.isAdmin, hibp: ctx.cfg.hibpCheck });
    reply.code(201);
    return u;
  });

  app.patch('/v1/admin/users/:id', { preHandler: pre, schema: { body: userInput } }, async (req) => {
    const { id } = req.params as { id: string };
    const b = req.body as { username?: string; password?: string; displayName?: string; isAdmin?: boolean };
    return tx(ctx.db, async (c) => {
      const cur = (await c.query<UserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw notFound('Kullanıcı bulunamadı.');
      if (b.isAdmin === false && cur.is_admin && (await adminCount(id)) === 0) {
        throw new ApiError(409, 'last_admin', 'Sunucuda en az bir yönetici kalmalı.');
      }
      if (b.username != null) {
        try {
          await c.query('UPDATE users SET username=$2 WHERE id=$1', [id, normUsername(b.username)]);
        } catch (e) {
          if ((e as { code?: string }).code === '23505') throw new ApiError(409, 'username_taken', 'Bu kullanıcı adı zaten alınmış.');
          throw e;
        }
      }
      if (b.displayName != null) await c.query('UPDATE users SET display_name=$2 WHERE id=$1', [id, cleanName(b.displayName, cur.username)]);
      if (b.isAdmin != null) await c.query('UPDATE users SET is_admin=$2 WHERE id=$1', [id, b.isAdmin]);
      if (b.password != null) {
        await checkPassword(b.password, ctx.cfg.hibpCheck);
        await c.query('UPDATE users SET password_hash=$2 WHERE id=$1', [id, await hashPassword(b.password)]);
        // Parola sıfırlanınca o kullanıcının tüm cihazlarından çıkış yapılır.
        await c.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
      }
      return toUser((await c.query<UserRow>('SELECT * FROM users WHERE id=$1', [id])).rows[0] as UserRow);
    });
  });

  app.delete('/v1/admin/users/:id', { preHandler: pre }, async (req) => {
    const { id } = req.params as { id: string };
    if (id === req.auth.sub) throw new ApiError(409, 'conflict', 'Kendi hesabını silemezsin.');
    const files = await tx(ctx.db, async (c) => {
      const cur = (await c.query<UserRow>('SELECT * FROM users WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!cur) throw notFound('Kullanıcı bulunamadı.');
      if (cur.is_admin && (await adminCount(id)) === 0) throw new ApiError(409, 'last_admin', 'Sunucuda en az bir yönetici kalmalı.');
      const a = await c.query<{ id: string }>('SELECT id FROM attachments WHERE user_id=$1', [id]);
      await c.query('DELETE FROM users WHERE id=$1', [id]);
      return a.rows.map((x) => x.id);
    });
    for (const f of files) await ctx.attachments.remove(f);
    return { ok: true, removedFiles: files.length };
  });
}
