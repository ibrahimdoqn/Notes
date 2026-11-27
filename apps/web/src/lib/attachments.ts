/**
 * Not ekleri (web). Dosya önce IndexedDB'ye yazılır ve nota hemen eklenir; sunucu oturumu varsa
 * eşitleme motoru yükler. Görüntülerken önce yerel kopya, yoksa sunucudan indirilip saklanır.
 *
 * Sözleşme: <img class="att" data-att="ID" alt="ad">  ve  <span class="file" data-att="ID">ad</span>
 */
import { escapeHtml, isImageMime, uuidv7 } from '@camnotlar/shared';
import { apiRaw, HttpError } from '../api/client.ts';
import { session } from '../state.ts';
import { db, getMeta } from '../store/db.ts';
export { formatSize } from './format.ts';

const urls = new Map<string, string>();
const loading = new Map<string, Promise<string | null>>();
export const DEFAULT_MAX = 25 * 1024 * 1024;

/** Dosyaları yerelde saklar ve nota eklenecek HTML'i döner. Sınırı aşanlar `rejected` listesinde döner. */
export async function storeFiles(files: File[]): Promise<{ html: string; rejected: string[] }> {
  const max = await getMeta<number>('maxAttachmentBytes', DEFAULT_MAX);
  const parts: string[] = [];
  const rejected: string[] = [];
  for (const f of files) {
    if (f.size > max) {
      rejected.push(f.name);
      continue;
    }
    const id = uuidv7();
    const mime = f.type || 'application/octet-stream';
    await db.blobs.put({ id, blob: f, name: f.name || 'dosya', mime, size: f.size, uploaded: 0, at: Date.now() });
    urls.set(id, URL.createObjectURL(f));
    const name = escapeHtml(f.name || 'dosya');
    parts.push(isImageMime(mime)
      ? `<div><img class="att" data-att="${id}" alt="${name}"></div>`
      : `<div><span class="file" data-att="${id}">${name}</span></div>`);
  }
  return { html: parts.join(''), rejected };
}

/** Ekin görüntülenebilir adresi: yerel kopya ya da sunucudan indirilip yerelde saklanan. */
export function urlFor(id: string): Promise<string | null> {
  const cached = urls.get(id);
  if (cached) return Promise.resolve(cached);
  let p = loading.get(id);
  if (!p) {
    p = (async () => {
      const row = await db.blobs.get(id);
      let blob = row?.blob;
      if (!blob && session?.mode === 'server') {
        try {
          const res = await apiRaw(`/attachments/${id}`);
          blob = await res.blob();
          const mime = res.headers.get('x-file-mime') ?? blob.type;
          const name = decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'dosya');
          await db.blobs.put({ id, blob, name, mime, size: blob.size, uploaded: 1, at: Date.now() });
        } catch {
          return null;
        }
      }
      if (!blob) return null;
      const u = URL.createObjectURL(blob);
      urls.set(id, u);
      return u;
    })().finally(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}

/** Editördeki ekleri canlandırır: resimlere adres verir, dosya rozetlerini düzenlenemez yapar. */
export function hydrate(root: HTMLElement): void {
  for (const img of root.querySelectorAll<HTMLImageElement>('img.att[data-att]')) {
    if (img.getAttribute('src')) continue;
    img.classList.add('loading');
    void urlFor(img.dataset.att as string).then((u) => {
      img.classList.remove('loading');
      if (u) img.src = u;
      else img.classList.add('missing');
    });
  }
  for (const s of root.querySelectorAll<HTMLElement>('span.file[data-att]')) s.contentEditable = 'false';
}

/** Dosya rozetine tıklayınca indirir. */
export async function openAttachment(id: string, name: string): Promise<void> {
  const u = await urlFor(id);
  if (!u) throw new Error('Ek indirilemedi (çevrimdışı olabilirsin).');
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  a.click();
}

/** Bekleyen ekleri sunucuya yükler (eşitleme motoru push'tan önce çağırır). */
export async function uploadPending(onRejected: (name: string, msg: string) => void): Promise<void> {
  for (const row of await db.blobs.where('uploaded').equals(0).toArray()) {
    try {
      await apiRaw(`/attachments/${row.id}`, {
        method: 'PUT', body: row.blob, headers: { 'content-type': row.mime, 'x-file-name': encodeURIComponent(row.name) },
      });
      await db.blobs.update(row.id, { uploaded: 1 });
    } catch (e) {
      // Kalıcı hata (çok büyük, geçersiz): bir daha denenmez; ağ hatası yukarı iletilir.
      if (e instanceof HttpError && e.status >= 400 && e.status < 500 && e.status !== 401) {
        await db.blobs.update(row.id, { uploaded: 1 });
        onRejected(row.name, e.message);
      } else throw e;
    }
  }
}
