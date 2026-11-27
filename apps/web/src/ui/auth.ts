/** Giriş / kayıt ekranı, sunucusuz kullanım, çıkış ve parola değiştirme akışları. */
import { MIN_PASSWORD, type AuthResponse, type Folder } from '@camnotlar/shared';
import * as client from '../api/client.ts';
import { $, $$ } from '../lib/dom.ts';
import { S, session, setSession, ui, type Session } from '../state.ts';
import { db, getMeta, setMeta } from '../store/db.ts';
import { clearLegacy, readLegacyLocalStorage } from '../store/legacy.ts';
import { addAll, clearLocal, loadAll, pendingCount } from '../store/repo.ts';
import { seed } from '../store/seed.ts';
import { closeSocket, connectSocket } from '../sync/socket.ts';
import { schedule, startSync, stopSync, syncNow } from '../sync/engine.ts';
import { ask, toast } from './dialogs.ts';
import { applyPrefs } from './prefs.ts';
import { render } from './render.ts';

let mode: 'login' | 'register' = 'login';
let allowSignup = true;

const saveSession = async (s: Session) => {
  setSession(s);
  await setMeta('session', s);
};

/** Sunucu oturumu açıkken eşitleme ve canlı sinyalleri başlatır. */
export function startServer(): void {
  startSync();
  connectSocket({
    changed: () => schedule(150),
    logout: () => void authLost('Bu cihazın oturumu başka bir cihazdan kapatıldı.'),
  });
}

export async function authLost(msg = 'Oturumun sona erdi; yeniden giriş yap.'): Promise<void> {
  stopSync();
  closeSocket();
  showAuth(false, msg);
}

function setMode(m: 'login' | 'register') {
  mode = m;
  for (const b of $$('#authMode button')) b.classList.toggle('on', b.dataset.m === m);
  $('#aGo').textContent = m === 'login' ? 'Giriş yap' : 'Hesap oluştur';
  ($('#aPass') as HTMLInputElement).autocomplete = m === 'login' ? 'current-password' : 'new-password';
  $('#aInviteL').hidden = m === 'login' || allowSignup;
  $('#aErr').textContent = '';
}

export function showAuth(fromLocal: boolean, message = ''): void {
  $('#auth').hidden = false;
  $('#aLocal').hidden = fromLocal;
  $('#aErr').textContent = message;
  $('#authSub').textContent = fromLocal
    ? 'Bu cihazdaki notların hesabına taşınır ve tüm cihazlarında eşitlenir.'
    : 'Notların her cihazında, kendi sunucunda.';
  if (session?.email) ($('#aEmail') as HTMLInputElement).value = session.email;
  void client.info().then(
    (i) => {
      allowSignup = i.allowSignup;
      $('#aSrv').textContent = `Sunucu: ${location.host}${i.allowSignup ? '' : ' · kayıt davetle'}`;
      $('#aGo').removeAttribute('disabled');
      setMode(mode);
    },
    () => {
      $('#aSrv').textContent = 'Sunucuya ulaşılamadı. Notlarını yine de bu cihazda kullanabilirsin.';
    },
  );
  setTimeout(() => $('#aEmail').focus(), 60);
}
const hideAuth = () => {
  $('#auth').hidden = true;
};

/**
 * Sunucusuz kullanılan cihazda giriş yapılınca: aynı adlı yerel klasörler sunucudakilerle birleşir
 * (ör. iki ayrı "Notlar" oluşmasın), notlar hesaba taşınır.
 */
async function adoptServerFolders(): Promise<void> {
  const { folders } = await client.api<{ folders: Folder[] }>('/folders');
  const byName = new Map(folders.map((f) => [f.name.toLocaleLowerCase('tr'), f]));
  await db.transaction('rw', db.folders, db.notes, db.outbox, async () => {
    for (const lf of await db.folders.toArray()) {
      const sf = byName.get(lf.name.toLocaleLowerCase('tr'));
      if (lf.version !== 0 || !sf) continue;
      for (const n of await db.notes.where('folderId').equals(lf.id).toArray()) {
        await db.notes.put({ ...n, folderId: sf.id });
        const o = await db.outbox.get(`note:${n.id}`);
        if (o?.data) await db.outbox.put({ ...o, data: { ...(o.data as object), folderId: sf.id } as typeof o.data });
      }
      await db.folders.delete(lf.id);
      await db.outbox.delete(`folder:${lf.id}`);
      await db.folders.put(sf);
    }
  });
}

async function onAuthed(r: AuthResponse): Promise<void> {
  const prev = session;
  if (prev?.mode === 'server' && prev.userId !== r.user.id) await clearLocal();
  // Sunucusuz kullanılmış (ya da prototipten veri taşınmış) cihaz: yerel notlar hesaba katılır.
  const wasLocal = prev?.mode === 'local' || (!prev && (S.notes.length > 0 || S.folders.length > 0));
  await saveSession({ mode: 'server', userId: r.user.id, email: r.user.email, deviceId: r.deviceId });
  if (wasLocal) {
    await setMeta('lastSeq', 0);
    await adoptServerFolders().catch(() => {});
  }
  clearLegacy();
  await loadAll();
  hideAuth();
  applyPrefs();
  render();
  startServer();
  await syncNow();
  toast(wasLocal ? 'Bağlandı; bu cihazdaki notlar hesabına eşitleniyor' : `Hoş geldin, ${r.user.displayName || r.user.email}`);
}

async function submit(e: Event) {
  e.preventDefault();
  const email = ($('#aEmail') as HTMLInputElement).value.trim();
  const password = ($('#aPass') as HTMLInputElement).value;
  const inviteCode = ($('#aInvite') as HTMLInputElement).value.trim();
  const err = $('#aErr');
  if (!email || !password) return void (err.textContent = 'E-posta ve parola gerekli.');
  if (mode === 'register' && [...password].length < MIN_PASSWORD) {
    return void (err.textContent = `Parola en az ${MIN_PASSWORD} karakter olmalı.`);
  }
  const go = $('#aGo') as HTMLButtonElement;
  go.disabled = true;
  err.textContent = '';
  try {
    const deviceId = await getMeta<string | undefined>('deviceId', undefined);
    const r = await client.authenticate(mode, { email, password, inviteCode: inviteCode || undefined, deviceName: client.deviceName(), deviceId });
    await setMeta('deviceId', r.deviceId);
    ($('#aPass') as HTMLInputElement).value = '';
    await onAuthed(r);
  } catch (x) {
    err.textContent = x instanceof client.HttpError ? x.message : 'Sunucuya ulaşılamadı.';
  } finally {
    go.disabled = false;
  }
}

/** Sunucusuz mod: veriler yalnızca bu tarayıcıda; ilk açılışta eski prototip verisi ya da örnek notlar yüklenir. */
async function useLocal() {
  await saveSession({ mode: 'local' });
  if (!S.notes.length && !S.folders.length) {
    const legacy = readLegacyLocalStorage();
    await addAll(legacy?.data ?? seed());
    if (legacy) clearLegacy();
  }
  hideAuth();
  applyPrefs();
  render();
}

export async function logoutFlow(): Promise<void> {
  const pending = await pendingCount();
  const r = await ask({
    t: 'Çıkış yapılsın mı?',
    m: pending
      ? `${pending} değişiklik henüz sunucuya ulaşmadı ve kaybolacak. Bu cihazdaki notlar silinir.`
      : 'Bu cihazdaki notların kopyası silinir; sunucudaki notların yerinde kalır.',
    ok: 'Çıkış Yap',
    danger: true,
  });
  if (!r) return;
  stopSync();
  closeSocket();
  await client.logout().catch(() => {});
  await clearLocal();
  setSession(null);
  ui.sel = null;
  ui.view = 'all';
  ui.loaded = null;
  $('#set').hidden = true;
  render();
  showAuth(false);
}

export async function changePasswordFlow(): Promise<void> {
  const oldPassword = await ask({ t: 'Mevcut parola', input: '', inputType: 'password', placeholder: 'Mevcut parola', ok: 'Devam' });
  if (typeof oldPassword !== 'string' || !oldPassword) return;
  const newPassword = await ask({ t: 'Yeni parola', m: `En az ${MIN_PASSWORD} karakter. Diğer cihazlardan çıkış yapılır.`, input: '', inputType: 'password', placeholder: 'Yeni parola', ok: 'Değiştir' });
  if (typeof newPassword !== 'string' || !newPassword) return;
  try {
    await client.api('/auth/password', { method: 'POST', body: JSON.stringify({ oldPassword, newPassword }) });
    toast('Parola değiştirildi');
  } catch (e) {
    toast((e as Error).message);
  }
}

export function initAuth(): void {
  $('#authF').addEventListener('submit', (e) => void submit(e));
  $('#authMode').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (b) setMode(b.dataset.m as 'login' | 'register');
  });
  $('#aLocal').addEventListener('click', () => void useLocal());
  client.setAuthLostHandler(() => void authLost());
  let warned = false;
  client.setNewerServerHandler(() => {
    if (warned) return;
    warned = true;
    toast('Sunucu daha yeni bir sürümde; sayfayı yenilemen önerilir.', 'Yenile', () => location.reload(), 10_000);
  });
}
