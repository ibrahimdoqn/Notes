// E2E veritabanını sıfırlar; API sunucusu başlamadan önce çalışır (şemayı API kendisi kurar).
import pg from 'pg';

const url = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/camnotlar_e2e';
const name = new URL(url).pathname.slice(1);
if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`geçersiz veritabanı adı: ${name}`);
const admin = new pg.Client({ connectionString: url.replace(/\/[^/]*$/, '/postgres') });
await admin.connect();
await admin.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
await admin.query(`CREATE DATABASE ${name}`);
await admin.end();
