// Conexión a Postgres (Railway inyecta DATABASE_URL al añadir el plugin de
// Postgres al proyecto — eso se hace desde el dashboard de Railway, no por
// código). Si no está configurada, el pool no se crea: las rutas de Balance
// devuelven 503 en vez de tumbar todo el servidor (para que el sitio estático
// siga funcionando mientras se conecta la base de datos).

import pg from 'pg';

const { Pool } = pg;

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
  });
} else {
  console.warn('[db] DATABASE_URL no está definida — las rutas /api/balance/* responderán 503 hasta que se configure.');
}

export function isDbConfigured() {
  return pool !== null;
}

export function query(text, params) {
  if (!pool) throw new Error('DATABASE_URL no configurada');
  return pool.query(text, params);
}

export function getPool() {
  return pool;
}
