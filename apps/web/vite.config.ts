import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

const API = process.env.API_URL ?? 'http://localhost:3000';

/** Derlenen dosyaların listesiyle sw.js üretir; içerik değişince SW sürümü de değişir. */
function serviceWorker(): Plugin {
  return {
    name: 'camnotlar-sw',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const pub = readdirSync(join(import.meta.dirname, 'public'), { recursive: true, withFileTypes: true })
        .filter((d) => d.isFile())
        .map((d) => `/${join(d.parentPath ?? (d as unknown as { path: string }).path, d.name).split('/public/')[1]}`);
      const files = ['/', '/index.html', ...Object.keys(bundle).map((f) => `/${f}`), ...pub].filter((f) => !f.endsWith('.map'));
      const version = createHash('sha256').update(files.join('|') + Object.values(bundle).map((b) => ('code' in b ? b.code : String(b.source))).join('')).digest('hex').slice(0, 12);
      const tpl = readFileSync(join(import.meta.dirname, 'src/sw-template.js'), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: tpl.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify([...new Set(files)], null, 1)),
      });
    },
  };
}

export default defineConfig({
  plugins: [serviceWorker()],
  server: {
    port: 5173,
    proxy: { '/v1': { target: API, changeOrigin: true, ws: true } },
  },
  preview: { port: 4173, proxy: { '/v1': { target: API, changeOrigin: true, ws: true } } },
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'happy-dom', include: ['test/**/*.test.ts'] },
});
