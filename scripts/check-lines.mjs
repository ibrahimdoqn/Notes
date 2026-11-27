// Depodaki hiçbir kaynak dosyanın 1000 satırı geçmediğini denetler.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const LIMIT = 1000;
const SKIP = new Set(['node_modules', 'dist', '.git', 'build', '.gradle', 'test-results', 'playwright-report']);
const EXT = new Set(['.ts', '.js', '.mjs', '.css', '.html', '.kt', '.kts', '.sql', '.json', '.md', '.yml', '.yaml', '.xml', '.sh']);
const bad = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name === 'package-lock.json') continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (EXT.has(extname(name))) {
      const lines = readFileSync(p, 'utf8').split('\n').length;
      if (lines > LIMIT) bad.push(`${p}: ${lines}`);
    }
  }
}
walk(process.argv[2] ?? '.');
if (bad.length) {
  console.error(`1000 satırı aşan dosyalar:\n${bad.join('\n')}`);
  process.exit(1);
}
console.log('Tüm dosyalar 1000 satırın altında.');
