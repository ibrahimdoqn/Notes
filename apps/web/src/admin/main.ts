/**
 * Sunucu yönetimi sayfası (/yonetim/). Kayıtlar yalnızca buradan açılır.
 * - Sunucu boşsa: ilk yönetici hesabı (kurulum).
 * - Değilse: yönetici girişi; ardından kullanıcı listesi, oluşturma, parola sıfırlama, yetki ve silme.
 * Tarayıcıda notlar uygulamasının oturumu varsa (aynı çerez) yeniden giriş istenmez.
 */
import '../styles/tokens.css';
import '../styles/base.css';
import '../styles/layout.css';
import '../styles/dialogs.css';
import '../styles/settings.css';
import '../styles/app.css';
import '../styles/admin.css';
import { MIN_PASSWORD, type AdminUser, type AuthResponse, type User } from '@camnotlar/shared';
import { api, authenticate, deviceName, HttpError, info, refresh } from '../api/client.ts';
import { $, esc } from '../lib/dom.ts';
import { formatSize, relTime } from '../lib/format.ts';
import { ask, toast } from '../ui/dialogs.ts';

let me: User | null = null;
let setupMode = false;

const errText = (e: unknown) => (e instanceof HttpError ? e.message : 'Sunucuya ulaşılamadı.');

function showGate(setup: boolean, message = '') {
  setupMode = setup;
  $('#panel').hidden = true;
  $('#gate').hidden = false;
  $('#gateT').textContent = setup ? 'Sunucuyu kur' : 'Sunucu yönetimi';
  $('#gateSub').textContent = setup
    ? 'Sunucuda henüz hesap yok. İlk yönetici hesabını oluştur; diğer kullanıcıları sonra buradan açarsın.'
    : 'Devam etmek için yönetici hesabınla giriş yap.';
  $('#gNameL').hidden = !setup;
  $('#gPass2L').hidden = !setup;
  ($('#gPass') as HTMLInputElement).autocomplete = setup ? 'new-password' : 'current-password';
  $('#gGo').textContent = setup ? 'Yönetici hesabını oluştur' : 'Giriş yap';
  $('#gErr').textContent = message;
  setTimeout(() => {
    if (!$('#gate').contains(document.activeElement)) $('#gUser').focus();
  }, 50);
}

async function enter(user: User) {
  me = user;
  if (!user.isAdmin) {
    showGate(false, `${user.username} yönetici değil. Yönetici hesabıyla giriş yap.`);
    return;
  }
  $('#gate').hidden = true;
  $('#panel').hidden = false;
  $('#me').textContent = `${user.displayName || user.username} olarak`;
  await loadUsers();
}

async function gateSubmit(e: Event) {
  e.preventDefault();
  const username = ($('#gUser') as HTMLInputElement).value.trim();
  const password = ($('#gPass') as HTMLInputElement).value;
  const err = $('#gErr');
  if (!username || !password) return void (err.textContent = 'Kullanıcı adı ve parola gerekli.');
  if (setupMode) {
    if ([...password].length < MIN_PASSWORD) return void (err.textContent = `Parola en az ${MIN_PASSWORD} karakter olmalı.`);
    if (password !== ($('#gPass2') as HTMLInputElement).value) return void (err.textContent = 'Parolalar aynı değil.');
  }
  const go = $('#gGo') as HTMLButtonElement;
  go.disabled = true;
  try {
    const r: AuthResponse = await authenticate(setupMode ? 'setup' : 'login', {
      username, password, displayName: ($('#gName') as HTMLInputElement).value.trim() || undefined, deviceName: `${deviceName()} (yönetim)`,
    });
    ($('#gPass') as HTMLInputElement).value = '';
    ($('#gPass2') as HTMLInputElement).value = '';
    if (setupMode) toast('Sunucu kuruldu. Artık kullanıcı oluşturabilirsin.');
    await enter(r.user);
  } catch (x) {
    err.textContent = errText(x);
  } finally {
    go.disabled = false;
  }
}

function stat(label: string, value: string) {
  return `<div><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
}

async function loadUsers() {
  let users: AdminUser[];
  try {
    users = (await api<{ users: AdminUser[] }>('/admin/users')).users;
  } catch (e) {
    if (e instanceof HttpError && (e.status === 401 || e.status === 403)) return showGate(false, e.message);
    $('#users').innerHTML = `<p class="hint">${esc(errText(e))}</p>`;
    return;
  }
  $('#stats').innerHTML = stat('kullanıcı', String(users.length)) + stat('yönetici', String(users.filter((u) => u.isAdmin).length)) +
    stat('not', String(users.reduce((n, u) => n + u.notes, 0))) + stat('ek dosya alanı', formatSize(users.reduce((n, u) => n + u.attachmentBytes, 0)));
  $('#users').innerHTML = `<table class="utable"><thead><tr><th>Kullanıcı</th><th class="num">Not</th><th class="num">Ekler</th><th>Son görülme</th><th></th></tr></thead><tbody>${
    users.map((u) => `<tr data-id="${esc(u.id)}" data-u="${esc(u.username)}" data-admin="${u.isAdmin ? 1 : 0}">
      <td><b>${esc(u.username)}</b>${u.isAdmin ? '<span class="badge">yönetici</span>' : ''}${u.id === me?.id ? '<span class="badge">sen</span>' : ''}<small>${esc(u.displayName)}</small></td>
      <td class="num hide-m">${u.notes}</td><td class="num hide-m">${formatSize(u.attachmentBytes)}</td>
      <td class="hide-m">${u.lastSeenAt ? esc(relTime(u.lastSeenAt)) : '—'}<small>${u.devices} cihaz</small></td>
      <td><div class="uact"><button type="button" data-a="pw">Parola sıfırla</button><button type="button" data-a="name">Ad</button>
        <button type="button" data-a="admin">${u.isAdmin ? 'Yöneticiliği al' : 'Yönetici yap'}</button>
        ${u.id === me?.id ? '' : '<button type="button" class="red" data-a="del">Sil</button>'}</div></td></tr>`).join('')
  }</tbody></table>`;
}

/** Okunması kolay, güçlü rastgele parola (karışan harfler hariç). */
function genPassword(n = 14): string {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = new Uint32Array(n);
  crypto.getRandomValues(r);
  return [...r].map((x) => abc[x % abc.length]).join('');
}

function showCredentials(username: string, password: string) {
  const w = document.createElement('div');
  w.className = 'scrim';
  w.innerHTML = `<div class="dlg" role="dialog" aria-modal="true"><h3>Giriş bilgileri</h3><p>Bunu kullanıcıyla paylaş; parola bir daha gösterilmez.</p>
    <div class="cred">Sunucu: ${esc(location.host)}\nKullanıcı adı: ${esc(username)}\nParola: ${esc(password)}</div>
    <div class="dbtn"><button type="button" class="cn">Kapat</button><button type="button" class="ok">Kopyala</button></div></div>`;
  document.body.append(w);
  const close = () => w.remove();
  (w.querySelector('.cn') as HTMLElement).onclick = close;
  (w.querySelector('.ok') as HTMLElement).onclick = () => {
    void navigator.clipboard?.writeText(`Sunucu: ${location.host}\nKullanıcı adı: ${username}\nParola: ${password}`).then(() => toast('Kopyalandı'));
  };
}

async function createUser(e: Event) {
  e.preventDefault();
  const username = ($('#nUser') as HTMLInputElement).value.trim();
  const password = ($('#nPass') as HTMLInputElement).value;
  const err = $('#nErr');
  err.textContent = '';
  try {
    const u = await api<User>('/admin/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName: ($('#nName') as HTMLInputElement).value.trim() || undefined, isAdmin: ($('#nAdmin') as HTMLInputElement).checked }),
    });
    ($('#newF') as HTMLFormElement).reset();
    showCredentials(u.username, password);
    await loadUsers();
  } catch (x) {
    err.textContent = errText(x);
  }
}

async function rowAction(btn: HTMLElement) {
  const tr = btn.closest<HTMLElement>('tr[data-id]');
  if (!tr) return;
  const id = tr.dataset.id as string;
  const username = tr.dataset.u as string;
  const patch = (body: object) => api(`/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  try {
    switch (btn.dataset.a) {
      case 'pw': {
        const pw = await ask({ t: `${username} için yeni parola`, m: 'Kullanıcı tüm cihazlarından çıkış yapar.', input: genPassword(), inputType: 'text', placeholder: 'Yeni parola', ok: 'Sıfırla' });
        if (typeof pw !== 'string' || !pw) return;
        await patch({ password: pw });
        showCredentials(username, pw);
        break;
      }
      case 'name': {
        const name = await ask({ t: 'Görünen ad', input: tr.querySelector('small')?.textContent ?? '', placeholder: 'Görünen ad', ok: 'Kaydet' });
        if (typeof name !== 'string' || !name) return;
        await patch({ displayName: name });
        break;
      }
      case 'admin': {
        const make = tr.dataset.admin !== '1';
        const ok = await ask({ t: make ? `${username} yönetici yapılsın mı?` : `${username} yöneticilikten alınsın mı?`, ok: make ? 'Yönetici yap' : 'Yetkiyi al', danger: !make });
        if (!ok) return;
        await patch({ isAdmin: make });
        break;
      }
      case 'del': {
        const ok = await ask({ t: `${username} silinsin mi?`, m: 'Kullanıcının tüm notları, ekleri ve oturumları kalıcı olarak silinir.', ok: 'Kalıcı olarak sil', danger: true });
        if (!ok) return;
        await api(`/admin/users/${id}`, { method: 'DELETE' });
        toast(`${username} silindi`);
        break;
      }
      default:
        return;
    }
    await loadUsers();
  } catch (x) {
    toast(errText(x));
  }
}

async function boot() {
  $('#gateF').addEventListener('submit', (e) => void gateSubmit(e));
  $('#newF').addEventListener('submit', (e) => void createUser(e));
  $('#nGen').addEventListener('click', () => {
    ($('#nPass') as HTMLInputElement).value = genPassword();
  });
  $('#users').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
    if (b) void rowAction(b);
  });
  try {
    if ((await info()).needsSetup) return showGate(true);
  } catch {
    return showGate(false, 'Sunucuya ulaşılamadı.');
  }
  try {
    await enter((await refresh()).user);
  } catch {
    showGate(false);
  }
}

void boot();
