const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Manca la variabile d\'ambiente DATABASE_URL. Imposta la connection string del database Postgres.');
  process.exit(1);
}

const useSsl = process.env.PGSSL !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false
});

async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS casse (
      id TEXT PRIMARY KEY,
      nome TEXT NOT NULL,
      saldo_iniziale NUMERIC NOT NULL DEFAULT 0,
      created_at BIGINT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bets (
      id TEXT PRIMARY KEY,
      cassa_id TEXT REFERENCES casse(id) ON DELETE CASCADE,
      data TEXT,
      ora TEXT,
      campionato TEXT,
      casa TEXT,
      trasferta TEXT,
      strategia TEXT,
      tipo TEXT,
      quota TEXT,
      importo TEXT,
      commissione NUMERIC,
      ht TEXT,
      ft TEXT,
      esito TEXT,
      created_at BIGINT
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY DEFAULT 'main',
      strategia TEXT,
      tipo TEXT,
      commissione NUMERIC
    );
  `);
}

module.exports = { pool, migrate };
