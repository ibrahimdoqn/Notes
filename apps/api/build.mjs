// API'yi tek dosyalı ESM paketlerine derler; ortak paket (@camnotlar/shared) içine gömülür.
import { build } from 'esbuild';
import { cpSync, rmSync } from 'node:fs';

rmSync('dist', { recursive: true, force: true });
await build({
  entryPoints: { server: 'src/server.ts', worker: 'src/worker.ts', 'cli/admin': 'src/cli/admin.ts', 'cli/migrate': 'src/cli/migrate.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  packages: 'external',
  alias: { '@camnotlar/shared': '../../packages/shared/src/index.ts' },
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
});
// Göç dosyaları paketle birlikte taşınır.
cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
