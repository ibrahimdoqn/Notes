/** Kenar çubuğu altındaki eşitleme göstergesi: "Eşitlendi · şimdi", "Çevrimdışı — 3 değişiklik bekliyor"… */
import { $, esc, ico } from '../lib/dom.ts';
import { relTime } from '../lib/format.ts';
import { onStatus, syncNow, syncState, type SyncState } from '../sync/engine.ts';
import { authLost } from './auth.ts';

function text(st: SyncState): [string, string] {
  switch (st.s) {
    case 'local': return ['', ''];
    case 'syncing': return ['cloud', 'Eşitleniyor…'];
    case 'synced': return ['cloud', `Eşitlendi · ${relTime(st.at)}`];
    case 'offline': return ['offline', st.pending ? `Çevrimdışı — ${st.pending} değişiklik bekliyor` : 'Çevrimdışı'];
    case 'error': return ['offline', `Eşitlenemedi${st.pending ? ` — ${st.pending} değişiklik bekliyor` : ''}`];
    case 'auth': return ['offline', 'Oturum kapandı — giriş yap'];
  }
}

function paint(st: SyncState) {
  const el = $('#sync');
  const [icon, label] = text(st);
  el.hidden = st.s === 'local';
  el.dataset.s = st.s;
  el.title = st.s === 'error' ? st.message : 'Şimdi eşitle';
  el.innerHTML = icon ? `${ico(icon)}<span>${esc(label)}</span>` : '';
}

export function initSyncStatus(): void {
  onStatus(paint);
  $('#sync').addEventListener('click', () => {
    if (syncState().s === 'auth') void authLost();
    else void syncNow();
  });
  // "şimdi" → "2 dk önce" güncellensin.
  setInterval(() => paint(syncState()), 30_000);
}
