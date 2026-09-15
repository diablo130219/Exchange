const { pool } = require('./db');
const { broadcast } = require('./telegram');

const CHECK_INTERVAL_MS = 30 * 1000;
const STALE_GRACE_MS = 5 * 60 * 1000; // matches missed by more than this are skipped silently, not alerted late

function escapeHtml(s) {
  return (s == null ? '' : String(s)).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function formatAlert(m) {
  const minutesLeft = Math.max(0, Math.round((m.start_at - Date.now()) / 60000));
  const league = m.campionato ? ` (${escapeHtml(m.campionato)})` : '';
  const tipo = m.tipo_giocata ? escapeHtml(m.tipo_giocata) : '—';
  return (
    `⏰ <b>Tra ${minutesLeft} min</b>${league}\n` +
    `${escapeHtml(m.casa)} - ${escapeHtml(m.trasferta)}\n` +
    `👉 ${tipo}`
  );
}

async function checkOnce() {
  const now = Date.now();
  // notify_minutes varies per match, so fetch all not-yet-notified matches and filter precisely in JS.
  const { rows: pending } = await pool.query(`SELECT * FROM matches WHERE notified = false ORDER BY start_at ASC`);
  for (const m of pending) {
    const startAt = Number(m.start_at);
    const windowMs = Number(m.notify_minutes) * 60000;
    const dueAt = startAt - windowMs;
    if (now < dueAt) continue; // not yet time
    if (startAt - now < -STALE_GRACE_MS) {
      // missed the window by too long (e.g. server was down) — skip silently
      await pool.query('UPDATE matches SET notified = true WHERE id = $1', [m.id]);
      continue;
    }
    const text = formatAlert(m);
    const sentTo = await broadcast(text);
    await pool.query('UPDATE matches SET notified = true WHERE id = $1', [m.id]);
    console.log(`Avviso inviato per ${m.casa} - ${m.trasferta} a ${sentTo} destinatari.`);
  }
}

let running = false;

function start() {
  if (running) return;
  running = true;
  (async function loop() {
    while (running) {
      try {
        await checkOnce();
      } catch (err) {
        console.error('Errore nello scheduler avvisi:', err.message);
      }
      await new Promise((r) => setTimeout(r, CHECK_INTERVAL_MS));
    }
  })();
}

function stop() {
  running = false;
}

module.exports = { start, stop, checkOnce, formatAlert };
