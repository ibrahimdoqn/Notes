/**
 * Uygulamanın bellek içi durumu. Arayüz her zaman buradan çizilir;
 * kalıcılık store/repo.ts, sunucu eşitlemesi sync/engine.ts üzerinden olur.
 */
import { DEFAULT_PREFS, noteMeta, type Folder, type Note, type Prefs } from '@camnotlar/shared';

export interface LocalNote extends Note {
  plain: string;
  words: number;
}

export type View = 'all' | 'pinned' | 'trash' | string;
export type MobScreen = 'folders' | 'list' | 'note';

export interface Session {
  mode: 'server' | 'local';
  userId?: string;
  email?: string;
  deviceId?: string;
}

export const S = {
  folders: [] as Folder[],
  notes: [] as LocalNote[],
};

export const ui = {
  view: 'all' as View,
  sel: null as string | null,
  q: '',
  mob: 'list' as MobScreen,
  editF: false,
  loaded: null as string | null,
  /** Uzaktan gelen ve açık editöre yansıtılacak içerik. */
  remoteHtml: null as string | null,
};

export let P: Prefs = { ...DEFAULT_PREFS };
export const setPrefsState = (p: Prefs) => {
  P = p;
};

export let session: Session | null = null;
export const setSession = (s: Session | null) => {
  session = s;
};

export function withMeta(n: Note): LocalNote {
  const m = noteMeta(n.html);
  return { ...n, title: m.title, snippet: m.snippet, plain: m.plain, words: m.words };
}

export const sortedFolders = () => [...S.folders].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr'));
export const cur = () => S.notes.find((n) => n.id === ui.sel);
export const dkey = (): 'createdAt' | 'updatedAt' => (P.sort === 'cr' ? 'createdAt' : 'updatedAt');

export function inView(n: LocalNote, v: View = ui.view): boolean {
  if (v === 'trash') return n.trashedAt != null;
  if (n.trashedAt != null) return false;
  return v === 'all' || (v === 'pinned' ? n.pinned : n.folderId === v);
}
export const count = (v: View) => S.notes.filter((n) => inView(n, v)).length;
export const vname = (v: View = ui.view) =>
  v === 'all' ? 'Tüm Notlar' : v === 'pinned' ? 'Sabitlenmiş' : v === 'trash' ? 'Son Silinenler'
    : S.folders.find((f) => f.id === v)?.name ?? 'Notlar';

export function visible(): LocalNote[] {
  const q = ui.q.trim().toLocaleLowerCase('tr');
  const k = dkey();
  return S.notes
    .filter((n) => inView(n))
    .filter((n) => !q || n.plain.toLocaleLowerCase('tr').includes(q))
    .sort(P.sort === 'ttl' ? (a, b) => a.title.localeCompare(b.title, 'tr') : (a, b) => b[k] - a[k]);
}
