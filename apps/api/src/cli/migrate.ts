import { loadConfig } from '../config.ts';
import { createPool } from '../db/pool.ts';
import { migrate } from '../db/migrate.ts';

const db = createPool(loadConfig().databaseUrl);
try {
  const done = await migrate(db, console.log);
  console.log(done.length ? `${done.length} göç uygulandı.` : 'Şema güncel.');
} finally {
  await db.end();
}
