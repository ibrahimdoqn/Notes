import type { FastifyInstance } from 'fastify';
import { isImageMime, isUuid, type Attachment } from '@camnotlar/shared';
import type { Ctx } from '../context.ts';
import { requireAuth } from '../auth/guard.ts';
import { toAttachment, type AttachmentRow } from '../attachments/store.ts';
import { ApiError, badRequest, notFound } from '../lib/errors.ts';

const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/i;

const cleanFileName = (raw: unknown): string => {
  let s = typeof raw === 'string' ? raw : '';
  try {
    s = decodeURIComponent(s);
  } catch {
    /* olduğu gibi kalsın */
  }
  // Yol ayırıcıları ve denetim karakterleri atılır.
  return s.replace(/[\\/\u0000-\u001f\u007f]/g, '_').trim().slice(0, 200) || 'dosya';
};

export default async function attachmentRoutes(app: FastifyInstance, ctx: Ctx) {
  const guard = requireAuth(ctx);
  const store = ctx.attachments;

  // Gövde ham dosyadır; her içerik türü Buffer olarak okunur (yalnızca bu eklenti kapsamında).
  app.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: ctx.cfg.maxAttachmentBytes }, (_req, body, done) => done(null, body));

  /**
   * Yükleme: PUT /v1/attachments/:id  (gövde = dosya, Content-Type = tür, X-File-Name = ad)
   * Kimlik istemcide üretilir; böylece çevrimdışı eklenen dosya nota hemen yazılır, sonra yüklenir.
   * Aynı kimlikle tekrar yükleme zararsızdır (kuyruk yeniden denemeleri için).
   */
  app.put('/v1/attachments/:id', { preHandler: guard, bodyLimit: ctx.cfg.maxAttachmentBytes }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw badRequest('Geçersiz ek kimliği.');
    const lid = id.toLowerCase();
    const existing = (await ctx.db.query<AttachmentRow>('SELECT * FROM attachments WHERE id=$1', [lid])).rows[0];
    if (existing) {
      if (existing.user_id !== req.auth.sub) throw new ApiError(409, 'conflict', 'Kimlik kullanımda.');
      return toAttachment(existing);
    }
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Dosya boş.');
    const ct = String(req.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    const mime = MIME_RE.test(ct) ? ct : 'application/octet-stream';
    const name = cleanFileName(req.headers['x-file-name']);
    const sha = await store.write(lid, body);
    const r = await ctx.db.query<AttachmentRow>(
      `INSERT INTO attachments(id, user_id, name, mime, size_bytes, sha256) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [lid, req.auth.sub, name, mime, body.length, sha],
    );
    if (!r.rows[0]) throw new ApiError(409, 'conflict', 'Kimlik kullanımda.');
    reply.code(201);
    return toAttachment(r.rows[0]);
  });

  app.get('/v1/attachments/:id/meta', { preHandler: guard }, async (req): Promise<Attachment> => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw notFound();
    const r = await ctx.db.query<AttachmentRow>('SELECT * FROM attachments WHERE id=$1 AND user_id=$2', [id.toLowerCase(), req.auth.sub]);
    if (!r.rows[0]) throw notFound('Ek bulunamadı.');
    return toAttachment(r.rows[0]);
  });

  /** İndirme: yalnızca sahibi. Resimler satır içi, diğerleri indirme olarak; içerik asla betik çalıştıramaz. */
  app.get('/v1/attachments/:id', { preHandler: guard }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!isUuid(id)) throw notFound();
    const r = await ctx.db.query<AttachmentRow>('SELECT * FROM attachments WHERE id=$1 AND user_id=$2', [id.toLowerCase(), req.auth.sub]);
    const a = r.rows[0];
    if (!a || !(await store.exists(a.id))) throw notFound('Ek bulunamadı.');
    const inline = isImageMime(a.mime);
    reply
      .header('content-type', inline ? a.mime : 'application/octet-stream')
      .header('content-length', String(a.size_bytes))
      .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(a.name)}`)
      .header('cache-control', 'private, max-age=31536000, immutable')
      .header('x-content-type-options', 'nosniff')
      .header('content-security-policy', "default-src 'none'; sandbox")
      .header('x-file-mime', a.mime);
    return reply.send(store.read(a.id));
  });
}
