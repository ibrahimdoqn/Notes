/**
 * Yönetici komutları (yönetim sayfasına erişilemediğinde yedek yol):
 *   node dist/cli/admin.js create <kullanıcı-adı>          → yönetici hesabı (parola sorulur)
 *   node dist/cli/admin.js reset-password <kullanıcı-adı>  → parolayı sıfırla, oturumları kapat
 * Normalde ilk yönetici https://alan-adı/yonetim/ adresindeki kurulum ekranından açılır.
 */
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadConfig } from '../config.ts';
import { createPool } from '../db/pool.ts';
import { migrate } from '../db/migrate.ts';
import { checkPassword, hashPassword } from '../auth/password.ts';
import { createUser, normUsername } from '../auth/service.ts';

const cfg = loadConfig();
const db = createPool(cfg.databaseUrl);
const [cmd, arg] = process.argv.slice(2);

async function ask(q: string, hidden = false): Promise<string> {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) {
    const w = rl as unknown as { _writeToOutput: (s: string) => void };
    const orig = w._writeToOutput.bind(rl);
    w._writeToOutput = (s: string) => orig(s.startsWith(q) ? s : '*');
  }
  const a = await rl.question(q);
  rl.close();
  if (hidden) stdout.write('\n');
  return a.trim();
}

const password = async () => process.env.ADMIN_PASSWORD ?? (await ask('Parola (en az 10 karakter): ', true));

try {
  await migrate(db);
  if (cmd === 'create') {
    const username = normUsername(arg ?? process.env.ADMIN_USERNAME ?? (await ask('Kullanıcı adı: ')));
    const u = await createUser(db, username, await password(), { isAdmin: true, hibp: cfg.hibpCheck });
    console.log(`Yönetici oluşturuldu: ${u.username}`);
  } else if (cmd === 'reset-password') {
    const username = normUsername(arg ?? (await ask('Kullanıcı adı: ')));
    const pw = await password();
    await checkPassword(pw, cfg.hibpCheck);
    const r = await db.query<{ id: string }>('UPDATE users SET password_hash=$2 WHERE username=$1 RETURNING id', [username, await hashPassword(pw)]);
    const id = r.rows[0]?.id;
    if (!id) throw new Error('Kullanıcı bulunamadı.');
    await db.query('UPDATE sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [id]);
    console.log(`Parola sıfırlandı; ${username} tüm cihazlardan çıkış yaptı.`);
  } else {
    console.log('Kullanım: admin.js create <kullanıcı-adı> | reset-password <kullanıcı-adı>');
    process.exitCode = 1;
  }
} catch (e) {
  console.error(`Hata: ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
