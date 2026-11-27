import type { FastifyInstance } from 'fastify';
import type { Revision } from '@camnotlar/shared';
import type { Ctx } from '../context.ts';
import { requireAuth } from '../auth/guard.ts';
import { notFound } from '../lib/errors.ts';
import { toFolder, toNote, type FolderRow, type NoteRow } from '../sync/mappers.ts';
import { getSettings } from '../sync/settings.ts';
import { noteSchema } from './schemas.ts';

const decodeCursor = (c: string | undefined): [number, string] | null => {
  if (!c) return null;
  try {
    const [t, id] = JSON.parse(Buffer.from(c, 'base64url').toString()) as [number, string];
    return typeof t === 'number' && typeof id === 'string' ? [t, id] : null;
  } catch {
    return null;
  }
};
const encodeCursor = (t: number, id: string) => Buffer.from(JSON.stringify([t, id])).toString('base64url');
const likeEscape = (s: string) => s.replace(/[%_\\]/g, (c) => '\\' + c);

export default async function noteRoutes(app: FastifyInstance, ctx: Ctx) {
  const guard = requireAuth(ctx);

  app.get('/v1/folders', { preHandler: guard }, async (req) => {
    const r = await ctx.db.query<FolderRow>('SELECT * FROM folders WHERE user_id=$1 AND deleted_at IS NULL ORDER BY sort_order, name', [req.auth.sub]);
    return { folders: r.rows.map(toFolder) };
  });

  /** Eşitleme dışı erişim (entegrasyonlar için): güncellenme tarihine göre imleçli sayfalama. */
  app.get('/v1/notes', {
    preHandler: guard,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          cursor: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
          folderId: { type: 'string' }, trashed: { type: 'boolean', default: false },
        },
      },
    },
  }, async (req) => {
    const q = req.query as { cursor?: string; limit: number; folderId?: string; trashed: boolean };
    const cur = decodeCursor(q.cursor);
    const params: unknown[] = [req.auth.sub, q.trashed, q.limit + 1];
    let where = 'user_id=$1 AND deleted_at IS NULL AND (trashed_at IS NOT NULL) = $2';
    if (q.folderId) {
      params.push(q.folderId);
      where += ` AND folder_id=$${params.length}`;
    }
    if (cur) {
      params.push(new Date(cur[0]), cur[1]);
      where += ` AND (updated_at, id) < ($${params.length - 1}, $${params.length})`;
    }
    const r = await ctx.db.query<NoteRow>(`SELECT * FROM notes WHERE ${where} ORDER BY updated_at DESC, id DESC LIMIT $3`, params);
    const rows = r.rows.slice(0, q.limit);
    const last = rows[rows.length - 1];
    return {
      notes: rows.map(toNote),
      cursor: r.rows.length > q.limit && last ? encodeCursor(last.updated_at.getTime(), last.id) : null,
    };
  });

  app.get('/v1/notes/:id', { preHandler: guard, schema: { response: { 200: noteSchema } } }, async (req) => {
    const { id } = req.params as { id: string };
    const r = await ctx.db.query<NoteRow>('SELECT * FROM notes WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [id, req.auth.sub]);
    if (!r.rows[0]) throw notFound('Not bulunamadı.');
    return toNote(r.rows[0]);
  });

  app.get('/v1/notes/:id/revisions', { preHandler: guard }, async (req) => {
    const { id } = req.params as { id: string };
    const own = await ctx.db.query('SELECT 1 FROM notes WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL', [id, req.auth.sub]);
    if (!own.rowCount) throw notFound('Not bulunamadı.');
    const r = await ctx.db.query<{ id: string; note_id: string; version: number; html: string; title: string; name: string | null; created_at: Date }>(
      `SELECT r.id, r.note_id, r.version, r.html, r.title, d.name, r.created_at FROM note_revisions r
         LEFT JOIN devices d ON d.id = r.device_id WHERE r.note_id=$1 ORDER BY r.version DESC, r.created_at DESC`, [id],
    );
    const revisions: Revision[] = r.rows.map((x) => ({
      id: x.id, noteId: x.note_id, version: x.version, html: x.html, title: x.title, deviceName: x.name, createdAt: x.created_at.getTime(),
    }));
    return { revisions };
  });

  /** Sunucu taraflı tam metin arama (Türkçe sözlük) + başlıkta kısmi eşleşme. */
  app.get('/v1/search', {
    preHandler: guard,
    schema: {
      querystring: {
        type: 'object', required: ['q'],
        properties: { q: { type: 'string', minLength: 1, maxLength: 200 }, limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 } },
      },
    },
  }, async (req) => {
    const { q, limit } = req.query as { q: string; limit: number };
    const r = await ctx.db.query<NoteRow & { rank: number }>(
      `SELECT *, ts_rank(to_tsvector('turkish', title || ' ' || plain_text), websearch_to_tsquery('turkish', $2)) AS rank
         FROM notes WHERE user_id=$1 AND deleted_at IS NULL AND trashed_at IS NULL
          AND (to_tsvector('turkish', title || ' ' || plain_text) @@ websearch_to_tsquery('turkish', $2)
               OR title ILIKE '%' || $3 || '%')
        ORDER BY rank DESC, updated_at DESC LIMIT $4`,
      [req.auth.sub, q, likeEscape(q), limit],
    );
    return { notes: r.rows.map(toNote) };
  });

  app.get('/v1/settings', { preHandler: guard }, async (req) => getSettings(ctx.db, req.auth.sub));

  /** Tüm verinin JSON yedeği (web'deki "yedekten geri yükle" ile uyumlu biçim). */
  app.get('/v1/export', { preHandler: guard }, async (req, reply) => {
    const [f, n, s] = await Promise.all([
      ctx.db.query<FolderRow>('SELECT * FROM folders WHERE user_id=$1 AND deleted_at IS NULL ORDER BY sort_order, name', [req.auth.sub]),
      ctx.db.query<NoteRow>('SELECT * FROM notes WHERE user_id=$1 AND deleted_at IS NULL ORDER BY updated_at DESC', [req.auth.sub]),
      getSettings(ctx.db, req.auth.sub),
    ]);
    const day = new Date().toISOString().slice(0, 10);
    reply.header('content-disposition', `attachment; filename="camnotlar-${day}.json"`);
    return { app: 'cam-notlar', v: 2, exportedAt: Date.now(), folders: f.rows.map(toFolder), notes: n.rows.map(toNote), settings: s.data };
  });
}
