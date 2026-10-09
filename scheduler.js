const { pool } = require('./db');
const { broadcastAlert, broadcastClassicDaily } = require('./telegram');

const CHECK_INTERVAL_MS = 30 * 1000;
const FIXED_NOTIFY_MINUTES = 10;
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

function romeParts(ts) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone:'Europe/Rome', year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', hourCycle:'h23'
  }).formatToParts(new Date(ts));
  const o = {}; parts.forEach(p => { if (p.type !== 'literal') o[p.type] = p.value; });
  return { key:o.year+'-'+o.month+'-'+o.day, hour:Number(o.hour), minute:Number(o.minute) };
}
function romeDateLabel(ts) {
  return new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date(ts));
}
async function checkClassicDaily(now) {
  const rp = romeParts(now);
  if (rp.hour < 7 || (rp.hour === 7 && rp.minute < 30)) return;
  const already = await pool.query('SELECT 1 FROM classic_daily_notifications WHERE date_key=$1 LIMIT 1',[rp.key]);
  if (already.rows.length) return;
  const { rows } = await pool.query(`SELECT * FROM matches WHERE COALESCE(betting_area,'live')='classic' ORDER BY start_at ASC`);
  // Nel Betting classico il toggle "su Telegram" decide quali partite
  // includere nel riepilogo unico delle 07:30.
  // Considera attive tutte le partite Betting classico tranne quelle esplicitamente disattivate.
  // Importante: se alle 07:30 non ci sono ancora partite, NON marchiamo la giornata come inviata.
  // In questo modo, se il CSV viene importato poco dopo o il server si riavvia, il riepilogo puo' ancora partire.
  const todays = rows.filter(m => romeParts(Number(m.start_at)).key === rp.key && m.bot_enabled !== false);
  if (!todays.length) {
    console.log(`Riepilogo Betting classico ${rp.key}: nessuna partita abilitata trovata, nessun invio marcato.`);
    return;
  }
  const sent = await broadcastClassicDaily(todays, romeDateLabel(now));
  if (sent > 0) {
    await pool.query('INSERT INTO classic_daily_notifications(date_key,sent_at) VALUES($1,$2) ON CONFLICT(date_key) DO NOTHING',[rp.key,now]);
    console.log(`Riepilogo Betting classico ${rp.key} inviato alle 07:30 a ${sent} destinatari.`);
  }
}

async function checkOnce() {
  const now = Date.now();
  await checkClassicDaily(now);
  // notify_minutes varies per match, so fetch all not-yet-notified matches and filter precisely in JS.
  // Exchange Live: solo area LIVE, sempre 10 minuti prima. Il Betting classico viene gestito
  // esclusivamente dal riepilogo giornaliero delle 07:30 e non entra mai in questo flusso.
  const { rows: pending } = await pool.query(`SELECT * FROM matches WHERE notified = false AND bot_enabled = true AND COALESCE(betting_area,'live') = 'live' ORDER BY start_at ASC`);
  for (const m of pending) {
    const startAt = Number(m.start_at);
    const dueAt = startAt - (FIXED_NOTIFY_MINUTES * 60000);
    if (now < dueAt) continue; // not yet time: alert is fixed at 10 minutes before kickoff

    if (startAt - now < -STALE_GRACE_MS) {
      // missed the window by too long (e.g. server was down) — skip silently
      await pool.query(
        'UPDATE matches SET notified = true WHERE id = $1 AND notified = false',
        [m.id]
      );
      continue;
    }

    // IMPORTANT: claim the notification atomically BEFORE sending it.
    // This prevents duplicate sends if the internal scheduler and the external cron
    // run at the same time, or if multiple app instances call checkOnce concurrently.
    const { rows: claimed } = await pool.query(
      `UPDATE matches
       SET notified = true
       WHERE id = $1
         AND notified = false
         AND bot_enabled = true
       RETURNING id`,
      [m.id]
    );

    if (!claimed.length) {
      continue; // another worker already claimed/sent this alert
    }

    try {
      const sentTo = await broadcastAlert(m, FIXED_NOTIFY_MINUTES);
      if (sentTo > 0) {
        console.log(`Avviso 10 minuti inviato UNA SOLA VOLTA per ${m.casa} - ${m.trasferta} a ${sentTo} destinatari.`);
      } else {
        // No successful Telegram delivery: release the claim so a later check can retry.
        await pool.query('UPDATE matches SET notified = false WHERE id = $1', [m.id]);
        console.warn(`Avviso NON inviato per ${m.casa} - ${m.trasferta}: nessun invio Telegram riuscito. Verrà ritentato.`);
      }
    } catch (err) {
      // Sending failed after claiming: allow a future retry.
      await pool.query('UPDATE matches SET notified = false WHERE id = $1', [m.id]);
      throw err;
    }
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

module.exports = { start, stop, checkOnce, checkClassicDaily, formatAlert };
