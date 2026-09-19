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

function countryCode(league) {
  const country = String(league || '').split(':')[0].trim().toLowerCase();
  const map = {
    lithuania:'LT', bulgaria:'BG', sweden:'SE', iceland:'IS', switzerland:'CH',
    italy:'IT', england:'GB', spain:'ES', france:'FR', germany:'DE', portugal:'PT',
    netherlands:'NL', belgium:'BE', norway:'NO', denmark:'DK', finland:'FI',
    austria:'AT', poland:'PL', romania:'RO', greece:'GR', turkey:'TR', croatia:'HR',
    serbia:'RS', slovenia:'SI', slovakia:'SK', czechia:'CZ', 'czech republic':'CZ'
  };
  return map[country] || 'EU';
}

function strategyTheme(strategy) {
  const s = String(strategy || '').toUpperCase();
  if (s.includes('OVER') || s.includes('GOAL')) {
    return { a:'#38E36F', b:'#087B36', fg:'#F5FFF8', accent:'#45F17A', kind:'over' };
  }
  if (s.includes('BANCA') || s.includes('LAY') || s.includes('SEGNO')) {
    return { a:'#F6D46A', b:'#A86C0F', fg:'#181108', accent:'#F2C84B', kind:'gold' };
  }
  return { a:'#E7C45A', b:'#7C4E0A', fg:'#161006', accent:'#E8C758', kind:'gold' };
}

function teamFontSize(home, away) {
  const n = `${home} - ${away}`.length;
  if (n > 48) return 38;
  if (n > 40) return 43;
  if (n > 32) return 49;
  return 54;
}

function strategyFontSize(strategy) {
  const n = String(strategy || '').length;
  if (n > 22) return 34;
  if (n > 17) return 38;
  return 43;
}

function clockIcon(x, y, scale = 1, color = '#F4D56A') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="14"/><path d="M18 10v9l7 4"/></g>`;
}
function broadcastIcon(x, y, scale = 1, color = '#F4D56A') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"><circle cx="18" cy="18" r="3" fill="${color}" stroke="none"/><path d="M10 10a11 11 0 0 0 0 16M26 10a11 11 0 0 1 0 16M5 5a18 18 0 0 0 0 26M31 5a18 18 0 0 1 0 26"/></g>`;
}
function bellIcon(x, y, scale = 1, color = '#9E9A8E') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M10 24h16l-2-3v-7a6 6 0 0 0-12 0v7z"/><path d="M15 28c1 2 5 2 6 0"/></g>`;
}
function targetIcon(x, y, scale = 1, color = '#171108') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="12"/><circle cx="18" cy="18" r="5"/><path d="M24 12l8-8M26 4h6v6"/></g>`;
}
function barsIcon(x, y, scale = 1, color = '#F5FFF8') {
  return `<g transform="translate(${x} ${y}) scale(${scale})" fill="${color}"><rect x="4" y="22" width="6" height="10" rx="2"/><rect x="14" y="14" width="6" height="18" rx="2"/><rect x="24" y="6" width="6" height="26" rx="2"/></g>`;
}

async function createAlertCard(match, minutesLeft) {
  const width = 1080, height = 720;
  const home = escXml(match.casa || 'Casa');
  const away = escXml(match.trasferta || 'Trasferta');
  const league = escXml(match.campionato || 'Campionato');
  const strategyRaw = String(match.tipo_giocata || 'Strategia EasyBet');
  const strategy = escXml(strategyRaw.toUpperCase());
  const code = countryCode(match.campionato);
  const theme = strategyTheme(match.tipo_giocata);
  const teamSize = teamFontSize(match.casa, match.trasferta);
  const strategySize = strategyFontSize(strategyRaw);
  const start = new Date(Number(match.start_at));
  const time = Number.isFinite(start.getTime()) ? start.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Rome'}) : '';
  const mins = Math.max(0, Number(minutesLeft) || 0);
  const strategyIcon = theme.kind === 'over' ? barsIcon(109, 515, 1.32, theme.fg) : targetIcon(109, 515, 1.32, theme.fg);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#040605"/><stop offset=".5" stop-color="#07100B"/><stop offset="1" stop-color="#03110A"/>
      </linearGradient>
      <linearGradient id="goldStroke" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFF0A0"/><stop offset=".28" stop-color="#E3B83F"/><stop offset=".6" stop-color="#987016"/><stop offset="1" stop-color="#F2D266"/>
      </linearGradient>
      <linearGradient id="goldButton" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#2A1F09"/><stop offset=".48" stop-color="#13110B"/><stop offset="1" stop-color="#080907"/>
      </linearGradient>
      <linearGradient id="strat" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${theme.a}"/><stop offset=".52" stop-color="${theme.kind==='over' ? '#0FB04E' : '#DAA82B'}"/><stop offset="1" stop-color="${theme.b}"/></linearGradient>
      <linearGradient id="stratSheen" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#FFFFFF" stop-opacity=".22"/><stop offset=".35" stop-color="#FFFFFF" stop-opacity=".03"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>
      <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#236E37"/><stop offset=".35" stop-color="#14572B"/><stop offset="1" stop-color="#062013"/></linearGradient>
      <linearGradient id="stands" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1D2119"/><stop offset="1" stop-color="#050706"/></linearGradient>
      <radialGradient id="lightL" cx="30%" cy="20%" r="55%"><stop offset="0" stop-color="#FFF1A7" stop-opacity=".82"/><stop offset=".16" stop-color="#E9C052" stop-opacity=".42"/><stop offset="1" stop-color="#E9B637" stop-opacity="0"/></radialGradient>
      <radialGradient id="lightR" cx="72%" cy="18%" r="55%"><stop offset="0" stop-color="#FFF1A7" stop-opacity=".78"/><stop offset=".18" stop-color="#E9C052" stop-opacity=".38"/><stop offset="1" stop-color="#E9B637" stop-opacity="0"/></radialGradient>
      <radialGradient id="greenGlow" cx="50%" cy="75%" r="58%"><stop offset="0" stop-color="#20C968" stop-opacity=".22"/><stop offset="1" stop-color="#20C968" stop-opacity="0"/></radialGradient>
      <filter id="goldGlow"><feGaussianBlur stdDeviation="5" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="softShadow"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity=".72"/></filter>
      <filter id="textShadow"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity=".92"/></filter>
      <filter id="blur4"><feGaussianBlur stdDeviation="4"/></filter>
      <clipPath id="round"><rect width="1080" height="720" rx="40"/></clipPath>
    </defs>

    <g clip-path="url(#round)">
      <rect width="1080" height="720" fill="url(#bg)"/>

      <!-- CINEMATIC STADIUM: large and clearly visible -->
      <g>
        <path d="M0 95C170 30 350 14 540 18C740 21 914 40 1080 101V326H0Z" fill="url(#stands)"/>
        <path d="M0 224C190 170 360 153 540 155C727 157 910 177 1080 230V380H0Z" fill="#09100C" opacity=".82"/>
        <g fill="#E8BE4F" opacity=".5" filter="url(#blur4)">
          <circle cx="92" cy="180" r="2.4"/><circle cx="130" cy="202" r="2"/><circle cx="170" cy="183" r="2.3"/><circle cx="212" cy="213" r="2.1"/><circle cx="260" cy="187" r="2.5"/><circle cx="310" cy="220" r="2.1"/><circle cx="356" cy="190" r="2.3"/><circle cx="404" cy="215" r="2.2"/><circle cx="454" cy="186" r="2.3"/><circle cx="505" cy="216" r="2.1"/><circle cx="555" cy="190" r="2.4"/><circle cx="610" cy="214" r="2.1"/><circle cx="660" cy="188" r="2.3"/><circle cx="710" cy="220" r="2.1"/><circle cx="760" cy="190" r="2.4"/><circle cx="810" cy="214" r="2"/><circle cx="860" cy="188" r="2.3"/><circle cx="910" cy="216" r="2.2"/><circle cx="958" cy="189" r="2.4"/><circle cx="1006" cy="212" r="2.2"/>
        </g>
        <ellipse cx="310" cy="74" rx="245" ry="125" fill="url(#lightL)"/>
        <ellipse cx="778" cy="70" rx="250" ry="128" fill="url(#lightR)"/>
        <g fill="#FFF1A2" filter="url(#goldGlow)">
          <circle cx="226" cy="100" r="3.2"/><circle cx="246" cy="96" r="3.2"/><circle cx="266" cy="93" r="3.2"/><circle cx="286" cy="91" r="3.2"/><circle cx="306" cy="90" r="3.2"/><circle cx="326" cy="91" r="3.2"/><circle cx="346" cy="93" r="3.2"/><circle cx="366" cy="96" r="3.2"/><circle cx="386" cy="100" r="3.2"/>
          <circle cx="694" cy="100" r="3.2"/><circle cx="714" cy="96" r="3.2"/><circle cx="734" cy="93" r="3.2"/><circle cx="754" cy="91" r="3.2"/><circle cx="774" cy="90" r="3.2"/><circle cx="794" cy="91" r="3.2"/><circle cx="814" cy="93" r="3.2"/><circle cx="834" cy="96" r="3.2"/><circle cx="854" cy="100" r="3.2"/>
        </g>

        <!-- pitch perspective -->
        <path d="M0 296C248 260 832 260 1080 296V720H0Z" fill="url(#grass)"/>
        <path d="M540 296V720" stroke="#EBE8CD" stroke-opacity=".34" stroke-width="2"/>
        <ellipse cx="540" cy="405" rx="122" ry="44" fill="none" stroke="#EBE8CD" stroke-opacity=".35" stroke-width="2.2"/>
        <path d="M424 296H656V370H424Z" fill="none" stroke="#EBE8CD" stroke-opacity=".28" stroke-width="2"/>
        <path d="M482 296V334H598V296" fill="none" stroke="#EBE8CD" stroke-opacity=".28" stroke-width="2"/>
        <path d="M0 456C270 412 810 412 1080 456" fill="none" stroke="#7BCB85" stroke-opacity=".13" stroke-width="2"/>
        <rect width="1080" height="720" fill="url(#greenGlow)"/>
      </g>

      <!-- readability overlays -->
      <rect width="1080" height="720" fill="#020604" fill-opacity=".30"/>
      <path d="M0 0H1080V235C835 210 255 210 0 238Z" fill="#050706" fill-opacity=".34"/>
      <rect y="565" width="1080" height="155" fill="#020604" fill-opacity=".42"/>

      <!-- decorative gold curves -->
      <path d="M660 0C785 108 940 94 1080 60" fill="none" stroke="#D0A83A" stroke-opacity=".42" stroke-width="2"/>
      <path d="M0 530C320 465 680 575 1080 448" fill="none" stroke="#2A9A54" stroke-opacity=".33" stroke-width="2.5"/>

      <!-- double frame -->
      <rect x="18" y="18" width="1044" height="684" rx="34" fill="none" stroke="url(#goldStroke)" stroke-width="3" filter="url(#goldGlow)"/>
      <rect x="31" y="31" width="1018" height="658" rx="27" fill="none" stroke="#F2D166" stroke-opacity=".24" stroke-width="1"/>

      <!-- brand -->
      <g transform="translate(58 48)">
        <rect x="0" y="0" width="84" height="84" rx="20" fill="#0C0D0A" stroke="#DEB33E" stroke-width="2.6" filter="url(#goldGlow)"/>
        <text x="42" y="54" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="31" fill="#F3D25E">EB</text>
        <text x="110" y="36" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="48" fill="#FFFFFF">Easy<tspan fill="#E2B43D">Bet</tspan></text>
        <text x="111" y="69" font-family="Arial,Helvetica,sans-serif" font-size="18" letter-spacing="6" fill="#B0AA9F">PLAY SMARTER</text>
      </g>

      <!-- LIVE SOON -->
      <rect x="744" y="56" width="278" height="78" rx="33" fill="url(#goldButton)" stroke="#E5B944" stroke-width="2.5" filter="url(#goldGlow)"/>
      ${broadcastIcon(772,78,1.08,'#F4D56A')}
      <text x="850" y="106" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="30" fill="#F7DB73">LIVE SOON</text>

      <!-- 10 min pill -->
      <rect x="58" y="162" width="286" height="78" rx="22" fill="#11120E" fill-opacity=".92" stroke="#E2B841" stroke-width="2.4" filter="url(#goldGlow)"/>
      ${clockIcon(78,183,1.08,'#F4D56A')}
      <text x="136" y="213" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="32" fill="#F7DB73">Tra ${mins} min</text>

      <!-- league -->
      <g transform="translate(58 282)">
        <rect x="0" y="-31" width="66" height="44" rx="12" fill="#11130F" stroke="#D8B047" stroke-opacity=".56"/>
        <text x="33" y="-2" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="20" fill="#E9DFAE">${code}</text>
        <line x1="82" y1="-24" x2="82" y2="6" stroke="#DAB23D" stroke-opacity=".65"/>
        <text x="104" y="0" font-family="Arial,Helvetica,sans-serif" font-size="31" fill="#D3CEC2">${league}</text>
      </g>

      <!-- teams -->
      <text x="58" y="385" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${teamSize}" fill="#FFFFFF" filter="url(#textShadow)">${home} - ${away}</text>

      <!-- strategy CTA -->
      <rect x="58" y="462" width="964" height="128" rx="32" fill="url(#strat)" stroke="${theme.accent}" stroke-width="2.6" filter="url(#goldGlow)"/>
      <rect x="58" y="462" width="158" height="128" rx="32" fill="#071009" fill-opacity=".34"/>
      <rect x="58" y="462" width="964" height="128" rx="32" fill="url(#stratSheen)"/>
      ${strategyIcon}
      <line x1="215" y1="486" x2="215" y2="566" stroke="${theme.fg}" stroke-opacity=".28" stroke-width="2"/>
      <text x="254" y="539" font-family="Arial,Helvetica,sans-serif" font-size="${strategySize}" font-weight="900" fill="${theme.fg}" filter="url(#textShadow)">${strategy}</text>
      <line x1="926" y1="488" x2="926" y2="564" stroke="${theme.fg}" stroke-opacity=".30" stroke-width="2"/>
      <path d="M952 503l22 22-22 22M984 503l22 22-22 22" fill="none" stroke="${theme.fg}" stroke-opacity=".72" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>

      <!-- footer -->
      <line x1="58" y1="627" x2="1022" y2="627" stroke="#D7B041" stroke-opacity=".48"/>
      ${bellIcon(58,646,.82,'#D4A928')}
      <text x="105" y="673" font-family="Arial,Helvetica,sans-serif" font-size="25" fill="#D2D0C9">Nuovo alert EasyBet</text>
      ${clockIcon(858,646,.77,'#C9C9BF')}
      <text x="918" y="673" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#E1E1D8">${escXml(time)}</text>
    </g>
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
  if (!rows.length) {
    console.warn('Telegram alert: nessun iscritto presente nella tabella subscribers.');
    return 0;
  }
  if (!API_BASE) {
    console.error('Telegram alert: TELEGRAM_BOT_TOKEN non configurato.');
    return 0;
  }
  const card = await createAlertCard(match, minutesLeft);
  let sent = 0;
  for (const row of rows) {
    const result = await sendPhoto(row.chat_id, card);
    if (result && result.ok) sent++;
  }
  return sent;
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
