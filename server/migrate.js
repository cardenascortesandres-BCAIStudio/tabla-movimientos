// Corre las migraciones .sql de server/migrations/ en orden. Se llama al
// arrancar el servidor (ver server/index.js); es seguro correrlo varias
// veces porque el .sql usa "if not exists".

import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, isDbConfigured } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations() {
  if (!isDbConfigured()) return;
  const pool = getPool();
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await pool.query(sql);
    console.log(`[migrate] aplicado ${file}`);
  }
}
