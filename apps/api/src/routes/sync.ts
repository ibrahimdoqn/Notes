import type { FastifyInstance } from 'fastify';
import { PULL_LIMIT, PUSH_LIMIT } from '@camnotlar/shared';
import type { Ctx } from '../context.ts';
import { requireAuth, verifyAccess } from '../auth/guard.ts';
import * as sync from '../sync/service.ts';
import { changeSchema } from './schemas.ts';

export default async function syncRoutes(app: FastifyInstance, ctx: Ctx) {
  const guard = requireAuth(ctx);

  app.post('/v1/sync/push', {
    preHandler: guard,
    bodyLimit: 25 * 1024 * 1024,
    schema: {
      body: { type: 'object', required: ['changes'], properties: { changes: { type: 'array', maxItems: PUSH_LIMIT, items: changeSchema } } },
    },
  }, async (req) => {
    const { changes } = req.body as { changes: unknown[] };
    const res = await sync.push(ctx.db, req.auth.sub, req.auth.did, changes);
    if (res.results.some((r) => r.status === 'ok' || r.status === 'conflict')) ctx.hub.publish(req.auth.sub, res.seq, req.auth.did);
    await ctx.db.query('UPDATE devices SET last_seen_at=now() WHERE id=$1', [req.auth.did]);
    return res;
  });

  app.get('/v1/sync/pull', {
    preHandler: guard,
    schema: {
      querystring: {
        type: 'object',
        properties: { since: { type: 'integer', minimum: 0, default: 0 }, limit: { type: 'integer', minimum: 1, maximum: PULL_LIMIT } },
      },
    },
  }, async (req) => {
    const q = req.query as { since: number; limit?: number };
    return sync.pull(ctx.db, req.auth.sub, q.since, q.limit);
  });

  /**
   * WebSocket: tarayıcı başlık gönderemediği için erişim belirteci ilk mesajla gelir:
   *   {"type":"auth","token":"..."}  →  {"type":"ready"}
   * Sonrasında sunucu "changed" ve "logout" sinyalleri gönderir.
   */
  app.get('/v1/ws', { websocket: true }, (socket) => {
    let off: (() => void) | undefined;
    const timer = setTimeout(() => socket.close(4401, 'auth timeout'), 10_000);
    const ping = setInterval(() => socket.ping(), 30_000);
    socket.on('message', async (raw: Buffer) => {
      if (off) return;
      try {
        const msg = JSON.parse(raw.toString()) as { type?: string; token?: string };
        if (msg.type !== 'auth') return;
        const claims = await verifyAccess(ctx, msg.token);
        clearTimeout(timer);
        off = ctx.hub.subscribe(claims.sub, { deviceId: claims.did, send: (m) => socket.send(m) });
        socket.send(JSON.stringify({ type: 'ready' }));
      } catch {
        socket.close(4401, 'unauthorized');
      }
    });
    socket.on('close', () => {
      clearTimeout(timer);
      clearInterval(ping);
      off?.();
    });
  });
}
