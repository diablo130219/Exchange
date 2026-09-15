const { pool } = require('./db');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;

function apiCall(method, params) {
  if (!API_BASE) return Promise.resolve(null);
  return fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params || {})
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      console.error(`Telegram API error on ${method}:`, body.description || r.status);
    }
    return body;
  }).catch((err) => {
    console.error(`Telegram API network error on ${method}:`, err.message);
    return null;
  });
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

let polling = false;

async function pollOnce() {
  if (!API_BASE) return;
  const offset = await getOffset();
  const result = await apiCall('getUpdates', { offset: offset + 1, timeout: 25 });
  if (!result || !result.ok || !Array.isArray(result.result)) return;
  for (const update of result.result) {
    await handleUpdate(update);
    if (update.update_id >= offset) {
      await setOffset(update.update_id);
    }
  }
}

async function startPolling() {
  if (!API_BASE) {
    console.warn('TELEGRAM_BOT_TOKEN non impostato: il bot non invierà né riceverà messaggi Telegram (modalità solo-registro).');
    return;
  }
  if (polling) return;
  polling = true;
  (async function loop() {
    while (polling) {
      try {
        await pollOnce();
      } catch (err) {
        console.error('Errore nel polling Telegram:', err.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();
}

function stopPolling() {
  polling = false;
}

module.exports = { sendMessage, broadcast, startPolling, stopPolling, isConfigured: !!API_BASE };
