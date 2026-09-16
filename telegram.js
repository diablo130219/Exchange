const { pool } = require('./db');
const sharp = require('sharp');

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = TOKEN ? `https://api.telegram.org/bot${TOKEN}` : null;
const POLLING_ENABLED = String(process.env.TELEGRAM_POLLING_ENABLED || 'true').toLowerCase() !== 'false';
const PUBLIC_SITE_URL = process.env.PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || 'https://exchange-igc1.onrender.com';

const TELEGRAM_POLL_LOCK_ID = 731942611;
const LEADER_RETRY_MS = 5000;
const ERROR_RETRY_MS = 3000;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function escHtml(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function escXml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c])); }

function apiCall(method, params, options) {
  if (!API_BASE) return Promise.resolve(null);
  const opts = options || {};
  return fetch(`${API_BASE}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(params || {})
  }).then(async (r) => {
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) {
      if (!(method === 'getUpdates' && r.status === 409 && opts.silentConflict)) {
        console.error(`Telegram API error on ${method}:`, body.description || r.status);
      }
      return Object.assign({}, body, { _httpStatus: r.status });
    }
    return body;
  }).catch((err) => { console.error(`Telegram API network error on ${method}:`, err.message); return null; });
}

async function sendMessage(chatId, text, extra) {
  return apiCall('sendMessage', Object.assign({ chat_id: chatId, text, parse_mode: 'HTML' }, extra || {}));
}

function countryFlag(league) {
  const country = String(league || '').split(':')[0].trim().toLowerCase();
  const map = {
    lithuania:'🇱🇹', bulgaria:'🇧🇬', sweden:'🇸🇪', iceland:'🇮🇸', switzerland:'🇨🇭',
    italy:'🇮🇹', england:'🏴', spain:'🇪🇸', france:'🇫🇷', germany:'🇩🇪', portugal:'🇵🇹',
    netherlands:'🇳🇱', belgium:'🇧🇪', norway:'🇳🇴', denmark:'🇩🇰', finland:'🇫🇮',
    austria:'🇦🇹', poland:'🇵🇱', romania:'🇷🇴', greece:'🇬🇷', turkey:'🇹🇷', croatia:'🇭🇷',
    serbia:'🇷🇸', slovenia:'🇸🇮', slovakia:'🇸🇰', czechia:'🇨🇿', 'czech republic':'🇨🇿'
  };
  return map[country] || '⚽';
}

function strategyTheme(strategy) {
  const s = String(strategy || '').toUpperCase();
  if (s.includes('BANCA') || s.includes('LAY')) return { a:'#f8d65f', b:'#ad7612', fg:'#161006', icon:'◆' };
  if (s.includes('OVER')) return { a:'#42f47a', b:'#0b6f36', fg:'#f4fff7', icon:'▥' };
  return { a:'#d8b54a', b:'#76500f', fg:'#ffffff', icon:'●' };
}

function teamFontSize(home, away) {
  const n = `${home} - ${away}`.length;
  if (n > 42) return 42;
  if (n > 34) return 48;
  return 56;
}

async function createAlertCard(match, minutesLeft) {
  const width = 1080, height = 610;
  const home = escXml(match.casa || 'Casa');
  const away = escXml(match.trasferta || 'Trasferta');
  const league = escXml(match.campionato || 'Campionato');
  const strategy = escXml(match.tipo_giocata || 'Strategia EasyBet');
  const flag = countryFlag(match.campionato);
  const theme = strategyTheme(match.tipo_giocata);
  const teamSize = teamFontSize(match.casa, match.trasferta);
  const start = new Date(Number(match.start_at));
  const time = Number.isFinite(start.getTime()) ? start.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}) : '';
  const mins = Math.max(0, Number(minutesLeft) || 0);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#07110f"/><stop offset="1" stop-color="#030504"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#fff1a2"/><stop offset=".45" stop-color="#d9aa2f"/><stop offset="1" stop-color="#8b5c0a"/></linearGradient>
      <linearGradient id="strat" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${theme.a}"/><stop offset="1" stop-color="${theme.b}"/></linearGradient>
      <radialGradient id="glow"><stop offset="0" stop-color="#d8ad3d" stop-opacity=".25"/><stop offset="1" stop-color="#d8ad3d" stop-opacity="0"/></radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity=".55"/></filter>
    </defs>
    <rect width="1080" height="610" rx="34" fill="url(#bg)"/>
    <circle cx="890" cy="150" r="280" fill="url(#glow)"/>
    <path d="M0 430 C250 350 510 470 1080 330 L1080 610 L0 610Z" fill="#082313" opacity=".72"/>
    <path d="M0 470 C300 400 650 510 1080 400" stroke="#2d7b45" stroke-width="3" opacity=".35" fill="none"/>
    <g opacity=".28" stroke="#f0c64e" fill="none"><path d="M820 30 L1080 180"/><path d="M900 0 L1080 105"/><path d="M870 610 L1080 490"/></g>
    <rect x="24" y="24" width="1032" height="562" rx="30" fill="none" stroke="url(#gold)" stroke-width="2"/>

    <g transform="translate(58 52)">
      <rect x="0" y="0" width="74" height="74" rx="18" fill="#17130a" stroke="#d9aa2f" stroke-width="2"/>
      <text x="37" y="49" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="28" fill="#f5d66b">EB</text>
      <text x="96" y="31" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="42" fill="#ffffff">Easy<tspan fill="#e2b43d">Bet</tspan></text>
      <text x="98" y="58" font-family="Arial,Helvetica,sans-serif" font-size="18" letter-spacing="5" fill="#a9a18e">PLAY SMARTER</text>
    </g>

    <rect x="58" y="160" width="252" height="64" rx="18" fill="#17130a" stroke="#e1b941" stroke-width="2"/>
    <text x="82" y="203" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="31" fill="#f5d66b">⏰ Tra ${mins} min</text>
    <rect x="832" y="160" width="164" height="54" rx="18" fill="#13140e" stroke="#e1b941" stroke-width="2"/>
    <text x="914" y="195" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="22" fill="#f5d66b">LIVE SOON</text>

    <text x="58" y="278" font-family="Arial,Helvetica,sans-serif" font-size="31" fill="#bcb7aa">${flag}  ${league}</text>
    <text x="58" y="352" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${teamSize}" fill="#ffffff" filter="url(#shadow)">${home} - ${away}</text>

    <rect x="58" y="392" width="780" height="104" rx="24" fill="url(#strat)" stroke="${theme.a}" stroke-width="2"/>
    <rect x="58" y="392" width="118" height="104" rx="24" fill="#07110f" fill-opacity=".42"/>
    <text x="117" y="458" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="46" font-weight="900" fill="${theme.fg}">${theme.icon}</text>
    <text x="202" y="459" font-family="Arial,Helvetica,sans-serif" font-size="43" font-weight="900" fill="${theme.fg}">${strategy}</text>

    <text x="58" y="550" font-family="Arial,Helvetica,sans-serif" font-size="25" fill="#d9d5ca">⚽  Nuovo alert EasyBet</text>
    <text x="995" y="550" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#ffffff">🕒 ${escXml(time)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function sendPhoto(chatId, photoBuffer, caption, replyMarkup) {
  if (!API_BASE) return null;
  const form = new FormData();
  form.append('chat_id', String(chatId));
  form.append('photo', new Blob([photoBuffer], { type: 'image/png' }), 'easybet-alert.png');
  if (caption) form.append('caption', caption);
  form.append('parse_mode', 'HTML');
  if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
  try {
    const r = await fetch(`${API_BASE}/sendPhoto`, { method:'POST', body:form });
    const body = await r.json().catch(() => ({}));
    if (!r.ok || body.ok === false) console.error('Telegram API error on sendPhoto:', body.description || r.status);
    return body;
  } catch (err) {
    console.error('Telegram API network error on sendPhoto:', err.message);
    return null;
  }
}

async function broadcast(text) {
  const { rows } = await pool.query('SELECT chat_id FROM subscribers');
  for (const row of rows) await sendMessage(row.chat_id, text);
  return rows.length;
}

async function broadcastAlert(match, minutesLeft) {
  const { rows } = await pool.query('SELECT chat_id FROM subscribers');
  const card = await createAlertCard(match, minutesLeft);
  for (const row of rows) {
    await sendPhoto(row.chat_id, card);
  }
  return rows.length;
}

async function upsertSubscriber(chatId, username) {
  await pool.query(`INSERT INTO subscribers (chat_id, username, created_at) VALUES ($1,$2,$3) ON CONFLICT (chat_id) DO UPDATE SET username = EXCLUDED.username`, [String(chatId), username || '', Date.now()]);
}
async function removeSubscriber(chatId) { await pool.query('DELETE FROM subscribers WHERE chat_id = $1', [String(chatId)]); }
async function getOffset() { const { rows } = await pool.query("SELECT telegram_offset FROM alert_settings WHERE id='main'"); return rows.length ? Number(rows[0].telegram_offset) || 0 : 0; }
async function setOffset(offset) { await pool.query("UPDATE alert_settings SET telegram_offset = $1 WHERE id='main'", [offset]); }

async function handleUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text) return;
  const chatId = msg.chat.id;
  const username = msg.from ? (msg.from.username || msg.from.first_name || '') : '';
  const text = msg.text.trim();
  if (text === '/start') {
    await upsertSubscriber(chatId, username);
    await sendMessage(chatId, "👑 <b>EasyBet attivato</b>\n\nDa ora riceverai gli alert pre-partita con card grafiche EasyBet.\n\nScrivi /stop per disattivarli.");
  } else if (text === '/stop') {
    await removeSubscriber(chatId);
    await sendMessage(chatId, 'Avvisi disattivati. Scrivi /start per riattivarli quando vuoi.');
  }
}

let running = false, leaderClient = null, leaderLoopPromise = null, conflictLogged = false;
async function pollOnce() {
  if (!API_BASE) return { ok:false };
  const offset = await getOffset();
  const result = await apiCall('getUpdates', { offset: offset + 1, timeout:25 }, { silentConflict:true });
  if (result && result._httpStatus === 409) return { ok:false, conflict:true };
  if (!result || !result.ok || !Array.isArray(result.result)) return { ok:false };
  for (const update of result.result) { await handleUpdate(update); await setOffset(update.update_id); }
  return { ok:true };
}
async function releaseLeaderLock() {
  const client = leaderClient; leaderClient = null; if (!client) return;
  try { await client.query('SELECT pg_advisory_unlock($1)', [TELEGRAM_POLL_LOCK_ID]); } catch (_) {}
  try { client.release(); } catch (_) {}
}
async function tryBecomeLeader() {
  let client;
  try {
    client = await pool.connect();
    const { rows } = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [TELEGRAM_POLL_LOCK_ID]);
    if (!rows[0] || !rows[0].locked) { client.release(); return false; }
    leaderClient = client;
    client.on('error', (err) => { console.error('Connessione lock Telegram persa:', err.message); leaderClient = null; });
    console.log('Telegram polling: lock acquisito, questa istanza è il poller attivo.');
    return true;
  } catch (err) {
    if (client) try { client.release(); } catch (_) {}
    console.error('Telegram polling: impossibile acquisire il lock:', err.message); return false;
  }
}
async function leaderElectionLoop() {
  while (running) {
    if (!leaderClient) { const acquired = await tryBecomeLeader(); if (!acquired) { await sleep(LEADER_RETRY_MS); continue; } }
    try {
      const result = await pollOnce();
      if (result && result.conflict) {
        if (!conflictLogged) { console.warn('Telegram polling in conflitto con un poller esterno.'); conflictLogged = true; }
        await sleep(LEADER_RETRY_MS);
      } else { conflictLogged = false; if (!result || !result.ok) await sleep(ERROR_RETRY_MS); }
    } catch (err) { console.error('Errore nel polling Telegram:', err.message); await sleep(ERROR_RETRY_MS); }
    if (!leaderClient) await sleep(1000);
  }
  await releaseLeaderLock();
}
function startPolling() {
  if (!API_BASE) { console.warn('TELEGRAM_BOT_TOKEN non impostato.'); return; }
  if (!POLLING_ENABLED) { console.log('Telegram polling disattivato tramite TELEGRAM_POLLING_ENABLED=false.'); return; }
  if (running) return;
  running = true;
  leaderLoopPromise = leaderElectionLoop().catch((err) => { console.error('Telegram leader loop terminato:', err.message); running = false; });
}
async function stopPolling() { running = false; await releaseLeaderLock(); try { await leaderLoopPromise; } catch (_) {} leaderLoopPromise = null; }

module.exports = { sendMessage, broadcast, broadcastAlert, createAlertCard, startPolling, stopPolling, isConfigured: !!API_BASE };
