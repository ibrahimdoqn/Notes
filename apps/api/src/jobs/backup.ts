import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync, readdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

/**
 * pg_dump ile sıkıştırılmış (custom format) yedek alır.
 * Saklama: son 7 günlük + son 4 haftalık (pazar günleri alınanlar) yedek.
 */
export async function backup(databaseUrl: string, dir: string, now = new Date()): Promise<string> {
  mkdirSync(dir, { recursive: true });
  const day = now.toISOString().slice(0, 10);
  const weekly = now.getUTCDay() === 0;
  const name = `camnotlar-${day}${weekly ? '-weekly' : ''}.dump`;
  const tmp = join(dir, `.${name}.part`);
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--dbname', databaseUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d: Buffer) => (err += d.toString()));
  const exit = new Promise<number>((res, rej) => {
    child.on('error', rej);
    child.on('close', res);
  });
  await pipeline(child.stdout, createWriteStream(tmp));
  const code = await exit;
  if (code !== 0) {
    unlinkSync(tmp);
    throw new Error(`pg_dump başarısız (${code}): ${err.trim()}`);
  }
  const final = join(dir, name);
  renameSync(tmp, final);
  prune(dir);
  return final;
}

export function prune(dir: string, daily = 7, weekly = 4): string[] {
  const files = readdirSync(dir).filter((f) => /^camnotlar-\d{4}-\d{2}-\d{2}(-weekly)?\.dump$/.test(f)).sort().reverse();
  const keep = new Set([
    ...files.filter((f) => !f.includes('-weekly')).slice(0, daily),
    ...files.filter((f) => f.includes('-weekly')).slice(0, weekly),
  ]);
  const removed: string[] = [];
  for (const f of files) {
    if (keep.has(f)) continue;
    const p = join(dir, f);
    if (statSync(p).isFile()) {
      unlinkSync(p);
      removed.push(f);
    }
  }
  return removed;
}
