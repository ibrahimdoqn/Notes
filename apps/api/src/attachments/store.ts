import { createHash } from 'node:crypto';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Attachment } from '@camnotlar/shared';
import type { Queryable } from '../db/pool.ts';

/**
 * Ek dosyaları diskte saklar: <dir>/<kimliğin ilk 2 karakteri>/<kimlik>.
 * Kimlik istemcide üretilen UUID'dir; dosya bir kez yazılır, değişmez.
 */
export class AttachmentStore {
  constructor(private dir: string) {}

  path(id: string): string {
    return join(this.dir, id.slice(0, 2), id);
  }

  async write(id: string, data: Buffer): Promise<string> {
    const p = this.path(id);
    await mkdir(join(this.dir, id.slice(0, 2)), { recursive: true });
    const tmp = `${p}.part`;
    await writeFile(tmp, data);
    await rename(tmp, p);
    return createHash('sha256').update(data).digest('hex');
  }

  async exists(id: string): Promise<boolean> {
    return stat(this.path(id)).then(() => true, () => false);
  }

  read(id: string): ReadStream {
    return createReadStream(this.path(id));
  }

  async remove(id: string): Promise<void> {
    await rm(this.path(id), { force: true });
  }
}

export interface AttachmentRow { id: string; user_id: string; name: string; mime: string; size_bytes: number; sha256: string; created_at: Date }

export const toAttachment = (r: AttachmentRow): Attachment => ({
  id: r.id, name: r.name, mime: r.mime, size: Number(r.size_bytes), sha256: r.sha256, createdAt: r.created_at.getTime(),
});

/** Hiçbir notta ya da not geçmişinde geçmeyen, bir günden eski ekler. */
export async function orphanAttachments(db: Queryable, userId?: string): Promise<{ id: string }[]> {
  const r = await db.query<{ id: string }>(
    `SELECT a.id FROM attachments a
      WHERE a.created_at < now() - interval '1 day' ${userId ? 'AND a.user_id = $1' : ''}
        AND NOT EXISTS (SELECT 1 FROM notes n WHERE n.user_id = a.user_id AND n.deleted_at IS NULL AND position(a.id::text IN n.html) > 0)
        AND NOT EXISTS (SELECT 1 FROM note_revisions r JOIN notes n ON n.id = r.note_id
                         WHERE n.user_id = a.user_id AND position(a.id::text IN r.html) > 0)`,
    userId ? [userId] : [],
  );
  return r.rows;
}
