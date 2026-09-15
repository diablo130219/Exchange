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

  // --- Avvisi Partite (Telegram) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      ora TEXT NOT NULL,
      campionato TEXT DEFAULT '',
      casa TEXT NOT NULL,
      trasferta TEXT NOT NULL,
      tipo_giocata TEXT DEFAULT '',
      start_at BIGINT NOT NULL,
      notify_minutes INTEGER NOT NULL DEFAULT 10,
      notified BOOLEAN NOT NULL DEFAULT false,
      created_at BIGINT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      chat_id TEXT PRIMARY KEY,
      username TEXT DEFAULT '',
      created_at BIGINT NOT NULL
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS alert_settings (
      id TEXT PRIMARY KEY DEFAULT 'main',
      notify_minutes INTEGER NOT NULL DEFAULT 10,
      telegram_offset BIGINT NOT NULL DEFAULT 0
    );
  `);
  await pool.query(`
    INSERT INTO alert_settings (id, notify_minutes, telegram_offset)
    VALUES ('main', 10, 0)
    ON CONFLICT (id) DO NOTHING;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_start_at ON matches (start_at);`);
}

module.exports = { pool, migrate };
