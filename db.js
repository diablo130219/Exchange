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
  // EasyBet non crea più le vecchie tabelle casse/bets/settings.
  // Eventuali tabelle già presenti nel database vengono lasciate intatte per sicurezza.

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
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_esito_manuale ON matches (esito_manuale);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_tipo_giocata ON matches (tipo_giocata);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_campionato ON matches (campionato);`);

  // --- Segnali Live (profili di ingresso VERDE/GIALLO/ROSSO da bookmarklet FlashScore) ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_strategy TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_favorita TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_alert_sent BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_level TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_summary TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_updated BIGINT;`);
  // --- STEP 8: stato notifiche Telegram LIVE intelligenti ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_score INTEGER;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_notified_at BIGINT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_deterioration_alert_sent BOOLEAN NOT NULL DEFAULT false;`);
  // --- STEP 30: protezione Over 1.5 FT dopo un gol arrivato mentre il segnale era ancora in attesa ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_last_goals INTEGER;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_post_goal_minute INTEGER;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_post_goal_hold_until INTEGER;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_post_goal_base_xg DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_post_goal_base_sot DOUBLE PRECISION;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_post_goal_base_shots DOUBLE PRECISION;`);

  // Colonne di un tentativo precedente (soglie semplici tiri/occasioni/corner), non più usate:
  // rimangono nel DB se già create in precedenza ma il codice non le legge più.

  // --- Sito EasyBet (gestione manuale: quota ingresso, esito, invio al bot) ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS quota_ingresso TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS esito_manuale TEXT;`); // null|'entrata_vinta'|'entrata_persa'|'non_entrata'
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS bot_enabled BOOLEAN NOT NULL DEFAULT true;`);
  // --- Import CSV esterni (STEP 43): conserva i dati originali senza usare la quota del file ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS import_source TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS import_match_id TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS diario_profit NUMERIC;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS diario_linked_at BIGINT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS diario_entry TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS import_data JSONB;`);

  // --- STEP 6: timeline PRE-MATCH → LIVE → SEGNALE → ESITO ---
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS live_started_at BIGINT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS signal_first_at BIGINT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS signal_first_level TEXT;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS signal_first_score INTEGER;`);
  await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS outcome_set_at BIGINT;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_live_started_at ON matches (live_started_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_matches_signal_first_at ON matches (signal_first_at);`);

  // --- STEP 7: snapshot del segnale VERDE ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS signal_snapshots (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL,
      strategy TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'verde',
      score100 INTEGER,
      minute INTEGER,
      score_home INTEGER,
      score_away INTEGER,
      xg_home DOUBLE PRECISION,
      xg_away DOUBLE PRECISION,
      sot_home DOUBLE PRECISION,
      sot_away DOUBLE PRECISION,
      shots_home DOUBLE PRECISION,
      shots_away DOUBLE PRECISION,
      chances_home DOUBLE PRECISION,
      chances_away DOUBLE PRECISION,
      boxshots_home DOUBLE PRECISION,
      boxshots_away DOUBLE PRECISION,
      touches_home DOUBLE PRECISION,
      touches_away DOUBLE PRECISION,
      source TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      UNIQUE (match_id, strategy, level)
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_signal_snapshots_match_id ON signal_snapshots (match_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_signal_snapshots_created_at ON signal_snapshots (created_at DESC);`);

  // --- Stemmi squadre (cache per le pagine schede) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS team_crests (
      name_norm TEXT PRIMARY KEY,
      nome_originale TEXT,
      url TEXT,
      fetched_at BIGINT NOT NULL,
      manual BOOLEAN NOT NULL DEFAULT false
    );
  `);
  await pool.query(`ALTER TABLE team_crests ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT false;`);

  // --- Diario Exchange integrato (stato JSON per periodo, privato area admin) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS exchange_periods (
      uid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      state JSONB NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_exchange_periods_start_date ON exchange_periods (start_date DESC);`);

  // --- Stemmi caricati a mano (immagine normalizzata salvata nel database) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS crest_images (
      id TEXT PRIMARY KEY,
      mime TEXT NOT NULL,
      data BYTEA NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);

  // --- Masaniello Studio integrato (stato JSON privato area admin) ---
  await pool.query(`
    CREATE TABLE IF NOT EXISTS masaniello_state (
      id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at BIGINT NOT NULL
    );
  `);
}

module.exports = { pool, migrate };
