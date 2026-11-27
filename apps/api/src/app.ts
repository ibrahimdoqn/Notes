import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import { API_VERSION, type ServerInfo } from '@camnotlar/shared';
import type { Ctx } from './context.ts';
import { requireAuth } from './auth/guard.ts';
import { ApiError } from './lib/errors.ts';
import { tx } from './db/pool.ts';
import { applySettings } from './sync/settings.ts';
import authRoutes from './routes/auth.ts';
import noteRoutes from './routes/notes.ts';
import syncRoutes from './routes/sync.ts';

export async function buildApp(ctx: Ctx, opts: { logger?: boolean | object } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: ctx.cfg.logLevel },
    trustProxy: true,
    bodyLimit: 5 * 1024 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: true } },
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false, hook: 'preHandler' });
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Cam Notlar API', version: `${API_VERSION}.0.0` },
      components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
      security: [{ bearer: [] }],
    },
  });
  await app.register(swaggerUi, { routePrefix: '/v1/docs' });

  // Tek biçimli hata yanıtı.
  app.setErrorHandler((err: FastifyError | ApiError, req, reply) => {
    if (err instanceof ApiError) return reply.code(err.status).send({ error: { code: err.code, message: err.message } });
    const fe = err as FastifyError;
    if (fe.validation) return reply.code(400).send({ error: { code: 'bad_request', message: fe.message } });
    if (fe.statusCode === 429) return reply.code(429).send({ error: { code: 'rate_limited', message: 'Çok fazla deneme; biraz sonra tekrar dene.' } });
    if (fe.statusCode && fe.statusCode < 500) return reply.code(fe.statusCode).send({ error: { code: 'bad_request', message: fe.message } });
    req.log.error(err);
    return reply.code(500).send({ error: { code: 'internal', message: 'Sunucuda beklenmeyen bir hata oluştu.' } });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'not_found', message: 'Uç nokta bulunamadı.' } }));

  // Her yanıtta API sürümü: istemci eski/yeni sunucuyu tanıyıp uyarabilir.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('x-camnotlar-api', String(API_VERSION));
  });

  app.get('/healthz', { schema: { hide: true } }, async () => ({ ok: true }));
  app.get('/readyz', { schema: { hide: true } }, async (_req, reply) => {
    try {
      await ctx.db.query('SELECT 1');
      return { ok: true };
    } catch {
      return reply.code(503).send({ ok: false });
    }
  });
  app.get('/v1/info', async (): Promise<ServerInfo> => ({ name: 'camnotlar', apiVersion: API_VERSION, allowSignup: ctx.cfg.allowSignup }));

  app.put('/v1/settings', { preHandler: requireAuth(ctx), schema: { body: { type: 'object', additionalProperties: true } } }, async (req) => {
    const out = await tx(ctx.db, (c) => applySettings(c, req.auth.sub, {
      entity: 'settings', id: req.auth.sub, op: 'upsert', baseVersion: -1, data: req.body as Record<string, unknown>,
    }));
    ctx.hub.publish(req.auth.sub, out.seq, req.auth.did);
    return { version: out.r.version };
  });

  await app.register(async (s) => authRoutes(s, ctx));
  await app.register(async (s) => syncRoutes(s, ctx));
  await app.register(async (s) => noteRoutes(s, ctx));
  return app;
}
