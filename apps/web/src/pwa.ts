/** Service Worker kaydı ve "Güncelleme hazır" bildirimi. */
import { toast } from './ui/dialogs.ts';

export function registerSW(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let reloading = false;
  // İlk kurulumda (henüz denetleyici yokken) clients.claim sayfayı yeniden yüklemesin.
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !hadController) return;
    reloading = true;
    location.reload();
  });
  void navigator.serviceWorker.register('/sw.js').then((reg) => {
    const offer = (w: ServiceWorker) =>
      toast('Güncelleme hazır', 'Yenile', () => w.postMessage({ type: 'skipWaiting' }), 30_000);
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) offer(w);
      });
    });
    setInterval(() => void reg.update().catch(() => {}), 60 * 60 * 1000);
  });
}
