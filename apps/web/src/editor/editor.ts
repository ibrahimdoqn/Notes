/** contenteditable editörün olayları: kayıt, kontrol listesi, yapıştırma, sürükle-bırak ve ekler. */
import { $ } from '../lib/dom.ts';
import { fLong } from '../lib/format.ts';
import { cur, withMeta } from '../state.ts';
import { saveNote } from '../store/repo.ts';
import { applyFmt, inCheck, initEditorCommands, insertHtml, insertPlain, refreshFmt, selLi, type Fmt } from './commands.ts';
import { DEFAULT_MAX, formatSize, hydrate, openAttachment, storeFiles } from '../lib/attachments.ts';
import { toast } from '../ui/dialogs.ts';
import { getMeta } from '../store/db.ts';

/** Dosyaları saklar ve imleç konumuna ekler. */
export async function addFiles(ed: HTMLElement, files: File[]): Promise<void> {
  if (!files.length || !cur() || ed.contentEditable !== 'true') return;
  const { html, rejected } = await storeFiles(files);
  if (rejected.length) toast(`${rejected.join(', ')}: en fazla ${formatSize(await getMeta('maxAttachmentBytes', DEFAULT_MAX))} olabilir`);
  if (!html) return;
  ed.focus();
  insertHtml(html);
  hydrate(ed);
  ed.dispatchEvent(new Event('input'));
}

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

  // Kontrol listesi: maddenin solundaki daireye tıklamak işaretler. Dosya rozeti indirilir.
  ed.addEventListener('click', (e) => {
    const file = (e.target as HTMLElement).closest<HTMLElement>('span.file[data-att]');
    if (file) {
      void openAttachment(file.dataset.att as string, file.textContent ?? 'dosya').catch((x: Error) => toast(x.message));
      return;
    }
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
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length) void addFiles(ed, files);
    else insertPlain(e.clipboardData?.getData('text/plain') ?? '');
  });
  ed.addEventListener('dragover', (e) => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  });
  ed.addEventListener('drop', (e) => {
    const files = [...(e.dataTransfer?.files ?? [])];
    if (!files.length) return;
    e.preventDefault();
    // Bırakılan noktaya imleç konur.
    const r = document.caretRangeFromPoint?.(e.clientX, e.clientY);
    if (r) {
      getSelection()?.removeAllRanges();
      getSelection()?.addRange(r);
    }
    void addFiles(ed, files);
  });
  $('#attB').addEventListener('mousedown', (e) => e.preventDefault());
  $('#attB').addEventListener('click', () => ($('#attIn') as HTMLInputElement).click());
  $('#attIn').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    void addFiles(ed, files);
  });

  addEventListener('pagehide', () => void flushSave());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushSave();
  });
}
