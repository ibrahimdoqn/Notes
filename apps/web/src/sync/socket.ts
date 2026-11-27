/**
 * "Değişiklik var" sinyalleri için WebSocket. Bağlantı koparsa üstel geri çekilmeyle yeniden bağlanır.
 * Belirteç URL'de değil ilk mesajda gönderilir (sunucu günlüklerinde görünmesin diye).
 */
import { getAccessToken, refresh } from '../api/client.ts';

let ws: WebSocket | null = null;
let retry = 0;
let stopped = true;
let timer: ReturnType<typeof setTimeout> | undefined;

export interface SocketHandlers {
  changed(seq: number): void;
  logout(): void;
}

export function connectSocket(h: SocketHandlers): void {
  stopped = false;
  clearTimeout(timer);
  open(h);
}

function open(h: SocketHandlers) {
  if (stopped || typeof WebSocket === 'undefined') return;
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/v1/ws`;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = async () => {
    let token = getAccessToken();
    if (!token) {
      try {
        token = (await refresh()).accessToken;
      } catch {
        sock.close();
        return;
      }
    }
    sock.send(JSON.stringify({ type: 'auth', token }));
  };
  sock.onmessage = (e: MessageEvent<string>) => {
    try {
      const m = JSON.parse(e.data) as { type: string; seq?: number };
      if (m.type === 'ready') retry = 0;
      else if (m.type === 'changed') h.changed(m.seq ?? 0);
      else if (m.type === 'logout') h.logout();
    } catch {
      /* yok say */
    }
  };
  sock.onclose = (e) => {
    if (ws === sock) ws = null;
    if (stopped) return;
    // 4401: belirteç süresi dolmuş olabilir; yenileyip tekrar dene.
    if (e.code === 4401) void refresh().catch(() => {});
    const wait = Math.min(60_000, 1000 * 2 ** Math.min(retry++, 6)) * (0.75 + Math.random() / 2);
    timer = setTimeout(() => open(h), wait);
  };
}

export function closeSocket(): void {
  stopped = true;
  clearTimeout(timer);
  ws?.close();
  ws = null;
}
