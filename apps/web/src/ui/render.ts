/** Kenar çubuğu, not listesi ve editör çizimi (prototipteki görünüm birebir korunur). */
import { $, esc, ico, mq } from '../lib/dom.ts';
import { fLong, group, short } from '../lib/format.ts';
import { cur, count, dkey, P, S, session, sortedFolders, ui, visible, vname, type LocalNote, type View } from '../state.ts';
import { restoreCaret, saveCaret } from '../editor/caret.ts';

const app = () => $('#app');
const ed = () => $('#ed');

function row(v: View, name: string, icon: string, extra = '') {
  return `<div class="row${ui.view === v ? ' on' : ''}" data-v="${esc(v)}" role="button" tabindex="0">${ico(icon)}<span class="nm">${esc(name)}</span>${extra}<span class="ct">${count(v)}</span></div>`;
}

export function renderSide(): void {
  const em = ui.editF;
  const folders = sortedFolders();
  $('#folders').innerHTML = `<div class="grp">${row('all', 'Tüm Notlar', 'notes')}${row('pinned', 'Sabitlenmiş', 'pin')}</div>
 <p class="cap">Klasörlerim</p>${folders.length ? `<div class="grp">${folders.map((f) => row(f.id, f.name, 'folder', em
    ? `<button class="mini" data-ren="${esc(f.id)}" aria-label="Yeniden adlandır">${ico('pen')}</button><button class="mini red" data-delf="${esc(f.id)}" aria-label="Klasörü sil">${ico('trash')}</button>`
    : '')).join('')}</div>` : '<p class="hint">Henüz klasör yok.</p>'}
 <p class="cap"></p><div class="grp">${row('trash', 'Son Silinenler', 'trash')}</div>`;
  $('#editF').textContent = em ? 'Bitti' : 'Düzenle';
}

function item(n: LocalNote) {
  const showF = ['all', 'pinned', 'trash'].includes(ui.view);
  return `<div class="item${n.id === ui.sel && !mq.matches ? ' on' : ''}" data-id="${esc(n.id)}" role="button" tabindex="0"><div class="tt">${esc(n.title)}</div><div class="sn"><b>${esc(short(n[dkey()]))}</b><span class="sx">${esc(n.snippet)}</span></div>${showF ? `<div class="fd">${ico('folder')}${esc(vname(n.folderId ?? ''))}</div>` : ''}</div>`;
}

export function renderList(): void {
  const L = visible();
  $('#lt').textContent = vname();
  $('#cnt').textContent = L.length ? `${L.length} not` : 'Not yok';
  const pins = ['trash', 'pinned'].includes(ui.view) ? [] : L.filter((n) => n.pinned);
  const groups: [string, LocalNote[]][] = [];
  if (pins.length) groups.push(['Sabitlenmiş', pins]);
  const byDate = P.group && P.sort !== 'ttl';
  const rest = pins.length && !byDate ? 'Notlar' : '';
  for (const n of L) {
    if (pins.includes(n)) continue;
    const g = byDate ? group(n[dkey()]) : rest;
    const last = groups[groups.length - 1];
    if (last && last[0] === g && last[1] !== pins) last[1].push(n);
    else groups.push([g, [n]]);
  }
  let h = groups.map(([g, a]) => `<p class="cap">${esc(g)}</p><div class="grp">${a.map(item).join('')}</div>`).join('');
  if (!L.length) {
    h = `<div class="none">${ico(ui.q ? 'search' : ui.view === 'trash' ? 'trash' : 'notes')}<p>${
      ui.q ? `“${esc(ui.q)}” için sonuç yok` : ui.view === 'trash' ? 'Son Silinenler boş' : 'Bu klasörde henüz not yok'
    }</p>${ui.q || ui.view === 'trash' ? '' : '<button class="pill" data-act="new">Yeni Not</button>'}</div>`;
  } else if (ui.view === 'trash') h = '<p class="hint">Silinen notlar 30 gün burada kalır; istediğin zaman geri alabilirsin.</p>' + h;
  $('#notes').innerHTML = h + '<div class="lend"></div>';
}

/**
 * force: not içeriği DOM'a yeniden yazılır. Uzaktan gelen değişiklik açık notu güncellerse
 * imleç konumu metin uzaklığıyla korunur.
 */
export function renderEditor(force = false): void {
  const n = cur();
  const a = app();
  const e = ed();
  a.classList.toggle('nonote', !n);
  a.classList.toggle('intrash', !!n?.trashedAt);
  $('#backL').textContent = vname();
  if (!n) {
    ui.loaded = null;
    e.innerHTML = '';
    return;
  }
  if (force || ui.loaded !== n.id) {
    e.innerHTML = n.html;
    ui.loaded = n.id;
    $('#sc').scrollTop = 0;
  } else if (ui.remoteHtml != null && ui.remoteHtml === n.html && e.innerHTML !== n.html) {
    const c = document.activeElement === e ? saveCaret(e) : null;
    e.innerHTML = n.html;
    if (c) restoreCaret(e, c);
  }
  ui.remoteHtml = null;
  e.contentEditable = n.trashedAt ? 'false' : 'true';
  $('#banner').hidden = !n.trashedAt;
  $('#stamp').textContent = fLong.format(n.updatedAt);
  $('#wc').textContent = `${n.words} kelime`;
  $('[data-act=pin]').classList.toggle('on', !!n.pinned);
  $('#histB').hidden = session?.mode !== 'server' || !n.version;
}

export function render(): void {
  if (!mq.matches) {
    const L = visible();
    if (!L.some((n) => n.id === ui.sel)) ui.sel = L[0]?.id ?? null;
  }
  app().dataset.mob = ui.mob;
  renderSide();
  renderList();
  renderEditor();
}
