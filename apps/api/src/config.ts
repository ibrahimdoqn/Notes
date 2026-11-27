/** Ortam değişkenlerinden okunan yapılandırma. */
export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  jwtPrivateKey: string | undefined;
  attachmentsDir: string;
  maxAttachmentBytes: number;
  hibpCheck: boolean;
  trashRetentionDays: number;
  tombstoneRetentionDays: number;
  accessTtlSec: number;
  refreshTtlDays: number;
  /** Çerezlerde Secure bayrağı; yerel HTTP geliştirmede kapatılabilir. */
  secureCookies: boolean;
  logLevel: string;
  webDir: string | undefined;
  backupDir: string;
}

const bool = (v: string | undefined, def: boolean) => (v == null || v === '' ? def : /^(1|true|yes|evet)$/i.test(v));
const int = (v: string | undefined, def: number) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const pw = env.POSTGRES_PASSWORD;
  return {
    port: int(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    databaseUrl:
      env.DATABASE_URL ??
      (pw ? `postgres://camnotlar:${encodeURIComponent(pw)}@db:5432/camnotlar` : 'postgres://postgres@localhost:5432/camnotlar'),
    jwtPrivateKey: env.JWT_PRIVATE_KEY?.replace(/\\n/g, '\n') || undefined,
    attachmentsDir: env.ATTACHMENTS_DIR ?? '/data/attachments',
    maxAttachmentBytes: int(env.MAX_ATTACHMENT_MB, 25) * 1024 * 1024,
    hibpCheck: bool(env.HIBP_CHECK, true),
    trashRetentionDays: int(env.TRASH_RETENTION_DAYS, 30),
    tombstoneRetentionDays: int(env.TOMBSTONE_RETENTION_DAYS, 90),
    accessTtlSec: int(env.ACCESS_TTL_SEC, 15 * 60),
    refreshTtlDays: int(env.REFRESH_TTL_DAYS, 60),
    secureCookies: bool(env.SECURE_COOKIES, true),
    logLevel: env.LOG_LEVEL ?? 'info',
    webDir: env.WEB_DIR || undefined,
    backupDir: env.BACKUP_DIR ?? '/backups',
  };
}
