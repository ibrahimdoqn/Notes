import { sanitizeNoteHtml, uuidv7, type Folder, type Note } from '@camnotlar/shared';

/** Prototipin localStorage biçimi (camnotlar.v1) ve eski yedek dosyaları. */
interface LegacyData {
  folders: { id: unknown; name?: unknown }[];
  notes: { id: unknown; f?: unknown; pin?: unknown; up?: unknown; cr?: unknown; html?: unknown; del?: unknown }[];
}
const LS_KEY = 'camnotlar.v1';
const LS_PREFS = 'camnotlar.ayar';

export function isLegacy(d: unknown): d is LegacyData {
  const x = d as LegacyData;
  return !!x && Array.isArray(x.notes) && Array.isArray(x.folders) && (x.notes.length === 0 || 'html' in (x.notes[0] ?? {})) &&
    !(x.notes[0] && 'folderId' in x.notes[0]);
}

/** Eski kimlikler UUIDv7'ye çevrilir; klasör bağları korunur. */
export function convertLegacy(d: LegacyData): { folders: Folder[]; notes: Note[] } {
  const now = Date.now();
  const map = new Map<string, string>();
  const folders = d.folders.filter((f) => f && f.id != null).map((f, i): Folder => {
    const id = uuidv7();
    map.set(String(f.id), id);
    return { id, name: String(f.name ?? 'Klasör').slice(0, 60), sortOrder: i, version: 0, updatedAt: now };
  });
  const notes = d.notes.filter((n) => n && n.id != null).map((n): Note => {
    const up = Number(n.up) || now;
    return {
      id: uuidv7(), folderId: map.get(String(n.f)) ?? folders[0]?.id ?? null, html: sanitizeNoteHtml(String(n.html ?? '')),
      title: '', snippet: '', pinned: !!n.pin, createdAt: Number(n.cr) || up, updatedAt: up,
      trashedAt: Number(n.del) || null, version: 0,
    };
  });
  return { folders, notes };
}

export function readLegacyLocalStorage(): { data: { folders: Folder[]; notes: Note[] }; prefs: unknown } | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as unknown;
    if (!isLegacy(d)) return null;
    let prefs: unknown = null;
    try {
      prefs = JSON.parse(localStorage.getItem(LS_PREFS) ?? 'null');
    } catch {
      /* yok say */
    }
    return { data: convertLegacy(d), prefs };
  } catch {
    return null;
  }
}

export function clearLegacy() {
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_PREFS);
  } catch {
    /* yok say */
  }
}
