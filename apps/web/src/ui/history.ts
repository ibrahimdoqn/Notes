/** Not geçmişi paneli: sürüm listesi, önceki sürüme göre farklar ve geri yükleme. */
import { htmlToPlain, sanitizeNoteHtml, type Revision } from '@camnotlar/shared';
import { api } from '../api/client.ts';
import { diffHtml, wordDiff } from '../lib/diff.ts';
import { esc } from '../lib/dom.ts';
import { fLong } from '../lib/format.ts';
import { ui, type LocalNote } from '../state.ts';
import { saveNote } from '../store/repo.ts';
import { flushSave } from '../editor/editor.ts';
import { hydrate } from '../lib/attachments.ts';
import { toast } from './dialogs.ts';
import { render, renderEditor } from './render.ts';

export async function openHistory(n: LocalNote): Promise<void> {
  await flushSave();
  const w = document.createElement('div');
  w.className = 'scrim';
  w.innerHTML = `<div class="sheet hist" role="dialog" aria-modal="true" aria-labelledby="hT">
   <header class="sh"><h2 id="hT">Not geçmişi</h2><button class="txtbtn strong" data-x>Kapat</button></header>
   <div class="hbody"><div class="hlist"><p class="hint">Yükleniyor…</p></div><div class="hprev"></div></div>
   <footer class="hfoot"><label class="srow"><span>Farkları göster</span><input type="checkbox" class="sw" data-diff checked></label><span class="sp"></span><button type="button" class="ok" data-restore disabled>Bu sürümü geri yükle</button></footer>
  </div>`;
  document.body.append(w);
  const close = () => {
    w.classList.add('out');
    setTimeout(() => w.remove(), 180);
  };
  w.addEventListener('click', (e) => {
    if (e.target === w || (e.target as HTMLElement).closest('[data-x]')) close();
  });
  w.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  const list = w.querySelector('.hlist') as HTMLElement;
  const prev = w.querySelector('.hprev') as HTMLElement;
  const restoreB = w.querySelector('[data-restore]') as HTMLButtonElement;
  const diffT = w.querySelector('[data-diff]') as HTMLInputElement;

  let revs: Revision[] = [];
  let sel = 0;
  try {
    revs = (await api<{ revisions: Revision[] }>(`/notes/${n.id}/revisions`)).revisions;
  } catch (e) {
    list.innerHTML = `<p class="hint">${esc((e as Error).message)}</p>`;
    return;
  }
  if (!revs.length) {
    list.innerHTML = '<p class="hint">Bu not için kayıtlı sürüm yok.</p>';
    return;
  }

  const show = () => {
    list.innerHTML = revs.map((r, i) =>
      `<button type="button" class="hitem${i === sel ? ' on' : ''}" data-i="${i}"><b>${i === 0 ? 'Güncel sürüm' : `Sürüm ${r.version}`}</b><small>${esc(fLong.format(r.createdAt))}${r.deviceName ? ` · ${esc(r.deviceName)}` : ''}</small></button>`).join('');
    const r = revs[sel] as Revision;
    const older = revs[sel + 1];
    if (diffT.checked && older) {
      prev.innerHTML = `<p class="hlegend"><span><ins>eklenen</ins></span><span><del>silinen</del></span><span>önceki sürüme göre</span></p><div class="ed">${diffHtml(wordDiff(htmlToPlain(older.html), htmlToPlain(r.html)))}</div>`;
    } else {
      prev.innerHTML = `<div class="ed">${sanitizeNoteHtml(r.html)}</div>`;
      hydrate(prev);
    }
    restoreB.disabled = sel === 0 || r.html === n.html;
  };
  list.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
    if (!b) return;
    sel = Number(b.dataset.i);
    show();
  });
  diffT.addEventListener('change', show);
  restoreB.addEventListener('click', async () => {
    const r = revs[sel];
    if (!r) return;
    n.html = r.html;
    n.updatedAt = Date.now();
    await saveNote(n);
    ui.loaded = null;
    render();
    renderEditor(true);
    close();
    toast(`Sürüm ${r.version} geri yüklendi`);
  });
  show();
}
