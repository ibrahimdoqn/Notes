/**
 * Yerel yazma katmanı: her değişiklik önce bellek içi duruma ve IndexedDB'ye yazılır,
 * eşitlenecekse "outbox" kuyruğuna eklenir. Arayüz hiçbir zaman sunucuyu beklemez.
 */
import {
  normalizePrefs, sanitizeNoteHtml, uuidv7, type ChangeIn, type ChangeOut, type Entity, type Folder, type Note, type Prefs,
} from '@camnotlar/shared';
import { S, P, setPrefsState, withMeta, type LocalNote } from '../state.ts';
import { db, getMeta, setMeta, type OutboxItem } from './db.ts';

type Listener = (why: 'local' | 'remote' | 'reload') => void;
const listeners = new Set<Listener>();
export const onChange = (fn: Listener) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const emit = (why: 'local' | 'remote' | 'reload') => listeners.forEach((l) => l(why));

/** Diğer sekmeler aynı IndexedDB'yi kullanır; değişiklikte yeniden yüklemeleri için haber verilir. */
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('camnotlar') : null;
const announce = () => bc?.postMessage({ type: 'changed' });
bc?.addEventListener('message', (e: MessageEvent<{ type: string }>) => {
  if (e.data?.type === 'changed') void loadAll().then(() => emit('reload'));
});

let rev = Date.now();
const stripNote = (n: LocalNote | Note): Note => ({
  id: n.id, folderId: n.folderId, html: n.html, title: n.title, snippet: n.snippet, pinned: n.pinned,
  createdAt: n.createdAt, updatedAt: n.updatedAt, trashedAt: n.trashedAt, version: n.version,
});

export async function loadAll(): Promise<void> {
  const [notes, folders, prefs] = await Promise.all([db.notes.toArray(), db.folders.toArray(), getMeta<unknown>('prefs', null)]);
  S.notes = notes.map(withMeta);
  S.folders = folders;
  setPrefsState(normalizePrefs(prefs ?? P));
}

/** Kuyruğa ekler ya da aynı kaydın bekleyen yazımıyla birleştirir. */
async function queue(entity: Entity, id: string, op: ChangeIn['op'], baseVersion: number, data?: ChangeIn['data']) {
  const key = `${entity}:${id}`;
  const prev = await db.outbox.get(key);
  if (op === 'delete' && baseVersion === 0 && (!prev || prev.baseVersion === 0)) {
    // Sunucuya hiç ulaşmamış kayıt: silmeyi göndermeye gerek yok.
    if (prev) await db.outbox.delete(key);
    return;
  }
  const item: OutboxItem = {
    key, entity, id, op, data, rev: ++rev, at: prev?.at ?? Date.now(),
    baseVersion: prev ? prev.baseVersion : baseVersion,
  };
  await db.outbox.put(item);
}

let syncHint: (() => void) | null = null;
/** Eşitleme motoru, kuyruk değişince haber almak için kaydolur. */
export const setSyncHint = (fn: () => void) => {
  syncHint = fn;
};
function done() {
  announce();
  emit('local');
  syncHint?.();
}

const noteData = (n: Note) => ({
  folderId: n.folderId, html: n.html, pinned: n.pinned, createdAt: n.createdAt, updatedAt: n.updatedAt, trashedAt: n.trashedAt,
});

export async function saveNote(n: LocalNote): Promise<void> {
  n.html = sanitizeNoteHtml(n.html);
  Object.assign(n, withMeta(n));
  await db.transaction('rw', db.notes, db.outbox, async () => {
    await db.notes.put(stripNote(n));
    await queue('note', n.id, 'upsert', n.version, noteData(n));
  });
  done();
}

export function newNote(folderId: string | null, pinned: boolean): LocalNote {
  const now = Date.now();
  const n = withMeta({
    id: uuidv7(now), folderId, html: '<div><br></div>', title: '', snippet: '', pinned, createdAt: now, updatedAt: now, trashedAt: null, version: 0,
  });
  S.notes.push(n);
  return n;
}

export async function deleteNoteForever(n: LocalNote): Promise<void> {
  S.notes = S.notes.filter((x) => x.id !== n.id);
  await db.transaction('rw', db.notes, db.outbox, async () => {
    await db.notes.delete(n.id);
    await queue('note', n.id, 'delete', n.version);
  });
  done();
}

export async function saveFolder(f: Folder): Promise<void> {
  f.updatedAt = Date.now();
  if (!S.folders.includes(f)) S.folders.push(f);
  await db.transaction('rw', db.folders, db.outbox, async () => {
    await db.folders.put({ ...f });
    await queue('folder', f.id, 'upsert', f.version, { name: f.name, sortOrder: f.sortOrder });
  });
  done();
}

export const makeFolder = (name: string): Folder => ({
  id: uuidv7(), name: name.slice(0, 60), sortOrder: S.folders.reduce((m, f) => Math.max(m, f.sortOrder), -1) + 1, version: 0, updatedAt: Date.now(),
});

/** Klasör silinir, içindeki etkin notlar Son Silinenler'e taşınır. */
export async function deleteFolder(f: Folder): Promise<void> {
  const now = Date.now();
  const moved = S.notes.filter((n) => n.folderId === f.id && n.trashedAt == null);
  moved.forEach((n) => (n.trashedAt = now));
  S.folders = S.folders.filter((x) => x.id !== f.id);
  await db.transaction('rw', db.notes, db.folders, db.outbox, async () => {
    for (const n of moved) {
      await db.notes.put(stripNote(n));
      await queue('note', n.id, 'upsert', n.version, noteData(n));
    }
    await db.folders.delete(f.id);
    await queue('folder', f.id, 'delete', f.version);
  });
  done();
}

export async function savePrefs(p: Prefs): Promise<void> {
  setPrefsState(p);
  const v = await getMeta<number>('prefsVersion', 0);
  await db.transaction('rw', db.meta, db.outbox, async () => {
    await setMeta('prefs', p);
    await queue('settings', 'me', 'upsert', v, p as unknown as Record<string, unknown>);
  });
  done();
}

/** Yedekten geri yükleme: mevcut notların yerini alır (sunucu modunda silmeler de eşitlenir). */
export async function replaceAll(data: { folders: Folder[]; notes: Note[] }): Promise<void> {
  const oldNotes = [...S.notes];
  const oldFolders = [...S.folders];
  await db.transaction('rw', db.notes, db.folders, db.outbox, async () => {
    for (const n of oldNotes) {
      await db.notes.delete(n.id);
      await queue('note', n.id, 'delete', n.version);
    }
    for (const f of oldFolders) {
      await db.folders.delete(f.id);
      await queue('folder', f.id, 'delete', f.version);
    }
    for (const f of data.folders) {
      await db.folders.put(f);
      await queue('folder', f.id, 'upsert', 0, { name: f.name, sortOrder: f.sortOrder });
    }
    for (const n of data.notes) {
      await db.notes.put(n);
      await queue('note', n.id, 'upsert', 0, noteData(n));
    }
  });
  S.folders = [...data.folders];
  S.notes = data.notes.map(withMeta);
  done();
}

/** Örnek notları ya da içe aktarılan verileri mevcutların yanına ekler. */
export async function addAll(data: { folders: Folder[]; notes: Note[] }): Promise<void> {
  await db.transaction('rw', db.notes, db.folders, db.outbox, async () => {
    for (const f of data.folders) {
      await db.folders.put(f);
      await queue('folder', f.id, 'upsert', 0, { name: f.name, sortOrder: f.sortOrder });
    }
    for (const n of data.notes) {
      await db.notes.put(n);
      await queue('note', n.id, 'upsert', 0, noteData(n));
    }
  });
  S.folders.push(...data.folders);
  S.notes.push(...data.notes.map(withMeta));
  done();
}

export const pendingCount = async () => (await db.outbox.count()) + (await db.blobs.where('uploaded').equals(0).count());

/** Çıkışta bu cihazdaki tüm yerel veriler silinir. */
export async function clearLocal(): Promise<void> {
  await db.transaction('rw', [db.notes, db.folders, db.outbox, db.meta, db.blobs], async () => {
    await Promise.all([db.notes.clear(), db.folders.clear(), db.outbox.clear(), db.meta.clear(), db.blobs.clear()]);
  });
  S.notes = [];
  S.folders = [];
  announce();
}

/* ---- eşitleme motorunun kullandığı alt düzey işlemler ---- */

export const outboxBatch = (limit: number) => db.outbox.orderBy('at').limit(limit).toArray();

/** Push sonucu: sürüm güncellenir, gönderilen yazım hâlâ en yenisiyse kuyruktan çıkar. */
export async function ackPushed(sent: OutboxItem, status: string, version?: number, serverNote?: Note): Promise<void> {
  await db.transaction('rw', db.notes, db.folders, db.outbox, db.meta, async () => {
    const now = await db.outbox.get(sent.key);
    if (status === 'gone') {
      // Kayıt başka cihazda kalıcı silinmiş.
      if (sent.entity === 'note') await db.notes.delete(sent.id);
      if (sent.entity === 'folder') await db.folders.delete(sent.id);
      await db.outbox.delete(sent.key);
      return;
    }
    if (status === 'invalid') {
      await db.outbox.delete(sent.key);
      return;
    }
    if (version != null) {
      if (sent.entity === 'note') {
        const n = await db.notes.get(sent.id);
        if (n) await db.notes.put({ ...n, version, ...(serverNote && now?.rev === sent.rev ? { folderId: serverNote.folderId } : {}) });
      } else if (sent.entity === 'folder') {
        const f = await db.folders.get(sent.id);
        if (f) await db.folders.put({ ...f, version });
      } else await setMeta('prefsVersion', version);
    }
    if (now && now.rev === sent.rev) await db.outbox.delete(sent.key);
    else if (now && version != null) await db.outbox.put({ ...now, baseVersion: version });
  });
  if (sent.entity === 'note') {
    const n = S.notes.find((x) => x.id === sent.id);
    if (status === 'gone') S.notes = S.notes.filter((x) => x.id !== sent.id);
    else if (n && version != null) {
      n.version = version;
      if (serverNote && serverNote.folderId !== n.folderId) n.folderId = serverNote.folderId;
    }
  } else if (sent.entity === 'folder') {
    const f = S.folders.find((x) => x.id === sent.id);
    if (status === 'gone') S.folders = S.folders.filter((x) => x.id !== sent.id);
    else if (f && version != null) f.version = version;
  }
}

/** Sunucudan gelen değişiklikleri uygular; kuyrukta bekleyen yerel yazımı olan kayıtlar atlanır. */
export async function applyRemote(changes: ChangeOut[], seq: number): Promise<string[]> {
  const touched: string[] = [];
  await db.transaction('rw', db.notes, db.folders, db.outbox, db.meta, async () => {
    for (const c of changes) {
      const key = `${c.entity === 'settings' ? 'settings' : c.entity}:${c.entity === 'settings' ? 'me' : c.id}`;
      if (await db.outbox.get(key)) continue;
      if (c.entity === 'note') {
        if (c.op === 'delete') await db.notes.delete(c.id);
        else await db.notes.put(stripNote(c.data as Note));
      } else if (c.entity === 'folder') {
        if (c.op === 'delete') await db.folders.delete(c.id);
        else await db.folders.put(c.data as Folder);
      } else {
        await setMeta('prefs', normalizePrefs(c.data));
        await setMeta('prefsVersion', c.version);
      }
      touched.push(c.id);
    }
    await setMeta('lastSeq', seq);
  });
  if (touched.length) {
    await loadAll();
    announce();
    emit('remote');
  }
  return touched;
}
