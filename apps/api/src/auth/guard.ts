import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Ctx } from '../context.ts';
import { unauthorized } from '../lib/errors.ts';
import { sessionActive } from './service.ts';
import type { AccessClaims } from './tokens.ts';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AccessClaims;
  }
}

export function bearer(req: FastifyRequest): string | undefined {
  const h = req.headers.authorization;
  return h?.startsWith('Bearer ') ? h.slice(7).trim() : undefined;
}

/** Erişim belirtecini doğrular; oturum uzaktan kapatıldıysa belirteç süresi dolmadan da reddedilir. */
export async function verifyAccess(ctx: Ctx, token: string | undefined): Promise<AccessClaims> {
  if (!token) throw unauthorized();
  let claims: AccessClaims;
  try {
    claims = await ctx.signer.verify(token);
  } catch {
    throw unauthorized('Oturum belirteci geçersiz ya da süresi dolmuş.');
  }
  if (!(await sessionActive(ctx.db, claims.sid))) throw unauthorized('Bu cihazın oturumu kapatılmış.');
  return claims;
}

export const requireAuth = (ctx: Ctx) => async (req: FastifyRequest, _reply: FastifyReply) => {
  req.auth = await verifyAccess(ctx, bearer(req));
};
