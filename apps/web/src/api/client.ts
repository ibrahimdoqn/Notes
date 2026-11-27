/**
 * Sunucu istemcisi. Erişim belirteci yalnızca bellekte tutulur; yenileme belirteci
 * HttpOnly çerezdedir ve JavaScript onu hiç görmez. 401 alınınca bir kez yenilenip tekrar denenir.
 */
import { API_VERSION, type ApiErrorBody, type AuthResponse, type ServerInfo } from '@camnotlar/shared';

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

const BASE = '/v1';
let accessToken: string | null = null;
let refreshing: Promise<AuthResponse> | null = null;
let onAuthLost: (() => void) | null = null;
let onNewerServer: ((v: number) => void) | null = null;

export const setAuthLostHandler = (fn: () => void) => {
  onAuthLost = fn;
};
export const setNewerServerHandler = (fn: (v: number) => void) => {
  onNewerServer = fn;
};
export const getAccessToken = () => accessToken;
export const hasToken = () => accessToken != null;

async function raw(path: string, init: RequestInit = {}, auth = true): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (auth && accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const res = await fetch(BASE + path, { ...init, headers, credentials: 'same-origin' });
  const v = Number(res.headers.get('x-camnotlar-api'));
  if (v > API_VERSION) onNewerServer?.(v);
  return res;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : undefined;
  if (!res.ok) {
    const e = (body as ApiErrorBody | undefined)?.error;
    throw new HttpError(res.status, e?.code ?? 'internal', e?.message ?? `Sunucu hatası (${res.status})`);
  }
  return body as T;
}

/** Çerezdeki yenileme belirteciyle yeni erişim belirteci alır; aynı anda tek istek. */
export function refresh(): Promise<AuthResponse> {
  refreshing ??= (async () => {
    try {
      const r = await parse<AuthResponse>(await raw('/auth/refresh', { method: 'POST', body: '{}' }, false));
      accessToken = r.accessToken;
      return r;
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        accessToken = null;
        onAuthLost?.();
      }
      throw e;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!accessToken) await refresh();
  let res = await raw(path, init);
  if (res.status === 401) {
    await refresh();
    res = await raw(path, init);
  }
  return parse<T>(res);
}

export const info = async (): Promise<ServerInfo> => parse<ServerInfo>(await raw('/info', {}, false));

export async function authenticate(kind: 'login' | 'register', body: Record<string, unknown>): Promise<AuthResponse> {
  const r = await parse<AuthResponse>(await raw(`/auth/${kind}`, { method: 'POST', body: JSON.stringify({ ...body, platform: 'web' }) }, false));
  accessToken = r.accessToken;
  return r;
}

export async function logout(): Promise<void> {
  try {
    await raw('/auth/logout', { method: 'POST', body: '{}' });
  } finally {
    accessToken = null;
  }
}

/** Tarayıcı ve işletim sistemi adından kısa bir cihaz adı. */
export function deviceName(): string {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Tarayıcı';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${b} · ${os}` : b;
}
