import { defineConfig, devices } from '@playwright/test';

/**
 * Uçtan uca testler gerçek API'ye (PostgreSQL) karşı çalışır.
 * Önce: npm run build -w @camnotlar/api && npm run build -w @camnotlar/web
 * E2E_DATABASE_URL boş bir test veritabanını göstermeli (global-setup sıfırlar).
 */
const DB = process.env.E2E_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/camnotlar_e2e';
const API_PORT = 3100;
const WEB_PORT = 4174;
const executablePath = process.env.PW_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'off',
    launchOptions: { executablePath },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: { executablePath } }, testIgnore: /mobile\.spec\.ts/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions: { executablePath } }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'node e2e/reset-db.mjs && node ../api/dist/server.js',
      port: API_PORT,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: DB, PORT: String(API_PORT), HOST: '127.0.0.1', ALLOW_SIGNUP: 'true', HIBP_CHECK: 'false',
        SECURE_COOKIES: 'false', LOG_LEVEL: 'warn',
      },
    },
    {
      command: `npx vite preview --port ${WEB_PORT} --strictPort`,
      port: WEB_PORT,
      reuseExistingServer: false,
      env: { API_URL: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
