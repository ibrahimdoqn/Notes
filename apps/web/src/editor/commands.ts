/**
 * Biçim komutları. Tüm biçimlendirme bu tek modülden geçer; tarayıcıların document.execCommand
 * desteği kalkarsa yalnızca bu dosya kendi DOM işlemleriyle değiştirilir.
 * Çıktı her kayıtta ortak sözleşmeye göre temizlenir (ör. <strike> → <s>).
 */
import { $$ } from '../lib/dom.ts';

export type Fmt = 'h' | 'bold' | 'italic' | 'underline' | 'strikeThrough' | 'check' | 'insertUnorderedList' | 'insertOrderedList';

const exec = (cmd: string, value?: string) => {
  try {
    return document.execCommand(cmd, false, value);
  } catch {
    return false;
  }
};

export function selLi(ed: HTMLElement): HTMLLIElement | null {
  const s = getSelection();
  if (!s || !s.rangeCount) return null;
  const n: Node | null = s.anchorNode;
  const el = n && (n.nodeType === 1 ? (n as Element) : n.parentElement);
  const li = el?.closest('li') ?? null;
  return li && ed.contains(li) ? (li as HTMLLIElement) : null;
}

export const inCheck = (ed: HTMLElement) => {
  const li = selLi(ed);
  return li && li.parentElement?.classList.contains('check') ? li : null;
};

export function initEditorCommands(): void {
  // Enter ile yeni paragraf <div> olsun (sözleşme <p> değil <div> bekler).
  exec('defaultParagraphSeparator', 'div');
  exec('styleWithCSS', 'false');
}

export function applyFmt(ed: HTMLElement, c: Fmt): void {
  if (ed.contentEditable !== 'true') return;
  ed.focus();
  if (c === 'h') {
    const v = String(document.queryCommandValue('formatBlock')).toLowerCase();
    exec('formatBlock', v === 'h2' ? 'div' : 'h2');
  } else if (c === 'check') {
    const li = selLi(ed);
    const ul = li?.parentElement;
    if (ul?.classList.contains('check')) exec('insertUnorderedList');
    else {
      if (!(ul && ul.tagName === 'UL')) exec('insertUnorderedList');
      selLi(ed)?.parentElement?.classList.add('check');
    }
  } else if (c === 'insertUnorderedList' && inCheck(ed)) {
    inCheck(ed)?.parentElement?.classList.toggle('check', false);
  } else exec(c);
  ed.dispatchEvent(new Event('input'));
  refreshFmt(ed);
}

export function refreshFmt(ed: HTMLElement): void {
  if (document.activeElement !== ed) return;
  const ck = !!inCheck(ed);
  for (const b of $$('[data-f]')) {
    const c = b.dataset.f as Fmt;
    let on = false;
    try {
      on = c === 'h' ? String(document.queryCommandValue('formatBlock')).toLowerCase() === 'h2'
        : c === 'check' ? ck
          : c === 'insertUnorderedList' ? !ck && document.queryCommandState(c)
            : document.queryCommandState(c);
    } catch {
      /* desteklenmiyor */
    }
    b.classList.toggle('on', on);
  }
}

/** İmleç konumuna HTML ekler (ekler için). */
export function insertHtml(html: string): void {
  exec('insertHTML', html);
}

/** Yapıştırmada yalnızca düz metin alınır (dış biçimler sözleşmeyi bozmasın). */
export function insertPlain(text: string): void {
  exec('insertText', text);
}
