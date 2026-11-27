/** Uygulama girişi: yerel veriyi yükler, oturumu açar, arayüzü ve eşitlemeyi başlatır. */
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/editor.css';
import './styles/dialogs.css';
import './styles/settings.css';
import './styles/mobile.css';
import './styles/app.css';
import { normalizePrefs } from '@camnotlar/shared';
import { refresh, HttpError } from './api/client.ts';
import { initEditor } from './editor/editor.ts';
import { P, S, cur, setSession, ui, type Session } from './state.ts';
import { getMeta } from './store/db.ts';
import { clearLegacy, readLegacyLocalStorage } from './store/legacy.ts';
import { addAll, loadAll, onChange, savePrefs, setSyncHint } from './store/repo.ts';
import { schedule } from './sync/engine.ts';
import { initActions } from './ui/actions.ts';
import { initAuth, showAuth, startServer, authLost } from './ui/auth.ts';
import { applyPrefs, sysDark } from './ui/prefs.ts';
import { render, renderEditor, renderList, renderSide } from './ui/render.ts';
import { initSettings, refreshSettings } from './ui/settings.ts';
import { initSyncStatus } from './ui/sync-status.ts';
import { registerSW } from './pwa.ts';

async function boot() {
  initActions();
  initEditor(() => {
    renderList();
    renderSide();
  });
  initSettings();
  initAuth();
  initSyncStatus();

  await loadAll();
  const sess = await getMeta<Session | null>('session', null);
  setSession(sess);

  // Yerel yazımlar 2 sn sonra eşitlenir; uzaktan gelenler arayüzü yeniler.
  setSyncHint(() => schedule(2000));
  onChange((why) => {
    if (why === 'local') return;
    applyPrefs();
    const n = cur();
    if (n) ui.remoteHtml = n.html;
    render();
    refreshSettings();
  });

  applyPrefs();
  render();
  sysDark.addEventListener('change', applyPrefs);
  setInterval(() => {
    if (P.mode === 'sched') applyPrefs();
  }, 60_000);
  registerSW();

  if (!sess) {
    // Prototip sürümünden kalan notlar varsa sunucusuz modda otomatik içeri alınır.
    const legacy = readLegacyLocalStorage();
    if (legacy && !S.notes.length) {
      await addAll(legacy.data);
      if (legacy.prefs) await savePrefs(normalizePrefs(legacy.prefs));
      clearLegacy();
      applyPrefs();
      render();
    }
    showAuth(false);
    return;
  }
  if (sess.mode === 'server') {
    try {
      await refresh();
      startServer();
    } catch (e) {
      // Ağ yoksa çevrimdışı çalışılır; eşitleme motoru bağlantı gelince yeniden dener.
      if (e instanceof HttpError && e.status === 401) await authLost();
      else startServer();
    }
  }
  renderEditor(true);
}

void boot();
