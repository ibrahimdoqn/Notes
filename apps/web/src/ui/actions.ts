/** Kullanıcı eylemleri ve gezinme: yeni not, sabitle, taşı, sil, klasörler, kısayollar. */
import { isBlankHtml } from '@camnotlar/shared';
import { $, mq } from '../lib/dom.ts';
import { caretEnd } from '../editor/caret.ts';
import { flushSave } from '../editor/editor.ts';
import { cur, P, S, sortedFolders, ui, vname, type LocalNote } from '../state.ts';
import { deleteFolder, deleteNoteForever, makeFolder, newNote as createNote, saveFolder, saveNote, savePrefs } from '../store/repo.ts';
import { ask, toast } from './dialogs.ts';
import { isDark } from './prefs.ts';
import { render, renderEditor, renderSide } from './render.ts';
import { openHistory } from './history.ts';
import { openSettings } from './settings.ts';

const ed = () => $('#ed');

/** Boş bırakılan not, başka yere geçilince sessizce atılır. */
async function dropEmpty() {
  await flushSave();
  const n = cur();
  if (n && !n.trashedAt && isBlankHtml(n.html)) {
    ui.sel = null;
    await deleteNoteForever(n);
  }
}

async function ensureFolder(): Promise<string> {
  if (!S.folders.length) {
    const f = makeFolder('Notlar');
    await saveFolder(f);
  }
  const fs = sortedFolders();
  return (fs.some((x) => x.id === ui.view) ? ui.view : fs[0]?.id) as string;
}

export async function newNote(): Promise<void> {
  await dropEmpty();
  const fid = await ensureFolder();
  const n = createNote(fid, ui.view === 'pinned');
  if (ui.view === 'trash') ui.view = 'all';
  ui.q = '';
  ($('#q') as HTMLInputElement).value = '';
  ui.sel = n.id;
  ui.mob = 'note';
  render();
  renderEditor(true);
  ed().focus();
  caretEnd(ed());
}

async function after() {
  ui.sel = null;
  if (mq.matches) ui.mob = 'list';
  render();
}

const A: Record<string, () => void | Promise<void>> = {
  new: newNote,
  settings: openSettings,
  history: () => {
    const n = cur();
    if (n) openHistory(n);
  },
  async night() {
    const d = !isDark();
    await savePrefs({ ...P, mode: d ? 'dark' : 'light' });
    toast(d ? 'Gece modu açık' : 'Gece modu kapalı');
  },
  async pin() {
    const n = cur();
    if (!n) return;
    await flushSave();
    n.pinned = !n.pinned;
    await saveNote(n);
    render();
    toast(n.pinned ? 'Not sabitlendi' : 'Sabitleme kaldırıldı');
  },
  async move() {
    const n = cur();
    if (!n || !S.folders.length) return;
    const v = await ask({ t: 'Klasöre taşı', choices: sortedFolders().map((f) => ({ v: f.id, l: f.name, on: f.id === n.folderId })) });
    if (typeof v !== 'string') return;
    await flushSave();
    n.folderId = v;
    await saveNote(n);
    render();
    toast(`“${vname(v)}” klasörüne taşındı`);
  },
  copy() {
    const n = cur();
    if (!n) return;
    navigator.clipboard?.writeText(n.plain.replace(/\n{3,}/g, '\n\n').trim()).then(() => toast('Metin panoya kopyalandı'), () => toast('Kopyalanamadı'));
  },
  async del() {
    const n = cur();
    if (!n) return;
    await flushSave();
    if (n.trashedAt) {
      const r = await ask({ t: 'Kalıcı olarak silinsin mi?', m: `“${n.title}” geri alınamayacak şekilde silinecek.`, ok: 'Sil', danger: true });
      if (!r) return;
      await deleteNoteForever(n);
      await after();
      return;
    }
    n.trashedAt = Date.now();
    await saveNote(n);
    await after();
    toast('Son Silinenler’e taşındı', 'Geri Al', () => void restore(n, true));
  },
  restore: () => {
    const n = cur();
    if (n) void restore(n, false);
  },
};

async function restore(n: LocalNote, select: boolean) {
  n.trashedAt = null;
  if (!S.folders.some((f) => f.id === n.folderId)) n.folderId = await ensureFolder();
  await saveNote(n);
  if (select) ui.sel = n.id;
  render();
  renderEditor(true);
  if (!select) toast('Not geri alındı');
}

async function renameFolder(id: string) {
  const f = S.folders.find((x) => x.id === id);
  if (!f) return;
  const v = await ask({ t: 'Klasörü yeniden adlandır', input: f.name, ok: 'Kaydet' });
  if (typeof v === 'string' && v) {
    f.name = v.slice(0, 60);
    await saveFolder(f);
    render();
  }
}

async function removeFolder(id: string) {
  const f = S.folders.find((x) => x.id === id);
  if (!f) return;
  const k = S.notes.filter((n) => n.folderId === f.id && !n.trashedAt).length;
  const r = await ask({ t: `“${f.name}” silinsin mi?`, m: k ? `${k} not Son Silinenler’e taşınacak.` : 'Bu klasör boş.', ok: 'Klasörü Sil', danger: true });
  if (!r) return;
  await deleteFolder(f);
  if (ui.view === f.id) ui.view = 'all';
  render();
}

export function initActions(): void {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    let x: HTMLElement | null;
    if ((x = t.closest('[data-ren]'))) {
      e.stopPropagation();
      void renameFolder(x.dataset.ren as string);
      return;
    }
    if ((x = t.closest('[data-delf]'))) {
      void removeFolder(x.dataset.delf as string);
      return;
    }
    if ((x = t.closest('[data-act]')) && !x.closest('#set,#auth')) {
      void A[x.dataset.act as string]?.();
      return;
    }
    if ((x = t.closest('.row'))) {
      const v = x.dataset.v as string;
      void dropEmpty().then(() => {
        ui.view = v;
        ui.q = '';
        ($('#q') as HTMLInputElement).value = '';
        ui.mob = 'list';
        if (!mq.matches) ui.sel = null;
        render();
      });
      return;
    }
    if ((x = t.closest('.item'))) {
      const id = x.dataset.id as string;
      void (id !== ui.sel ? dropEmpty() : Promise.resolve()).then(() => {
        ui.sel = id;
        ui.mob = 'note';
        render();
      });
      return;
    }
    if ((x = t.closest('[data-go]'))) {
      const go = x.dataset.go as 'list' | 'folders';
      if (go === 'list') ed().blur();
      void (go === 'list' ? dropEmpty() : Promise.resolve()).then(() => {
        ui.mob = go;
        render();
      });
    }
  });

  document.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.matches?.('.row,.item')) {
      t.click();
      return;
    }
    if (e.key === 'Escape' && !$('#set').hidden && document.querySelectorAll('.scrim:not([hidden])').length === 1) {
      $('#set').hidden = true;
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === ',') {
      e.preventDefault();
      openSettings();
      return;
    }
    if (e.altKey && e.code === 'KeyN') {
      e.preventDefault();
      void newNote();
      return;
    }
    if (e.key === '/' && !t.isContentEditable && !/INPUT|TEXTAREA/.test(t.tagName)) {
      e.preventDefault();
      $('#q').focus();
    }
  });

  $('#q').addEventListener('input', (e) => {
    ui.q = (e.target as HTMLInputElement).value;
    render();
  });
  $('#newF').addEventListener('click', async () => {
    const v = await ask({ t: 'Yeni Klasör', m: 'Bu klasör için bir ad gir.', input: '', ok: 'Oluştur' });
    if (typeof v !== 'string' || !v) return;
    const f = makeFolder(v);
    await saveFolder(f);
    ui.view = f.id;
    ui.mob = 'list';
    ui.sel = null;
    render();
  });
  $('#editF').addEventListener('click', () => {
    ui.editF = !ui.editF;
    renderSide();
  });
  $('#tside').addEventListener('click', () => $('#app').classList.toggle('nos'));
  mq.addEventListener('change', render);
  const vv = window.visualViewport;
  if (vv) {
    const f = () => document.documentElement.style.setProperty('--vh', `${vv.height}px`);
    vv.addEventListener('resize', f);
    f();
  }
  if (!mq.matches && innerWidth < 1000) $('#app').classList.add('nos');
}
