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
  const width = 1080, height = 650;
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
  const strategyIcon = theme.kind === 'over' ? barsIcon(101, 454, 1.25, theme.fg) : targetIcon(101, 454, 1.25, theme.fg);

  const svg = `
  <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#090B0A"/><stop offset=".48" stop-color="#0B0E0C"/><stop offset="1" stop-color="#07110C"/>
      </linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#FFF0A1"/><stop offset=".38" stop-color="#E0B640"/><stop offset=".7" stop-color="#AA7614"/><stop offset="1" stop-color="#F5D56D"/>
      </linearGradient>
      <linearGradient id="strat" x1="0" y1="0" x2="1" y2="0"><stop stop-color="${theme.a}"/><stop offset="1" stop-color="${theme.b}"/></linearGradient>
      <radialGradient id="glowGold" cx="82%" cy="17%" r="55%"><stop offset="0" stop-color="#E1B63E" stop-opacity=".30"/><stop offset="1" stop-color="#E1B63E" stop-opacity="0"/></radialGradient>
      <radialGradient id="glowGreen" cx="82%" cy="75%" r="48%"><stop offset="0" stop-color="#16894A" stop-opacity=".23"/><stop offset="1" stop-color="#16894A" stop-opacity="0"/></radialGradient>
      <linearGradient id="pitch" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#184B27"/><stop offset=".55" stop-color="#0A371E"/><stop offset="1" stop-color="#04170E"/></linearGradient>
      <linearGradient id="stands" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#18211B"/><stop offset="1" stop-color="#060907"/></linearGradient>
      <radialGradient id="stadiumLight" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFF3B4" stop-opacity=".95"/><stop offset=".25" stop-color="#F5D168" stop-opacity=".62"/><stop offset="1" stop-color="#E9B637" stop-opacity="0"/></radialGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="10" stdDeviation="14" flood-color="#000" flood-opacity=".62"/></filter>
      <filter id="softGlow"><feGaussianBlur stdDeviation="6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="stadiumBlur"><feGaussianBlur stdDeviation="2.5"/></filter>
    </defs>

    <rect width="1080" height="650" rx="38" fill="url(#bg)"/>
    <!-- stadium background -->
    <g opacity=".95">
      <path d="M0 0H1080V290C920 230 740 205 540 208C332 210 148 235 0 296Z" fill="#060908"/>
      <path d="M0 158C165 94 350 72 540 76C736 80 913 101 1080 160V350H0Z" fill="url(#stands)" opacity=".95"/>
      <path d="M0 255C180 216 360 202 540 204C730 205 914 223 1080 260V428H0Z" fill="#0A120E" opacity=".85"/>
      <!-- crowd lights -->
      <g fill="#E5BD54" opacity=".38" filter="url(#stadiumBlur)">
        <circle cx="130" cy="210" r="2.1"/><circle cx="162" cy="195" r="1.8"/><circle cx="194" cy="222" r="2.2"/><circle cx="236" cy="202" r="1.8"/><circle cx="278" cy="228" r="2.1"/><circle cx="320" cy="196" r="1.6"/><circle cx="365" cy="216" r="2.2"/><circle cx="408" cy="190" r="1.7"/><circle cx="452" cy="224" r="2.0"/><circle cx="498" cy="201" r="1.8"/><circle cx="548" cy="219" r="2.1"/><circle cx="598" cy="193" r="1.7"/><circle cx="650" cy="225" r="2.0"/><circle cx="705" cy="198" r="1.8"/><circle cx="760" cy="217" r="2.1"/><circle cx="815" cy="190" r="1.7"/><circle cx="866" cy="225" r="2"/><circle cx="916" cy="202" r="1.8"/><circle cx="970" cy="220" r="2.2"/>
        <circle cx="115" cy="250" r="1.7"/><circle cx="180" cy="265" r="2"/><circle cx="250" cy="245" r="1.8"/><circle cx="338" cy="260" r="2.1"/><circle cx="430" cy="247" r="1.7"/><circle cx="520" cy="266" r="2.1"/><circle cx="610" cy="248" r="1.8"/><circle cx="700" cy="264" r="2.1"/><circle cx="790" cy="246" r="1.7"/><circle cx="875" cy="263" r="2"/><circle cx="954" cy="248" r="1.8"/>
      </g>
      <!-- floodlights -->
      <ellipse cx="330" cy="116" rx="165" ry="82" fill="url(#stadiumLight)" opacity=".34"/>
      <ellipse cx="748" cy="116" rx="165" ry="82" fill="url(#stadiumLight)" opacity=".34"/>
      <g fill="#FFE99A" filter="url(#softGlow)">
        <circle cx="282" cy="104" r="3"/><circle cx="298" cy="101" r="3"/><circle cx="314" cy="100" r="3"/><circle cx="330" cy="99" r="3"/><circle cx="346" cy="100" r="3"/><circle cx="362" cy="102" r="3"/><circle cx="378" cy="105" r="3"/>
        <circle cx="702" cy="105" r="3"/><circle cx="718" cy="102" r="3"/><circle cx="734" cy="100" r="3"/><circle cx="750" cy="99" r="3"/><circle cx="766" cy="100" r="3"/><circle cx="782" cy="102" r="3"/><circle cx="798" cy="105" r="3"/>
      </g>
      <!-- pitch -->
      <path d="M0 318C230 280 844 280 1080 318V650H0Z" fill="url(#pitch)" opacity=".90"/>
      <path d="M540 318V650" stroke="#F4F1D8" stroke-opacity=".32" stroke-width="2"/>
      <ellipse cx="540" cy="401" rx="94" ry="35" fill="none" stroke="#F4F1D8" stroke-opacity=".27" stroke-width="2"/>
      <path d="M467 332H613V374H467Z" fill="none" stroke="#F4F1D8" stroke-opacity=".22" stroke-width="2"/>
      <path d="M505 332V353H575V332" fill="none" stroke="#F4F1D8" stroke-opacity=".24" stroke-width="2"/>
      <path d="M0 415C260 380 820 380 1080 415" fill="none" stroke="#62A96F" stroke-opacity=".12" stroke-width="1.5"/>
    </g>
    <!-- dark veil keeps text readable -->
    <rect width="1080" height="650" rx="38" fill="#020806" fill-opacity=".38"/>
    <rect width="1080" height="650" rx="38" fill="url(#glowGold)"/>
    <rect width="1080" height="650" rx="38" fill="url(#glowGreen)"/>
    <path d="M690 0 C790 115 920 125 1080 88" fill="none" stroke="#CFA83A" stroke-opacity=".34" stroke-width="2"/>
    <path d="M0 500 C320 420 660 545 1080 405" fill="none" stroke="#1B5A38" stroke-opacity=".34" stroke-width="3"/>
    <rect x="22" y="22" width="1036" height="606" rx="32" fill="none" stroke="url(#gold)" stroke-width="2.4"/>
    <rect x="35" y="35" width="1010" height="580" rx="26" fill="none" stroke="#F4D96E" stroke-opacity=".16" stroke-width="1"/>

    <g transform="translate(58 50)">
      <rect x="0" y="0" width="82" height="82" rx="20" fill="#17130A" stroke="#DAB13D" stroke-width="2.4" filter="url(#softGlow)"/>
      <text x="41" y="53" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="31" fill="#F3D25E">EB</text>
      <text x="105" y="35" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="46" fill="#FFFFFF">Easy<tspan fill="#E2B43D">Bet</tspan></text>
      <text x="107" y="66" font-family="Arial,Helvetica,sans-serif" font-size="18" letter-spacing="6" fill="#A8A08F">PLAY SMARTER</text>
    </g>

    <rect x="750" y="58" width="260" height="72" rx="30" fill="#12130F" stroke="#E2B841" stroke-width="2.2" filter="url(#softGlow)"/>
    ${broadcastIcon(776,76,1.0,'#F3D25E')}
    <text x="848" y="103" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="28" fill="#F6D96E">LIVE SOON</text>

    <rect x="58" y="168" width="270" height="72" rx="20" fill="#17130A" stroke="#E2B841" stroke-width="2.2"/>
    ${clockIcon(77,186,1.0,'#F3D25E')}
    <text x="130" y="213" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="31" fill="#F6D96E">Tra ${mins} min</text>

    <g transform="translate(58 276)">
      <rect x="0" y="-30" width="64" height="42" rx="12" fill="#141713" stroke="#D6B447" stroke-opacity=".42"/>
      <text x="32" y="-2" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="20" fill="#E8DDAE">${code}</text>
      <text x="82" y="0" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#BEB9AD">${league}</text>
    </g>

    <text x="58" y="368" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-size="${teamSize}" fill="#FFFFFF" filter="url(#shadow)">${home} - ${away}</text>

    <rect x="58" y="420" width="964" height="120" rx="30" fill="url(#strat)" stroke="${theme.accent}" stroke-width="2.3" filter="url(#softGlow)"/>
    <rect x="58" y="420" width="150" height="120" rx="30" fill="#090B09" fill-opacity=".34"/>
    ${strategyIcon}
    <line x1="205" y1="443" x2="205" y2="517" stroke="${theme.fg}" stroke-opacity=".24" stroke-width="2"/>
    <text x="244" y="493" font-family="Arial,Helvetica,sans-serif" font-size="${strategySize}" font-weight="900" fill="${theme.fg}">${strategy}</text>
    <path d="M945 462l18 18-18 18M972 462l18 18-18 18" fill="none" stroke="${theme.fg}" stroke-opacity=".62" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>

    <line x1="58" y1="572" x2="1022" y2="572" stroke="#D7B041" stroke-opacity=".28"/>
    ${bellIcon(58,587,.8,'#8E9088')}
    <text x="103" y="611" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#A8A69E">Nuovo alert EasyBet</text>
    ${clockIcon(858,586,.75,'#9C9F96')}
    <text x="915" y="611" font-family="Arial,Helvetica,sans-serif" font-size="27" fill="#BDBFB8">${escXml(time)}</text>
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

function countryFlag(league) {
  const country = String(league || '').split(':')[0].trim().toLowerCase();
  const map = {
    italy:'🇮🇹', england:'🏴', spain:'🇪🇸', france:'🇫🇷', germany:'🇩🇪', portugal:'🇵🇹',
    netherlands:'🇳🇱', belgium:'🇧🇪', sweden:'🇸🇪', norway:'🇳🇴', denmark:'🇩🇰', finland:'🇫🇮',
    iceland:'🇮🇸', switzerland:'🇨🇭', austria:'🇦🇹', poland:'🇵🇱', romania:'🇷🇴', greece:'🇬🇷',
    turkey:'🇹🇷', croatia:'🇭🇷', serbia:'🇷🇸', slovenia:'🇸🇮', slovakia:'🇸🇰', czechia:'🇨🇿',
    'czech republic':'🇨🇿', bulgaria:'🇧🇬', lithuania:'🇱🇹', china:'🇨🇳', japan:'🇯🇵', brazil:'🇧🇷',
    argentina:'🇦🇷', mexico:'🇲🇽', usa:'🇺🇸', 'united states':'🇺🇸', ireland:'🇮🇪',
    'republic of ireland':'🇮🇪', hungary:'🇭🇺'
  };
  return map[country] || '🏆';
}

function formatClassicAlert(match, minutesLeft) {
  const mins = Math.max(0, Number(minutesLeft) || 0);
  const league = escHtml(match.campionato || 'Campionato');
  const home = escHtml(match.casa || 'Squadra casa');
  const away = escHtml(match.trasferta || 'Squadra trasferta');
  const strategy = escHtml(String(match.tipo_giocata || 'Strategia EasyBet').toUpperCase());
  const quotaRaw = String(match.quota_ingresso == null ? '' : match.quota_ingresso).trim();
  const quota = escHtml(quotaRaw || '—');
  const flag = countryFlag(match.campionato);
  return [
    '🚨 <b>NUOVO ALERT EASYBET</b>',
    '',
    `⏰ <b>TRA ${mins} MINUTI</b>`,
    '',
    `${flag} ${league}`,
    `⚽ <b>${home} - ${away}</b>`,
    '',
    '🔥 <b>STRATEGIA</b>',
    `<b>${strategy}</b>`,
    '',
    `💰 <b>QUOTA: ${quota}</b>`,
    '',
    '✅ Attendi le condizioni live previste dalla strategia.'
  ].join('\n');
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
  const text = formatClassicAlert(match, minutesLeft);
  let sent = 0;
  for (const row of rows) {
    const result = await sendMessage(row.chat_id, text, { disable_web_page_preview: true });
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
    await sendMessage(chatId, "👑 <b>EasyBet attivato</b>\n\nDa ora riceverai gli alert pre-partita EasyBet in formato testuale.\n\nScrivi /stop per disattivarli.");
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
