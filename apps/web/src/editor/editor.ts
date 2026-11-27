/** contenteditable editörün olayları: kayıt, kontrol listesi işaretleme, yapıştırma, kısayollar. */
import { $ } from '../lib/dom.ts';
import { fLong } from '../lib/format.ts';
import { cur, withMeta } from '../state.ts';
import { saveNote } from '../store/repo.ts';
import { applyFmt, inCheck, initEditorCommands, insertPlain, refreshFmt, selLi, type Fmt } from './commands.ts';

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let pending: (() => Promise<void>) | null = null;

/** Bekleyen kaydı hemen yazar (not değiştirirken, sekme kapanırken). */
export async function flushSave(): Promise<void> {
  clearTimeout(saveTimer);
  const p = pending;
  pending = null;
  if (p) await p();
}

export function initEditor(onSaved: () => void): void {
  const ed = $('#ed');
  initEditorCommands();
  document.addEventListener('selectionchange', () => refreshFmt(ed));
  $('#fmt').addEventListener('mousedown', (e) => {
    if ((e.target as HTMLElement).closest('[data-f]')) e.preventDefault();
  });
  $('#fmt').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-f]');
    if (b) applyFmt(ed, b.dataset.f as Fmt);
  });

  ed.addEventListener('input', () => {
    const n = cur();
    if (!n || n.trashedAt) return;
    n.html = ed.innerHTML;
    n.updatedAt = Date.now();
    Object.assign(n, withMeta(n));
    $('#stamp').textContent = fLong.format(n.updatedAt);
    $('#wc').textContent = `${n.words} kelime`;
    clearTimeout(saveTimer);
    pending = async () => {
      await saveNote(n);
      onSaved();
    };
    saveTimer = setTimeout(() => void flushSave(), 300);
  });

  // Kontrol listesi: maddenin solundaki daireye tıklamak işaretler.
  ed.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest('ul.check>li');
    if (!li || ed.contentEditable !== 'true') return;
    if (e.clientX - li.getBoundingClientRect().left < 30) {
      li.classList.toggle('done');
      ed.dispatchEvent(new Event('input'));
    }
  });

  ed.addEventListener('keydown', (e) => {
    // İşaretli maddeden Enter ile açılan yeni madde işaretsiz başlar.
    if (e.key === 'Enter' && !e.shiftKey) {
      const li = inCheck(ed);
      if (li) setTimeout(() => {
        const n = selLi(ed);
        if (n && n !== li) n.classList.toggle('done', false);
      });
    }
  });

  ed.addEventListener('paste', (e) => {
    e.preventDefault();
    insertPlain(e.clipboardData?.getData('text/plain') ?? '');
  });

  addEventListener('pagehide', () => void flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
}
