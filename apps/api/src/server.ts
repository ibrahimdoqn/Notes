import { loadConfig } from './config.ts';
import { createPool } from './db/pool.ts';
import { migrate } from './db/migrate.ts';
import { createSigner } from './auth/tokens.ts';
import { Hub } from './lib/hub.ts';
import { buildApp } from './app.ts';
import { AttachmentStore } from './attachments/store.ts';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);

async function waitForDb(tries = 30): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await db.query('SELECT 1');
      return;
    } catch (e) {
      if (i >= tries) throw e;
      console.log(`veritabanı bekleniyor (${i}/${tries})…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

await waitForDb();
await migrate(db, (m) => console.log(m));
const signer = await createSigner(cfg.jwtPrivateKey, cfg.accessTtlSec, (m) => console.warn(m));
const app = await buildApp({ cfg, db, signer, hub: new Hub(), attachments: new AttachmentStore(cfg.attachmentsDir) });

const stop = async () => {
  await app.close();
  await db.end();
  process.exit(0);
};
process.on('SIGTERM', stop);
process.on('SIGINT', stop);

await app.listen({ port: cfg.port, host: cfg.host });
