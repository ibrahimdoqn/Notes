/** Ayarlar sayfası: görünüm, tema, yazı, liste, veriler, hesap ve cihazlar. */
import { sanitizeNoteHtml, THEMES, uuidv7, type Device, type Folder, type Note, type Prefs } from '@camnotlar/shared';
import { api, HttpError } from '../api/client.ts';
import { $, $$, esc, ico } from '../lib/dom.ts';
import { relTime } from '../lib/format.ts';
import { P, S, session, ui } from '../state.ts';
import { convertLegacy, isLegacy } from '../store/legacy.ts';
import { addAll, deleteNoteForever, replaceAll, savePrefs } from '../store/repo.ts';
import { seed } from '../store/seed.ts';
import { ask, toast } from './dialogs.ts';
import { applyPrefs } from './prefs.ts';
import { render } from './render.ts';
import { changePasswordFlow, logoutFlow, showAuth } from './auth.ts';

const SEG: Record<string, [string, string][]> = {
  mode: [['auto', 'Otomatik'], ['light', 'Açık'], ['dark', 'Gece'], ['sched', 'Zamanlı']],
  glass: [['mat', 'Mat'], ['bal', 'Dengeli'], ['clear', 'Şeffaf']],
  font: [['sys', 'Sistem'], ['serif', 'Serif'], ['mono', 'Mono']],
  size: [['s', 'Küçük'], ['m', 'Orta'], ['l', 'Büyük']],
  sort: [['up', 'Düzenlenme'], ['cr', 'Oluşturulma'], ['ttl', 'Başlık']],
};

function renderSettings(): void {
  for (const s of $$('.seg[data-k]')) {
    const k = s.dataset.k as keyof Prefs;
    s.innerHTML = (SEG[k] ?? []).map(([v, l]) => `<button type="button" class="${P[k] === v ? 'on' : ''}" data-v="${v}" aria-pressed="${P[k] === v}">${l}</button>`).join('');
  }
  $('#themes').innerHTML = THEMES.map((t) =>
    `<button type="button" class="swt${P.theme === t.id ? ' on' : ''}" data-th="${t.id}" style="--c:${t.color}" aria-pressed="${P.theme === t.id}"><i style="background:linear-gradient(135deg,${t.light},${t.color})"></i>${esc(t.name)}</button>`).join('');
  for (const i of $$<HTMLInputElement>('.sw[data-k]')) i.checked = !!P[i.dataset.k as keyof Prefs];
  $('#sched').hidden = P.mode !== 'sched';
  ($('#nFrom') as HTMLInputElement).value = P.from;
  ($('#nTo') as HTMLInputElement).value = P.to;
  const server = session?.mode === 'server';
  $('#acctSec').hidden = !server;
  $('#localSec').hidden = server;
  $('#srvexp').hidden = !server;
  $('#setHint').textContent = server
    ? 'Notların bu cihazda da saklanır; çevrimdışıyken yazdıkların bağlantı gelince eşitlenir. Kısayollar: Alt+N yeni not, / arama, Ctrl+, ayarlar.'
    : 'Notlar ve ayarlar yalnızca bu tarayıcıda saklanır. Kısayollar: Alt+N yeni not, / arama, Ctrl+, ayarlar.';
  if (server) {
    $('#acctMail').innerHTML = `${esc(session?.email ?? '')}<small id="acctSrv">${esc(location.host)}</small>`;
  }
}

async function renderDevices(): Promise<void> {
  const box = $('#devs');
  try {
    const { devices } = await api<{ devices: Device[] }>('/devices');
    box.innerHTML = devices.map((d) =>
      `<div class="dev">${ico(d.platform === 'android' ? 'phone' : 'desktop')}<span>${esc(d.name)}<small>${d.current ? '<span class="tag">Bu cihaz</span>' : `Son görülme: ${esc(relTime(d.lastSeenAt))}`}</small></span>${d.current ? '' : `<button type="button" data-kick="${esc(d.id)}">Çıkış yaptır</button>`}</div>`).join('') ||
      '<p class="hint">Cihaz yok.</p>';
  } catch (e) {
    box.innerHTML = `<p class="hint">${esc(e instanceof HttpError ? e.message : 'Cihazlar yüklenemedi (çevrimdışı olabilirsin).')}</p>`;
  }
}

async function update(p: Partial<Prefs>) {
  await savePrefs({ ...P, ...p });
  applyPrefs();
  if (!$('#set').hidden) renderSettings();
  render();
}

export function openSettings(): void {
  renderSettings();
  if (session?.mode === 'server') void renderDevices();
  $('#set').hidden = false;
  setTimeout(() => $('#setX').focus(), 40);
}
export const closeSettings = () => {
  $('#set').hidden = true;
};
export const refreshSettings = () => {
  if (!$('#set').hidden) renderSettings();
};

function download(name: string, text: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Yedek dosyası: bu sürümün biçimi (folderId'li) ya da prototipin eski biçimi. */
function parseBackup(d: unknown): { folders: Folder[]; notes: Note[] } | null {
  if (isLegacy(d)) return convertLegacy(d);
  const x = d as { folders?: Partial<Folder>[]; notes?: Partial<Note>[] };
  if (!x || !Array.isArray(x.notes) || !Array.isArray(x.folders)) return null;
  const now = Date.now();
  const map = new Map<string, string>();
  const folders = x.folders.filter((f) => f?.id).map((f, i): Folder => {
    const id = uuidv7();
    map.set(String(f.id), id);
    return { id, name: String(f.name ?? 'Klasör').slice(0, 60), sortOrder: Number(f.sortOrder) || i, version: 0, updatedAt: now };
  });
  const notes = x.notes.filter((n) => n?.id).map((n): Note => ({
    id: uuidv7(), folderId: map.get(String(n.folderId)) ?? folders[0]?.id ?? null, html: sanitizeNoteHtml(String(n.html ?? '')),
    title: '', snippet: '', pinned: !!n.pinned, createdAt: Number(n.createdAt) || now, updatedAt: Number(n.updatedAt) || now,
    trashedAt: n.trashedAt ? Number(n.trashedAt) : null, version: 0,
  }));
  return { folders, notes };
}

export function initSettings(): void {
  $('#setX').addEventListener('click', closeSettings);
  $('#set').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'set') return closeSettings();
    const b = t.closest<HTMLElement>('.seg button');
    if (b) return void update({ [(b.closest('.seg') as HTMLElement).dataset.k as string]: b.dataset.v });
    const th = t.closest<HTMLElement>('[data-th]');
    if (th) return void update({ theme: th.dataset.th as Prefs['theme'] });
    const kick = t.closest<HTMLElement>('[data-kick]');
    if (kick) {
      void ask({ t: 'Bu cihazdan çıkış yapılsın mı?', m: 'Cihaz bir sonraki eşitlemede oturumunu kaybeder.', ok: 'Çıkış yaptır', danger: true }).then(async (r) => {
        if (!r) return;
        await api(`/devices/${kick.dataset.kick}`, { method: 'DELETE' }).then(() => toast('Cihazın oturumu kapatıldı'), (err: Error) => toast(err.message));
        void renderDevices();
      });
    }
  });
  $('#set').addEventListener('change', (e) => {
    const i = e.target as HTMLInputElement;
    if (i.matches('.sw')) void update({ [i.dataset.k as string]: i.checked });
    else if (i.id === 'nFrom') void update({ from: i.value || '20:00' });
    else if (i.id === 'nTo') void update({ to: i.value || '07:00' });
  });

  $('#exp').addEventListener('click', () => {
    const j = JSON.stringify({ app: 'cam-notlar', v: 2, folders: S.folders, notes: S.notes.map(({ plain: _p, words: _w, ...n }) => n) });
    navigator.clipboard?.writeText(j).then(() => toast('Yedek panoya kopyalandı'), () => {
      download('camnotlar-yedek.json', j);
      toast('Yedek dosyası indirildi');
    });
  });
  $('#srvexp').addEventListener('click', async () => {
    try {
      const data = await api<unknown>('/export');
      download(`camnotlar-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 1));
    } catch (e) {
      toast((e as Error).message);
    }
  });
  $('#imp').addEventListener('change', async (e) => {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    let d: unknown;
    try {
      d = JSON.parse(await f.text());
    } catch {
      return toast('Dosya okunamadı');
    }
    const data = parseBackup(d);
    if (!data) return toast('Bu bir Cam Notlar yedeği değil');
    const r = await ask({ t: 'Yedek geri yüklensin mi?', m: `${data.notes.length} not mevcut notlarının yerini alacak.`, ok: 'Geri Yükle', danger: true });
    if (!r) return;
    await replaceAll(data);
    ui.view = 'all';
    ui.sel = null;
    ui.loaded = null;
    render();
    toast('Yedek geri yüklendi');
  });
  $('#rs').addEventListener('click', async () => {
    const s = seed();
    await addAll(s);
    render();
    toast(`${s.notes.length} örnek not eklendi`);
  });
  $('#wipe').addEventListener('click', async () => {
    const r = await ask({ t: 'Tüm notlar silinsin mi?', m: 'Son Silinenler dahil her not kalıcı olarak silinecek. Klasörlerin kalır.', ok: 'Hepsini Sil', danger: true });
    if (!r) return;
    for (const n of [...S.notes]) await deleteNoteForever(n);
    ui.sel = null;
    ui.loaded = null;
    render();
    toast('Tüm notlar silindi');
  });
  $('#logoutB').addEventListener('click', () => void logoutFlow());
  $('#pwB').addEventListener('click', () => void changePasswordFlow());
  $('#connectB').addEventListener('click', () => {
    closeSettings();
    showAuth(true);
  });
}
