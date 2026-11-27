import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthResponse } from '@camnotlar/shared';
import type { Ctx } from '../context.ts';
import { bearer, requireAuth, verifyAccess } from '../auth/guard.ts';
import * as auth from '../auth/service.ts';
import { notFound } from '../lib/errors.ts';
import { authResponse, loginBody } from './schemas.ts';

const COOKIE = 'cn_refresh';

export default async function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const guard = requireAuth(ctx);
  const cookieOpts = {
    httpOnly: true, secure: ctx.cfg.secureCookies, sameSite: 'strict' as const, path: '/v1/auth',
    maxAge: ctx.cfg.refreshTtlDays * 86400,
  };

  /** Web istemcisi yenileme belirtecini hiç görmez: HttpOnly çerezde taşınır. Android gövdede alır. */
  function send(req: FastifyRequest, reply: FastifyReply, out: { response: AuthResponse; refreshToken: string }, web: boolean) {
    if (web) {
      reply.setCookie(COOKIE, out.refreshToken, cookieOpts);
      return out.response;
    }
    return { ...out.response, refreshToken: out.refreshToken };
  }
  const isWeb = (body: Record<string, unknown>) => body.platform !== 'android';

  // Giriş/kayıt: IP + e-posta başına 15 dakikada 10 deneme.
  const limited = {
    config: {
      rateLimit: {
        max: 10, timeWindow: '15 minutes',
        keyGenerator: (req: FastifyRequest) => `${req.ip}:${String((req.body as { email?: string })?.email ?? '').toLowerCase()}`,
      },
    },
  };

  app.post('/v1/auth/register', { ...limited, schema: { body: loginBody, response: { 200: authResponse } } }, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    return send(req, reply, await auth.register(ctx, body), isWeb(body));
  });

  app.post('/v1/auth/login', { ...limited, schema: { body: loginBody, response: { 200: authResponse } } }, async (req, reply) => {
    const body = req.body as Record<string, unknown>;
    return send(req, reply, await auth.login(ctx, body), isWeb(body));
  });

  app.post('/v1/auth/refresh', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    schema: { body: { type: ['object', 'null'], properties: { refreshToken: { type: 'string' } } }, response: { 200: authResponse } },
  }, async (req, reply) => {
    const fromBody = (req.body as { refreshToken?: string } | null)?.refreshToken;
    const token = fromBody ?? req.cookies[COOKIE];
    try {
      return send(req, reply, await auth.refresh(ctx, token), !fromBody);
    } catch (e) {
      if (!fromBody) reply.clearCookie(COOKIE, { path: '/v1/auth' });
      throw e;
    }
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    try {
      const claims = await verifyAccess(ctx, bearer(req));
      await auth.logout(ctx.db, claims.sid);
    } catch {
      /* belirteç zaten geçersizse yine de çerezi temizle */
    }
    reply.clearCookie(COOKIE, { path: '/v1/auth' });
    return { ok: true };
  });

  app.post('/v1/auth/password', {
    preHandler: guard,
    schema: { body: { type: 'object', required: ['oldPassword', 'newPassword'], properties: { oldPassword: { type: 'string' }, newPassword: { type: 'string' } } } },
  }, async (req) => {
    const b = req.body as { oldPassword: string; newPassword: string };
    await auth.changePassword(ctx, req.auth.sub, req.auth.sid, b.oldPassword, b.newPassword);
    return { ok: true };
  });

  app.get('/v1/me', { preHandler: guard }, async (req) => {
    const r = await ctx.db.query(
      `SELECT u.*, (SELECT count(*)::int FROM notes n WHERE n.user_id=u.id AND n.deleted_at IS NULL) AS note_count,
              (SELECT coalesce(sum(length(html)),0)::bigint FROM notes n WHERE n.user_id=u.id AND n.deleted_at IS NULL) AS bytes
         FROM users u WHERE u.id=$1`, [req.auth.sub],
    );
    const row = r.rows[0];
    if (!row) throw notFound();
    return { user: auth.toUser(row), deviceId: req.auth.did, usage: { notes: row.note_count, bytes: Number(row.bytes) } };
  });

  app.get('/v1/devices', { preHandler: guard }, async (req) => ({ devices: await auth.listDevices(ctx.db, req.auth.sub, req.auth.did) }));

  app.delete('/v1/devices/:id', { preHandler: guard }, async (req) => {
    const { id } = req.params as { id: string };
    if (!(await auth.revokeDevice(ctx.db, req.auth.sub, id))) throw notFound('Cihaz bulunamadı.');
    ctx.hub.kick(req.auth.sub, id);
    return { ok: true };
  });

  app.post('/v1/invites', {
    preHandler: guard,
    schema: { body: { type: ['object', 'null'], properties: { email: { type: 'string' }, days: { type: 'integer', minimum: 1, maximum: 90 } } } },
  }, async (req, reply) => {
    if (!req.auth.adm) return reply.code(403).send({ error: { code: 'forbidden', message: 'Yalnızca yönetici davet oluşturabilir.' } });
    const b = (req.body ?? {}) as { email?: string; days?: number };
    const email = b.email ? auth.normEmail(b.email) : null;
    return { code: await auth.createInvite(ctx.db, email, req.auth.sub, b.days ?? 7) };
  });
}
