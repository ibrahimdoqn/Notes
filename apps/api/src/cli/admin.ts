/**
 * Yönetici komutları:
 *   node dist/cli/admin.js create [e-posta]   → ilk yönetici hesabı (parola sorulur)
 *   node dist/cli/admin.js invite [e-posta]   → kayıt kapalıyken davet kodu
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../config.ts';
import { createPool } from '../db/pool.ts';
import { migrate } from '../db/migrate.ts';
import { createInvite, createUser, normEmail } from '../auth/service.ts';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
const [cmd, arg] = process.argv.slice(2);

async function ask(q: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    const w = (rl as unknown as { _writeToOutput: (s: string) => void });
    const orig = w._writeToOutput.bind(rl);
    w._writeToOutput = (s: string) => orig(s.startsWith(q) ? s : '*');
  }
  const a = await rl.question(q);
  rl.close();
  if (hidden) stdout.write('\n');
  return a.trim();
}

try {
  await migrate(db);
  if (cmd === 'create') {
    const email = normEmail(arg ?? process.env.ADMIN_EMAIL ?? (await ask('E-posta: ')));
    const pw = process.env.ADMIN_PASSWORD ?? (await ask('Parola (en az 10 karakter): ', true));
    const u = await createUser(db, email, pw, { isAdmin: true, hibp: cfg.hibpCheck });
    console.log(`Yönetici oluşturuldu: ${u.email}`);
  } else if (cmd === 'invite') {
    const email = arg ? normEmail(arg) : null;
    const code = await createInvite(db, email, null, 7);
    console.log(`Davet kodu (7 gün geçerli${email ? `, yalnızca ${email}` : ''}):\n\n  ${code}\n`);
  } else {
    console.log('Kullanım: admin.js create [e-posta] | invite [e-posta]');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Hata: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
