// Crea (o resetea la clave de) los usuarios de la plataforma. Genera una
// clave temporal por usuario y la imprime en consola — NO queda guardada en
// ningún archivo, solo en app_users (hasheada con bcrypt).
//
// Uso:
//   node scripts/seed_users.cjs            -> crea los que falten, no toca los que ya existen
//   node scripts/seed_users.cjs --reset     -> además, genera una clave NUEVA para TODOS (incluidos los que ya existían)

const crypto = require('crypto');

const USERS = [
  // 'admin': un nivel por encima de 'full' — ve todo lo que 'full' ve, más
  // el panel "👥 Usuarios" (exclusivo del creador de la plataforma).
  { username: 'andres', displayName: 'Andrés Cárdenas', role: 'admin' },
  { username: 'johana', displayName: 'Johana Gonzalez', role: 'full' },
  { username: 'planta', displayName: 'Planta', role: 'planta' },
];

function randomPassword() {
  // 10 caracteres, legible (sin 0/O/1/l confusos).
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 10 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: --commit requiere DATABASE_URL en el entorno.');
    process.exitCode = 1;
    return;
  }
  const bcrypt = require('bcryptjs');
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const reset = process.argv.includes('--reset');

  const results = [];
  for (const u of USERS) {
    const existing = await pool.query('select id from app_users where username = $1', [u.username]);
    if (existing.rows.length && !reset) {
      results.push({ ...u, password: null, status: 'ya existía (sin tocar)' });
      continue;
    }
    const password = randomPassword();
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      `insert into app_users (username, password_hash, display_name, role)
       values ($1, $2, $3, $4)
       on conflict (username) do update set password_hash = excluded.password_hash,
         display_name = excluded.display_name, role = excluded.role`,
      [u.username, hash, u.displayName, u.role]
    );
    results.push({ ...u, password, status: existing.rows.length ? 'clave reseteada' : 'creado' });
  }

  console.log('\n========================================');
  results.forEach((r) => {
    console.log(`${r.displayName} (usuario: ${r.username}, rol: ${r.role}) — ${r.status}` + (r.password ? ` — clave temporal: ${r.password}` : ''));
  });
  console.log('========================================\n');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
