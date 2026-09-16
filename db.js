const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('Manca la variabile d\'ambiente DATABASE_URL. Imposta la connection string del database Postgres.');
  process.exit(1);
}

const useSsl = process.env.PGSSL !== 'false';

// Render spesso include ?sslmode=require nella DATABASE_URL. Poiché configuriamo
// già SSL esplicitamente, rimuoviamo i parametri SSL dalla URL per evitare il
// warning di pg/pg-connection-string e mantenere un comportamento non ambiguo.
function normalizedDatabaseUrl(raw) {
  try {
    const u = new URL(raw);
    ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'].forEach((k) => u.searchParams.delete(k));
    return u.toString();
  } catch (_) {
    return raw;
  }
}

const pool = new Pool({
  connectionString: normalizedDatabaseUrl(process.env.DATABASE_URL),
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

  // --- Segnali Live (profili di ingresso VERDE/GIALLO/ROSSO da bookmarklet FlashScore) ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_strategy TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_favorita TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_alert_sent BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_level TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_summary TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_updated BIGINT;`);
  // Colonne di un tentativo precedente (soglie semplici tiri/occasioni/corner), non più usate:
  // rimangono nel DB se già create in precedenza ma il codice non le legge più.

  // --- Sito EasyBet (gestione manuale: quota ingresso, esito, invio al bot) ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS quota_ingresso TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS esito_manuale TEXT;`); // null|'entrata_vinta'|'entrata_persa'|'non_entrata'
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT true;`);

  // --- Stemmi squadre (cache per le pagine schede) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_crests (
      name_norm TEXT PRIMARY KEY,
      nome_originale TEXT,
      url TEXT,
      fetched_at BIGINT NOT NULL
    );
  `);
}

module.exports = { pool, migrate };
