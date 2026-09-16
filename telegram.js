const { pool } = require('./db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const POLLING_ENABLED = String(process.env.TELEGRAM_POLLING_ENABLED || 'true').toLowerCase() !== 'false';

// PostgreSQL advisory lock condiviso tra tutte le istanze che usano lo stesso DB.
// In questo modo una sola istanza alla volta può eseguire getUpdates.
const TELEGRAM_POLL_LOCK_ID = 731942611;
const LEADER_RETRY_MS = 5000;
const ERROR_RETRY_MS = 3000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function apiCall(method, params, options) {
  if (!API_BASE) return Promise.resolve(null);
  const opts = options || {};
  return fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      // Il 409 su getUpdates può apparire solo se esiste un altro poller esterno
      // (per esempio un PC locale o un altro servizio che usa lo stesso token).
      // Evitiamo di martellare i log e lo trattiamo con backoff nel loop.
      if (!(method === 'getUpdates' && r.status === 409 && opts.silentConflict)) {
        console.error(`Telegram API error on ${method}:`, body.description || r.status);
      }
      return Object.assign({}, body, { _httpStatus: r.status });
    }
    return body;
  }).catch((err) => {
    console.error(`Telegram API network error on ${method}:`, err.message);
    return null;
  });
}


async function configureWebhook() {
  if (!API_BASE) return false;
  const url = String(process.env.TELEGRAM_WEBHOOK_URL || '').trim();
  if (!url) {
    console.warn('TELEGRAM_WEBHOOK_URL non impostato: webhook Telegram non configurato.');
    return false;
  }
  const params = { url, drop_pending_updates: false };
  const secret = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();
  if (secret) params.secret_token = secret;
  const result = await apiCall('setWebhook', params);
  if (result && result.ok) {
    console.log('Telegram webhook configurato su Supabase.');
    return true;
  }
  console.error('Impossibile configurare il webhook Telegram.');
  return false;
}

async function sendMessage(chatId, text) {
  return apiCall('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML' });
}

async function broadcast(text) {
  const { rows } = await pool.query('SELECT chat_id FROM subscribers');
  for (const row of rows) {
    await sendMessage(row.chat_id, text);
  }
  return rows.length;
}

async function upsertSubscriber(chatId, username) {
  await pool.query(
    `INSERT INTO subscribers (chat_id, username, created_at) VALUES ($1,$2,$3)
     ON CONFLICT (chat_id) DO UPDATE SET username = EXCLUDED.username`,
    [String(chatId), username || '', Date.now()]
  );
}

async function removeSubscriber(chatId) {
  await pool.query('DELETE FROM subscribers WHERE chat_id = $1', [String(chatId)]);
}

async function getOffset() {
  const { rows } = await pool.query("SELECT telegram_offset FROM alert_settings WHERE id='main'");
  return rows.length ? Number(rows[0].telegram_offset) || 0 : 0;
}

async function setOffset(offset) {
  await pool.query("UPDATE alert_settings SET telegram_offset = $1 WHERE id='main'", [offset]);
}

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const username = msg.from ? (msg.from.username || msg.from.first_name || '') : '';
  const text = msg.text.trim();

  if (text === '/start') {
    await upsertSubscriber(chatId, username);
    await sendMessage(chatId, "Ciao! Da ora ricevi qui gli avvisi delle partite caricate, qualche minuto prima dell'inizio.\n\nScrivi /stop per non ricevere più avvisi.");
  } else if (text === '/stop') {
    await removeSubscriber(chatId);
    await sendMessage(chatId, 'Avvisi disattivati. Scrivi /start per riattivarli quando vuoi.');
  }
}

let running = false;
let leaderClient = null;
let leaderLoopPromise = null;
let conflictLogged = false;

async function pollOnce() {
  if (!API_BASE) return { ok: false };
  const offset = await getOffset();
  const result = await apiCall(
    'getUpdates',
    { offset: offset + 1, timeout: 25 },
    { silentConflict: true }
  );

  if (result && result._httpStatus === 409) {
    return { ok: false, conflict: true };
  }
  if (!result || !result.ok || !Array.isArray(result.result)) return { ok: false };

  for (const update of result.result) {
    await handleUpdate(update);
    await setOffset(update.update_id);
  }
  return { ok: true };
}

async function releaseLeaderLock() {
  const client = leaderClient;
  leaderClient = null;
  if (!client) return;
  try {
    await client.query('SELECT pg_advisory_unlock($1)', [TELEGRAM_POLL_LOCK_ID]);
  } catch (_) {
    // La connessione può essere già chiusa durante shutdown/deploy.
  }
  try {
    client.release();
  } catch (_) {}
}

async function tryBecomeLeader() {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [TELEGRAM_POLL_LOCK_ID]);
    if (!rows[0] || !rows[0].locked) {
      client.release();
      return false;
    }

    leaderClient = client;
    client.on('error', (err) => {
      console.error('Connessione lock Telegram persa:', err.message);
      leaderClient = null;
    });
    console.log('Telegram polling: lock acquisito, questa istanza è il poller attivo.');
    return true;
  } catch (err) {
    if (client) {
      try { client.release(); } catch (_) {}
    }
    console.error('Telegram polling: impossibile acquisire il lock:', err.message);
    return false;
  }
}

async function leaderElectionLoop() {
  while (running) {
    if (!leaderClient) {
      const acquired = await tryBecomeLeader();
      if (!acquired) {
        await sleep(LEADER_RETRY_MS);
        continue;
      }
    }

    try {
      const result = await pollOnce();
      if (result && result.conflict) {
        if (!conflictLogged) {
          console.warn('Telegram polling in conflitto con un poller esterno. Controlla che lo stesso TELEGRAM_BOT_TOKEN non sia attivo su un altro servizio o PC. Riprovo automaticamente.');
          conflictLogged = true;
        }
        await sleep(LEADER_RETRY_MS);
      } else {
        conflictLogged = false;
        if (!result || !result.ok) await sleep(ERROR_RETRY_MS);
      }
    } catch (err) {
      console.error('Errore nel polling Telegram:', err.message);
      await sleep(ERROR_RETRY_MS);
    }

    // Se la connessione dedicata al lock è caduta, il lock PostgreSQL è stato
    // rilasciato automaticamente: torniamo all'elezione prima del prossimo poll.
    if (!leaderClient) {
      await sleep(1000);
    }
  }

  await releaseLeaderLock();
}

function startPolling() {
  if (!API_BASE) {
    console.warn('TELEGRAM_BOT_TOKEN non impostato: il bot non invierà né riceverà messaggi Telegram (modalità solo-registro).');
    return;
  }
  if (!POLLING_ENABLED) {
    console.log('Telegram polling disattivato tramite TELEGRAM_POLLING_ENABLED=false.');
    return;
  }
  if (running) return;
  running = true;
  leaderLoopPromise = leaderElectionLoop().catch((err) => {
    console.error('Telegram leader loop terminato:', err.message);
    running = false;
  });
}

async function stopPolling() {
  running = false;
  await releaseLeaderLock();
  try {
    await leaderLoopPromise;
  } catch (_) {}
  leaderLoopPromise = null;
}

module.exports = { sendMessage, broadcast, startPolling, stopPolling, configureWebhook, isConfigured: !!API_BASE };
