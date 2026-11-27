import type { Folder, Note } from '@camnotlar/shared';

export interface NoteRow {
  id: string; user_id: string; folder_id: string | null; html: string; title: string; snippet: string; plain_text: string;
  pinned: boolean; created_at: Date; updated_at: Date; trashed_at: Date | null; deleted_at: Date | null;
  version: number; last_device_id: string | null;
}
export interface FolderRow {
  id: string; user_id: string; name: string; sort_order: number; version: number; updated_at: Date; deleted_at: Date | null;
}

export const toNote = (r: NoteRow): Note => ({
  id: r.id,
  folderId: r.folder_id,
  html: r.html,
  title: r.title,
  snippet: r.snippet,
  pinned: r.pinned,
  createdAt: r.created_at.getTime(),
  updatedAt: r.updated_at.getTime(),
  trashedAt: r.trashed_at ? r.trashed_at.getTime() : null,
  version: r.version,
});

export const toFolder = (r: FolderRow): Folder => ({
  id: r.id, name: r.name, sortOrder: r.sort_order, version: r.version, updatedAt: r.updated_at.getTime(),
});
