/**
 * Eşitleme döngüsü: önce yerel kuyruğu iter (push), sonra son bilinen seq'ten sonrasını çeker (pull).
 *
 * Tetikleyiciler: açılış, yazmayı bıraktıktan 2 sn sonra, WebSocket sinyali, ağ geri geldiğinde,
 * sekme öne geldiğinde ve 60 sn'de bir. Hata olursa üstel geri çekilmeyle (2 sn → 5 dk) yeniden denenir.
 * Birden çok sekme açıksa Web Locks ile yalnızca biri aynı anda eşitler.
 */
import { PUSH_LIMIT, type Note, type PullResponse, type PushResponse } from '@camnotlar/shared';
import { api, HttpError } from '../api/client.ts';
import { session } from '../state.ts';
import { getMeta } from '../store/db.ts';
import { ackPushed, applyRemote, outboxBatch, pendingCount } from '../store/repo.ts';

export type SyncState =
  | { s: 'local' }
  | { s: 'syncing' }
  | { s: 'synced'; at: number }
  | { s: 'offline'; pending: number }
  | { s: 'error'; message: string; pending: number }
  | { s: 'auth' };

type StatusFn = (st: SyncState) => void;
const statusFns = new Set<StatusFn>();
let state: SyncState = { s: 'local' };
export const onStatus = (fn: StatusFn) => {
  statusFns.add(fn);
  fn(state);
  return () => statusFns.delete(fn);
};
const setState = (st: SyncState) => {
  state = st;
  statusFns.forEach((f) => f(st));
};
export const syncState = () => state;

let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let again = false;
let failures = 0;
let started = false;

const online = () => typeof navigator === 'undefined' || navigator.onLine !== false;

/** Bir sonraki eşitlemeyi planlar; daha erken bir plan varsa ona dokunmaz. */
export function schedule(ms = 2000): void {
  if (!started) return;
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), ms);
}

async function withLock(fn: () => Promise<void>): Promise<boolean> {
  const locks = (navigator as Navigator & { locks?: LockManager }).locks;
  if (!locks) {
    await fn();
    return true;
  }
  let ran = false;
  await locks.request('camnotlar-sync', { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    ran = true;
    await fn();
  });
  return ran;
}

async function pushAll(): Promise<void> {
  for (let guard = 0; guard < 50; guard++) {
    const batch = await outboxBatch(PUSH_LIMIT);
    if (!batch.length) return;
    const changes = batch.map((b) => ({
      entity: b.entity, id: b.entity === 'settings' ? (session?.userId as string) : b.id, op: b.op, baseVersion: b.baseVersion, data: b.data,
    }));
    const res = await api<PushResponse>('/sync/push', { method: 'POST', body: JSON.stringify({ changes }) });
    for (let i = 0; i < batch.length; i++) {
      const sent = batch[i];
      const r = res.results[i];
      if (sent && r) await ackPushed(sent, r.status, r.version, r.entity === 'note' ? (r.data as Note | undefined) : undefined);
    }
    if (batch.length < PUSH_LIMIT) return;
  }
}

async function pullAll(): Promise<void> {
  let since = await getMeta<number>('lastSeq', 0);
  for (let guard = 0; guard < 200; guard++) {
    const p = await api<PullResponse>(`/sync/pull?since=${since}`);
    await applyRemote(p.changes, p.seq);
    since = p.seq;
    if (!p.hasMore) return;
  }
}

export async function syncNow(): Promise<void> {
  if (!started || session?.mode !== 'server') return;
  if (running) {
    again = true;
    return;
  }
  clearTimeout(timer);
  if (!online()) {
    setState({ s: 'offline', pending: await pendingCount() });
    return;
  }
  running = true;
  setState({ s: 'syncing' });
  try {
    const ran = await withLock(async () => {
      await pushAll();
      await pullAll();
    });
    failures = 0;
    const pending = await pendingCount();
    setState(pending && !ran ? { s: 'offline', pending } : { s: 'synced', at: Date.now() });
    if (!ran) schedule(3000);
  } catch (e) {
    failures++;
    const pending = await pendingCount();
    if (e instanceof HttpError && e.status === 401) setState({ s: 'auth' });
    else if (!online() || e instanceof TypeError) setState({ s: 'offline', pending });
    else setState({ s: 'error', message: (e as Error).message, pending });
    if (!(e instanceof HttpError && e.status === 401)) schedule(Math.min(300_000, 2000 * 2 ** Math.min(failures, 8)));
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(200);
    }
  }
}

const onOnline = () => void syncNow();
const onOffline = () => void pendingCount().then((pending) => setState({ s: 'offline', pending }));
const onVisible = () => {
  if (document.visibilityState === 'visible') void syncNow();
};
let interval: ReturnType<typeof setInterval> | undefined;

export function startSync(): void {
  if (started) return;
  started = true;
  addEventListener('online', onOnline);
  addEventListener('offline', onOffline);
  document.addEventListener('visibilitychange', onVisible);
  interval = setInterval(() => void syncNow(), 60_000);
  void syncNow();
}

export function stopSync(): void {
  started = false;
  clearTimeout(timer);
  clearInterval(interval);
  removeEventListener('online', onOnline);
  removeEventListener('offline', onOffline);
  document.removeEventListener('visibilitychange', onVisible);
  setState({ s: 'local' });
}
