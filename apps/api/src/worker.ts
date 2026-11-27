/**
 * Arka plan işleri: çöp kutusu temizliği (saatte bir) ve gece yedeği (03:00, sunucu saatiyle).
 * `node dist/worker.js once` ile işler bir kez çalıştırılıp çıkılır.
 */
import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { migrate } from './db/migrate.ts';
import { cleanup } from './jobs/cleanup.ts';
import { backup, backupAttachments } from './jobs/backup.ts';
import { AttachmentStore } from './attachments/store.ts';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
const log = (m: string, extra: object = {}) => console.log(JSON.stringify({ time: new Date().toISOString(), msg: m, ...extra }));
const BACKUP_HOUR = Number(process.env.BACKUP_HOUR ?? 3);
const backupsOn = process.env.BACKUP_ENABLED !== 'false';

async function runCleanup() {
  try {
    log('temizlik tamam', await cleanup(db, cfg.trashRetentionDays, cfg.tombstoneRetentionDays, new AttachmentStore(cfg.attachmentsDir)));
  } catch (e) {
    log('temizlik hatası', { error: (e as Error).message });
  }
}

async function runBackup() {
  try {
    log('yedek alındı', { file: await backup(cfg.databaseUrl, cfg.backupDir), attachments: await backupAttachments(cfg.attachmentsDir, cfg.backupDir) });
  } catch (e) {
    log('yedek hatası', { error: (e as Error).message });
  }
}

for (let i = 0; ; i++) {
  try {
    await migrate(db, log);
    break;
  } catch (e) {
    if (i > 30) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

if (process.argv[2] === 'once') {
  await runCleanup();
  if (backupsOn) await runBackup();
  await db.end();
} else {
  log('worker başladı', { backupHour: BACKUP_HOUR, backups: backupsOn });
  await runCleanup();
  setInterval(runCleanup, 60 * 60 * 1000);
  let lastBackupDay = '';
  setInterval(() => {
    const d = new Date();
    const day = d.toISOString().slice(0, 10);
    if (backupsOn && d.getHours() === BACKUP_HOUR && lastBackupDay !== day) {
      lastBackupDay = day;
      void runBackup();
    }
  }, 60 * 1000);
  const stop = async () => {
    await db.end();
    process.exit(0);
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
