const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pool, migrate } = require('./db');
const telegram = require('./telegram');
const scheduler = require('./scheduler');
const liveStrategie = require('./strategie-live');

const app = express();
app.set('trust proxy', 1);
app.use(express.json());

// ---------- sicurezza Admin ----------
// L'admin non si affida piu' a un PIN salvato nel browser: il PIN viene verificato
// sul server tramite ADMIN_PIN e, dopo il login, viene emesso un cookie HttpOnly
// firmato e valido per un periodo limitato.
const ADMIN_COOKIE = 'easybet_admin';
const ADMIN_SESSION_MS = Math.max(15 * 60 * 1000, Number(process.env.ADMIN_SESSION_HOURS || 12) * 60 * 60 * 1000);
const ADMIN_PIN = String(process.env.ADMIN_PIN || '');
const ADMIN_SESSION_SECRET = String(process.env.ADMIN_SESSION_SECRET || ADMIN_PIN || 'easybet-change-me');
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const adminLoginAttempts = new Map();

function safeEqualText(a, b) {
  const aa = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (aa.length !== bb.length) return false;
  return crypto.timingSafeEqual(aa, bb);
}
function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}
function signAdminSession(exp) {
  return crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(String(exp)).digest('hex');
}
function makeAdminToken() {
  const exp = Date.now() + ADMIN_SESSION_MS;
  return exp + '.' + signAdminSession(exp);
}
function validAdminToken(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return false;
  const exp = Number(parts[0]);
  if (!Number.isFinite(exp) || exp <= Date.now()) return false;
  return safeEqualText(parts[1], signAdminSession(exp));
}
function adminCookieOptions(req) {
  const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=' + Math.floor(ADMIN_SESSION_MS / 1000),
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}
function clearAdminCookie(req) {
  const secure = req.secure || String(req.headers['x-forwarded-proto'] || '').toLowerCase() === 'https';
  return [
    ADMIN_COOKIE + '=', 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0', secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}
function requireAdmin(req, res, next) {
  if (!ADMIN_PIN) return res.status(503).json({ error: 'ADMIN_PIN non configurato sul server.' });
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Accesso admin richiesto.' });
  next();
}
function loginKey(req) {
  return String(req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
}
function loginAllowed(req) {
  const key = loginKey(req), now = Date.now();
  const rec = adminLoginAttempts.get(key);
  if (!rec || now - rec.startedAt > ADMIN_LOGIN_WINDOW_MS) { adminLoginAttempts.set(key, { startedAt: now, count: 0 }); return true; }
  return rec.count < ADMIN_LOGIN_MAX_ATTEMPTS;
}
function noteFailedLogin(req) {
  const key = loginKey(req), now = Date.now();
  let rec = adminLoginAttempts.get(key);
  if (!rec || now - rec.startedAt > ADMIN_LOGIN_WINDOW_MS) rec = { startedAt: now, count: 0 };
  rec.count += 1; adminLoginAttempts.set(key, rec);
}
function clearFailedLogin(req) { adminLoginAttempts.delete(loginKey(req)); }

app.get('/api/admin/status', (req, res) => {
  const configured = !!ADMIN_PIN;
  const authenticated = configured && validAdminToken(parseCookies(req)[ADMIN_COOKIE]);
  res.json({ configured, authenticated, sessionHours: Math.round(ADMIN_SESSION_MS / 3600000 * 10) / 10 });
});
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PIN) return res.status(503).json({ error: 'Configura ADMIN_PIN nelle variabili ambiente del server.' });
  if (!loginAllowed(req)) return res.status(429).json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' });
  const pin = String((req.body || {}).pin || '');
  if (!safeEqualText(pin, ADMIN_PIN)) { noteFailedLogin(req); return res.status(401).json({ error: 'PIN errato.' }); }
  clearFailedLogin(req);
  res.setHeader('Set-Cookie', ADMIN_COOKIE + '=' + encodeURIComponent(makeAdminToken()) + '; ' + adminCookieOptions(req));
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearAdminCookie(req));
  res.json({ ok: true });
});
// La pagina pubblica (easybet.html) è la home del sito: il Taccuino (index.html) contiene
// dati personali (saldo, casse, giocate) ed è raggiungibile solo direttamente, dietro PIN.
app.use(express.static(path.join(__dirname, 'public'), { index: 'easybet.html' }));

function newId() {
  return crypto.randomUUID();
}

// ---------- mappers: DB row (snake_case) <-> API/client shape (camelCase) ----------
function cassaOut(row) {
  return {
    id: row.id,
    nome: row.nome,
    saldoIniziale: row.saldo_iniziale === null ? 0 : Number(row.saldo_iniziale),
    createdAt: Number(row.created_at)
  };
}
function betOut(row) {
  return {
    id: row.id,
    cassaId: row.cassa_id,
    data: row.data || '',
    ora: row.ora || '',
    campionato: row.campionato || '',
    casa: row.casa || '',
    trasferta: row.trasferta || '',
    tipo: row.tipo || 'lay',
    quota: row.quota === null ? '' : row.quota,
    importo: row.importo === null ? '' : row.importo,
    commissione: row.commissione === null ? 0 : Number(row.commissione),
    esito: row.esito || 'aperta',
    createdAt: Number(row.created_at)
  };
}
function settingsOut(row) {
  if (!row) return { tipo: 'lay', commissione: 4.5 };
  return {
    tipo: row.tipo || 'lay',
    commissione: row.commissione === null ? 4.5 : Number(row.commissione)
  };
}
function matchOut(row) {
  return {
    id: row.id,
    data: row.data,
    ora: row.ora,
    campionato: row.campionato || '',
    casa: row.casa,
    trasferta: row.trasferta,
    tipoGiocata: row.tipo_giocata || '',
    startAt: Number(row.start_at),
    notifyMinutes: Number(row.notify_minutes),
    notified: !!row.notified,
    createdAt: Number(row.created_at),
    liveStrategy: row.live_strategy || '',
    liveFavorita: row.live_favorita || '',
    liveAlertSent: !!row.live_alert_sent,
    liveLastLevel: row.live_last_level || '',
    liveLastSummary: row.live_last_summary || '',
    liveLastUpdated: row.live_last_updated === null || row.live_last_updated === undefined ? null : Number(row.live_last_updated),
    liveLastScore: row.live_last_score === null || row.live_last_score === undefined ? null : Number(row.live_last_score),
    liveLastNotifiedAt: row.live_last_notified_at === null || row.live_last_notified_at === undefined ? null : Number(row.live_last_notified_at),
    liveDeteriorationAlertSent: !!row.live_deterioration_alert_sent,
    quotaIngresso: row.quota_ingresso || '',
    esitoManuale: row.esito_manuale || '',
    botEnabled: row.bot_enabled === false ? false : true,
    liveStartedAt: row.live_started_at === null || row.live_started_at === undefined ? null : Number(row.live_started_at),
    signalFirstAt: row.signal_first_at === null || row.signal_first_at === undefined ? null : Number(row.signal_first_at),
    signalFirstLevel: row.signal_first_level || '',
    signalFirstScore: row.signal_first_score === null || row.signal_first_score === undefined ? null : Number(row.signal_first_score),
    outcomeSetAt: row.outcome_set_at === null || row.outcome_set_at === undefined ? null : Number(row.outcome_set_at)
  };
}
function escapeHtmlLite(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function normTeamName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function teamNamesMatch(a, b) {
  const na = normTeamName(a), nb = normTeamName(b);
  if (!na || !nb) return false;
  return na === nb || na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
}
function alertSettingsOut(row) {
  if (!row) return { notifyMinutes: 10 };
  return { notifyMinutes: Number(row.notify_minutes) || 10 };
}


// ---------- statistiche performance pronostici ----------
function perfPct(n, d) { return d ? Math.round((Number(n) / Number(d)) * 1000) / 10 : 0; }
function perfQuota(v) {
  const n = Number(String(v == null ? '' : v).replace(',', '.').trim());
  return Number.isFinite(n) && n > 1 ? n : null;
}
function perfOutcome(v) {
  v = String(v || '').trim();
  return ['entrata_vinta', 'entrata_persa', 'non_entrata'].includes(v) ? v : '';
}
function perfStrategyLabel(v) {
  const raw = String(v || '').trim();
  const s = raw.toUpperCase().replace(',', '.');
  if (/OVER\s*1\.?5/.test(s)) return 'OVER 1.5 FT';
  if (/OVER\s*0\.?5\s*(HT|1T)/.test(s)) return 'OVER 0.5 HT';
  if (/BANCA\s*(LA\s*)?X|LAY\s*X/.test(s)) return 'BANCA LA X';
  if (/SEGNA\s*(LA\s*)?FAVORITA|FAVORITA/.test(s)) return 'SEGNA LA FAVORITA';
  if (/SEGNO\s*1|\b1\b/.test(s)) return 'SEGNO 1';
  return raw || 'Senza strategia';
}
function perfDateKeyRome(ms) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(Number(ms)));
    const m = Object.fromEntries(parts.map(p => [p.type, p.value]));
    return `${m.year}-${m.month}-${m.day}`;
  } catch (_) {
    return new Date(Number(ms)).toISOString().slice(0, 10);
  }
}
function perfAccumulator(label) {
  return { label, total: 0, entered: 0, wins: 0, losses: 0, skipped: 0, quotaSum: 0, quotaCount: 0 };
}
function perfAdd(acc, row) {
  const outcome = perfOutcome(row.esito_manuale);
  if (!outcome) return;
  acc.total++;
  if (outcome === 'entrata_vinta') { acc.wins++; acc.entered++; }
  else if (outcome === 'entrata_persa') { acc.losses++; acc.entered++; }
  else if (outcome === 'non_entrata') acc.skipped++;
  if (outcome !== 'non_entrata') {
    const q = perfQuota(row.quota_ingresso);
    if (q != null) { acc.quotaSum += q; acc.quotaCount++; }
  }
}
function perfFinish(acc) {
  return {
    label: acc.label,
    total: acc.total,
    entered: acc.entered,
    wins: acc.wins,
    losses: acc.losses,
    skipped: acc.skipped,
    winRate: perfPct(acc.wins, acc.entered),
    entryRate: perfPct(acc.entered, acc.total),
    skipRate: perfPct(acc.skipped, acc.total),
    avgQuota: acc.quotaCount ? Math.round((acc.quotaSum / acc.quotaCount) * 100) / 100 : null
  };
}
function perfGroup(rows, keyFn) {
  const map = new Map();
  rows.forEach(row => {
    if (!perfOutcome(row.esito_manuale)) return;
    const key = String(keyFn(row) || 'Senza dato').trim() || 'Senza dato';
    if (!map.has(key)) map.set(key, perfAccumulator(key));
    perfAdd(map.get(key), row);
  });
  return Array.from(map.values()).map(perfFinish).sort((a, b) => b.total - a.total || b.entered - a.entered || a.label.localeCompare(b.label));
}
function perfPeriod(rows, fromMs, label) {
  const a = perfAccumulator(label);
  rows.forEach(row => { if (Number(row.start_at) >= fromMs) perfAdd(a, row); });
  return perfFinish(a);
}

// ---------- public matches feed (lightweight: used by EasyBet public page) ----------
app.get('/api/matches', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM matches ORDER BY start_at ASC');
    res.json({ matches: rows.map(matchOut) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel caricamento delle partite.' });
  }
});


// ---------- statistiche performance aggregate (calcolate dal DB, nessun dato duplicato) ----------
app.get('/api/performance-stats', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, data, campionato, casa, trasferta, tipo_giocata, start_at, quota_ingresso, esito_manuale
      FROM matches
      WHERE esito_manuale IS NOT NULL AND esito_manuale <> ''
      ORDER BY start_at ASC
    `);
    const now = Date.now();
    const overallAcc = perfAccumulator('Totale');
    rows.forEach(row => perfAdd(overallAcc, row));
    const overall = perfFinish(overallAcc);
    const periods = {
      today: perfPeriod(rows.filter(r => perfDateKeyRome(r.start_at) === perfDateKeyRome(now)), 0, 'Oggi'),
      last7: perfPeriod(rows, now - 7 * 86400000, 'Ultimi 7 giorni'),
      last30: perfPeriod(rows, now - 30 * 86400000, 'Ultimi 30 giorni'),
      all: overall
    };
    const byStrategy = perfGroup(rows, r => perfStrategyLabel(r.tipo_giocata));
    const byLeague = perfGroup(rows, r => r.campionato || 'Senza campionato');
    const dailyMap = new Map();
    rows.forEach(row => {
      const outcome = perfOutcome(row.esito_manuale);
      if (!outcome) return;
      const key = perfDateKeyRome(row.start_at);
      if (!dailyMap.has(key)) dailyMap.set(key, perfAccumulator(key));
      perfAdd(dailyMap.get(key), row);
    });
    const daily = Array.from(dailyMap.values()).map(perfFinish).sort((a,b) => a.label.localeCompare(b.label)).slice(-60);
    res.json({ generatedAt: now, overall, periods, byStrategy, byLeague, daily });
  } catch (err) {
    console.error('performance-stats:', err);
    res.status(500).json({ error: 'Errore nel calcolo delle statistiche performance.' });
  }
});

// ---------- combined state (used for initial load + polling sync) ----------
app.get('/api/state', async (req, res) => {
  try {
    const [casseRes, betsRes, settingsRes, matchesRes, alertSettingsRes, subsRes] = await Promise.all([
      pool.query('SELECT * FROM casse ORDER BY created_at ASC'),
      pool.query('SELECT * FROM bets ORDER BY created_at ASC'),
      pool.query("SELECT * FROM settings WHERE id='main'"),
      pool.query('SELECT * FROM matches ORDER BY start_at ASC'),
      pool.query("SELECT * FROM alert_settings WHERE id='main'"),
      pool.query('SELECT COUNT(*)::int AS n FROM subscribers')
    ]);
    res.json({
      casse: casseRes.rows.map(cassaOut),
      bets: betsRes.rows.map(betOut),
      settings: settingsOut(settingsRes.rows[0]),
      matches: matchesRes.rows.map(matchOut),
      alertSettings: alertSettingsOut(alertSettingsRes.rows[0]),
      subscriberCount: subsRes.rows[0] ? subsRes.rows[0].n : 0,
      botConfigured: telegram.isConfigured
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel caricamento dei dati.' });
  }
});


// ---------- GoalDir / BSD live statistics (free REST API) ----------
const GOALDIR_API_KEY = String(process.env.GOALDIR_API_KEY || process.env.BSD_API_KEY || '').trim();
const GOALDIR_BASE = 'https://sports.bzzoiro.com/api/v2';

function gdNormName(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(fc|cf|afc|sc|ac|club|calcio|football|futbol|fk|sk|u19|u20|u21|u23)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function gdTokens(s) { return gdNormName(s).split(' ').filter(Boolean); }
function gdNameScore(a, b) {
  const na = gdNormName(a), nb = gdNormName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.92;
  const aa = new Set(gdTokens(a)), bb = new Set(gdTokens(b));
  let inter = 0;
  aa.forEach(x => { if (bb.has(x)) inter++; });
  const denom = Math.max(aa.size, bb.size, 1);
  return inter / denom;
}
function gdEventTeamName(ev, side) {
  const direct = ev && ev[side];
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') return direct.name || direct.short_name || direct.team_name || '';
  const obj = ev && (ev[side + '_team'] || ev[side + 'Team']);
  if (typeof obj === 'string') return obj;
  if (obj && typeof obj === 'object') return obj.name || obj.short_name || obj.team_name || '';
  return (ev && (ev[side + '_name'] || ev[side + 'Name'])) || '';
}
function gdEventId(ev) { return ev && (ev.id || ev.event_id || ev.eventId); }
function gdPick(obj, keys) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) {
    if (Object.prototype.hasOwnProperty.call(obj, k) && obj[k] !== null && obj[k] !== undefined && obj[k] !== '') {
      const v = obj[k];
      if (typeof v === 'object' && v) {
        if (v.actual !== undefined && v.actual !== null) return Number(v.actual);
        if (v.value !== undefined && v.value !== null) return Number(v.value);
      }
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}
async function gdFetch(pathname, timeoutMs = 9000) {
  if (!GOALDIR_API_KEY) {
    const e = new Error('GOALDIR_API_KEY non configurata.'); e.code = 'NO_GOALDIR_KEY'; throw e;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(GOALDIR_BASE + pathname, {
      headers: { 'Authorization': 'Token ' + GOALDIR_API_KEY, 'Accept': 'application/json' },
      signal: controller.signal
    });
    const bodyText = await r.text();
    let data = null;
    try { data = bodyText ? JSON.parse(bodyText) : null; } catch (_) { data = { raw: bodyText }; }
    if (!r.ok) {
      const e = new Error((data && (data.detail || data.error || data.message)) || ('GoalDir HTTP ' + r.status));
      e.status = r.status; e.payload = data; throw e;
    }
    return { data, rate: r.headers.get('ratelimit') || '', policy: r.headers.get('ratelimit-policy') || '' };
  } finally { clearTimeout(timer); }
}
function gdNormalizeStats(statsData) {
  const bag = (statsData && statsData.stats) || statsData || {};
  const h = bag.home || {}, a = bag.away || {};
  const pair = (keys) => [gdPick(h, keys), gdPick(a, keys)];
  let xgotH = null, xgotA = null;
  if (Array.isArray(statsData && statsData.shotmap)) {
    let hs = 0, as = 0, hc = 0, ac = 0;
    for (const sh of statsData.shotmap) {
      if (!sh || sh.xgot === null || sh.xgot === undefined) continue;
      const v = Number(sh.xgot); if (!Number.isFinite(v)) continue;
      if (sh.home === true) { hs += v; hc++; } else if (sh.home === false) { as += v; ac++; }
    }
    if (hc) xgotH = Math.round(hs * 100) / 100;
    if (ac) xgotA = Math.round(as * 100) / 100;
  }
  const out = {
    xg: pair(['xg','expected_goals']),
    xgot: [xgotH, xgotA],
    possession: pair(['ball_possession','possession']),
    shots: pair(['total_shots','shots_total']),
    sot: pair(['shots_on_target','shots_on_goal']),
    big: pair(['big_chances','big_chances_created']),
    corners: pair(['corner_kicks','corners']),
    boxshots: pair(['shots_inside_box','shots_in_box']),
    touches: pair(['touches_in_box','touches_in_opposition_box','touches_opposition_box']),
    xa: pair(['expected_assists','xa']),
    blocked: pair(['blocked_shots','shots_blocked']),
    saves: pair(['goalkeeper_saves','saves']),
    off: pair(['shots_off_target']),
    offsides: pair(['offsides'])
  };
  return out;
}
function gdLiveMinute(ev) {
  const v = ev && (ev.current_minute ?? (ev.time && ev.time.minute) ?? ev.minute);
  const n = Number(v); return Number.isFinite(n) ? n : null;
}
function gdStatusText(ev) {
  if (!ev || typeof ev !== 'object') return '';
  const vals = [ev.status, ev.status_text, ev.statusText, ev.state, ev.phase, ev.period, ev.stage];
  for (const v of vals) {
    if (v == null) continue;
    if (typeof v === 'string' || typeof v === 'number') {
      const t = String(v).trim(); if (t) return t;
    }
    if (typeof v === 'object') {
      for (const k of ['name','type','description','label','short_name','shortName','code']) {
        if (v[k] != null && String(v[k]).trim()) return String(v[k]).trim();
      }
    }
  }
  return '';
}
function gdIsHalftime(ev) {
  const s = gdStatusText(ev).toLowerCase().replace(/[_-]+/g, ' ').trim();
  return s === 'ht' || s === 'half time' || s === 'halftime' || s === 'intervallo' || s.includes('half time') || s.includes('halftime');
}
function gdLiveScore(ev) {
  const h = ev && (ev.home_score ?? (ev.score && ev.score.home));
  const a = ev && (ev.away_score ?? (ev.score && ev.score.away));
  return (h !== null && h !== undefined && a !== null && a !== undefined) ? String(h) + '-' + String(a) : '';
}
function gdIncidentItems(data) {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== 'object') return [];
  for (const k of ['incidents','results','events','items','timeline']) {
    if (Array.isArray(data[k])) return data[k];
  }
  return [];
}
function gdIncidentType(it) {
  return String((it && (it.type ?? it.incident_type ?? it.incidentType ?? it.kind ?? it.event_type ?? it.eventType ?? it.name)) || '').toLowerCase();
}
function gdIncidentMinute(it) {
  if (!it || typeof it !== 'object') return null;
  const direct = it.minute ?? it.min ?? it.match_minute ?? it.matchMinute ?? (it.time && (it.time.minute ?? it.time.min));
  const n = Number(direct);
  if (Number.isFinite(n) && n >= 0) return n;
  const ps = Number(it.period_second ?? it.periodSecond ?? it.second ?? it.seconds);
  if (!Number.isFinite(ps) || ps < 0) return null;
  let base = 0;
  const p = String(it.period ?? it.period_name ?? it.periodName ?? '').toLowerCase();
  if (p.includes('second') || p === '2' || p === '2h' || p.includes('2nd')) base = 45;
  else if (p.includes('extra') && (p.includes('second') || p.includes('2'))) base = 105;
  else if (p.includes('extra')) base = 90;
  return base + Math.floor(ps / 60);
}
function gdFirstGoalMinute(incidentsData, statsData) {
  const mins = [];
  for (const it of gdIncidentItems(incidentsData)) {
    const t = gdIncidentType(it);
    const isGoal = t === 'goal' || t.includes('goal') || it.goal === true || it.is_goal === true || it.isGoal === true;
    const isShootout = t.includes('shootout') || String(it.situation || it.sit || '').toLowerCase().includes('shootout');
    if (!isGoal || isShootout) continue;
    const m = gdIncidentMinute(it);
    if (Number.isFinite(m)) mins.push(m);
  }
  if (Array.isArray(statsData && statsData.shotmap)) {
    for (const sh of statsData.shotmap) {
      if (!sh) continue;
      const type = String(sh.type || '').toLowerCase();
      const sit = String(sh.sit || sh.situation || '').toLowerCase();
      if (type !== 'goal' || sit.includes('shootout')) continue;
      const m = Number(sh.min ?? sh.minute);
      if (Number.isFinite(m) && m >= 0) mins.push(m);
    }
  }
  return mins.length ? Math.min(...mins) : null;
}


app.get('/api/goaldir/status', async (req, res) => {
  res.json({ configured: !!GOALDIR_API_KEY, provider: 'GoalDir / BSD', mode: 'REST', pollSeconds: 60 });
});

app.get('/api/goaldir/live-stats', async (req, res) => {
  const home = String(req.query.home || '').trim();
  const away = String(req.query.away || '').trim();
  if (!home || !away) return res.status(400).json({ error: 'Squadre mancanti.' });
  if (!GOALDIR_API_KEY) return res.status(503).json({ code: 'NO_GOALDIR_KEY', error: 'GOALDIR_API_KEY non configurata sul server.' });
  try {
    const liveResp = await gdFetch('/events/live/');
    const payload = liveResp.data;
    const events = Array.isArray(payload) ? payload : (Array.isArray(payload && payload.results) ? payload.results : (Array.isArray(payload && payload.events) ? payload.events : []));
    let best = null, bestScore = 0;
    for (const ev of events) {
      const eh = gdEventTeamName(ev, 'home'), ea = gdEventTeamName(ev, 'away');
      const direct = (gdNameScore(home, eh) + gdNameScore(away, ea)) / 2;
      const swapped = (gdNameScore(home, ea) + gdNameScore(away, eh)) / 2;
      const score = Math.max(direct, swapped * 0.92);
      if (score > bestScore) { bestScore = score; best = ev; }
    }
    if (!best || bestScore < 0.44) {
      return res.status(404).json({
        code: 'MATCH_NOT_FOUND',
        error: 'Partita non trovata nel feed live GoalDir oppure competizione non coperta.',
        liveCount: events.length,
        sample: events.slice(0, 8).map(ev => ({ id: gdEventId(ev), home: gdEventTeamName(ev,'home'), away: gdEventTeamName(ev,'away'), minute: gdLiveMinute(ev) }))
      });
    }
    const eventId = gdEventId(best);
    if (!eventId) return res.status(502).json({ error: 'Evento GoalDir senza ID.' });
    const statsResp = await gdFetch('/events/' + encodeURIComponent(eventId) + '/stats/');
    let incidentsData = null;
    try {
      const incidentsResp = await gdFetch('/events/' + encodeURIComponent(eventId) + '/incidents/');
      incidentsData = incidentsResp.data || null;
    } catch (incErr) {
      // Alcune competizioni possono non esporre la timeline: in quel caso usiamo lo shotmap.
      console.warn('GoalDir incidents non disponibili per evento', eventId, incErr && incErr.message ? incErr.message : incErr);
    }
    const normalized = gdNormalizeStats(statsResp.data || {});
    const firstGoalMinute = gdFirstGoalMinute(incidentsData, statsResp.data || {});
    res.json({
      ok: true,
      provider: 'GoalDir / BSD',
      eventId,
      matchScore: Math.round(bestScore * 100) / 100,
      home: gdEventTeamName(best,'home'),
      away: gdEventTeamName(best,'away'),
      minute: gdLiveMinute(best),
      score: gdLiveScore(best),
      isHalftime: gdIsHalftime(best),
      liveStatus: gdStatusText(best),
      firstGoalMinute,
      earlyGoalBefore25: firstGoalMinute !== null && firstGoalMinute < 25,
      stats: normalized,
      xgEstimated: statsResp.data && statsResp.data.xg_estimated === true,
      hasShotmap: Array.isArray(statsResp.data && statsResp.data.shotmap) && statsResp.data.shotmap.length > 0,
      hasMomentum: Array.isArray(statsResp.data && statsResp.data.momentum) && statsResp.data.momentum.length > 0,
      rateLimit: statsResp.rate || liveResp.rate || ''
    });
  } catch (err) {
    console.error('GoalDir live stats:', err);
    const status = err.status && Number.isFinite(Number(err.status)) ? Number(err.status) : (err.code === 'NO_GOALDIR_KEY' ? 503 : 502);
    res.status(status).json({ code: err.code || 'GOALDIR_ERROR', error: err.message || 'Errore GoalDir.' });
  }
});

// ---------- casse ----------
app.post('/api/casse', async (req, res) => {
  try {
    const { nome, saldoIniziale } = req.body || {};
    if (!nome || !String(nome).trim()) return res.status(400).json({ error: 'Nome cassa mancante.' });
    const id = newId();
    const createdAt = Date.now();
    const saldo = isNaN(parseFloat(saldoIniziale)) ? 0 : parseFloat(saldoIniziale);
    const { rows } = await pool.query(
      'INSERT INTO casse (id, nome, saldo_iniziale, created_at) VALUES ($1,$2,$3,$4) RETURNING *',
      [id, String(nome).trim(), saldo, createdAt]
    );
    res.status(201).json(cassaOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nella creazione della cassa.' });
  }
});

app.patch('/api/casse/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    if (Object.prototype.hasOwnProperty.call(fields, 'nome')) {
      sets.push('nome = $' + (i++)); vals.push(String(fields.nome).trim());
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'saldoIniziale')) {
      var s = parseFloat(fields.saldoIniziale); if (isNaN(s)) s = 0;
      sets.push('saldo_iniziale = $' + (i++)); vals.push(s);
    }
    if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
    if (shouldRearmPrematch) {
      sets.push('notified = $' + (i++)); vals.push(false);
      sets.push('notify_minutes = $' + (i++)); vals.push(10);
    }
    vals.push(id);
    const { rows } = await pool.query(
      'UPDATE casse SET ' + sets.join(', ') + ' WHERE id = $' + i + ' RETURNING *',
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Cassa non trovata.' });
    res.json(cassaOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'aggiornamento della cassa.' });
  }
});

// Deleting a cassa cascades to its bets via the ON DELETE CASCADE foreign key,
// so this is a single atomic statement — no orphaned bets can be left behind.
app.delete('/api/casse/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM casse WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Cassa non trovata.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'eliminazione della cassa.' });
  }
});

// ---------- bets ----------
const BET_FIELDS = ['cassaId','data','ora','campionato','casa','trasferta','tipo','quota','importo','commissione','esito'];
const BET_COLUMNS = { cassaId:'cassa_id', data:'data', ora:'ora', campionato:'campionato', casa:'casa', trasferta:'trasferta', tipo:'tipo', quota:'quota', importo:'importo', commissione:'commissione', esito:'esito' };

app.post('/api/bets', async (req, res) => {
  try {
    const b = req.body || {};
    const id = newId();
    const createdAt = b.createdAt || Date.now();
    const cols = ['id','created_at'];
    const placeholders = ['$1','$2'];
    const vals = [id, createdAt];
    let i = 3;
    BET_FIELDS.forEach(function(f){
      cols.push(BET_COLUMNS[f]);
      placeholders.push('$' + (i++));
      var v = b[f];
      if (f === 'commissione') v = (v === '' || v == null) ? 0 : Number(v);
      vals.push(v == null ? '' : v);
    });
    const { rows } = await pool.query(
      'INSERT INTO bets (' + cols.join(',') + ') VALUES (' + placeholders.join(',') + ') RETURNING *',
      vals
    );
    res.status(201).json(betOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nella creazione della giocata.' });
  }
});

app.patch('/api/bets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    BET_FIELDS.forEach(function(f){
      if (Object.prototype.hasOwnProperty.call(fields, f)) {
        var v = fields[f];
        if (f === 'commissione') v = (v === '' || v == null) ? 0 : Number(v);
        sets.push(BET_COLUMNS[f] + ' = $' + (i++));
        vals.push(v == null ? '' : v);
      }
    });
    if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
    vals.push(id);
    const { rows } = await pool.query(
      'UPDATE bets SET ' + sets.join(', ') + ' WHERE id = $' + i + ' RETURNING *',
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Giocata non trovata.' });
    res.json(betOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'aggiornamento della giocata.' });
  }
});

app.delete('/api/bets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { rowCount } = await pool.query('DELETE FROM bets WHERE id = $1', [id]);
    if (!rowCount) return res.status(404).json({ error: 'Giocata non trovata.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'eliminazione della giocata.' });
  }
});

// ---------- settings ----------
app.put('/api/settings', async (req, res) => {
  try {
    const { tipo, commissione } = req.body || {};
    const { rows } = await pool.query(
      `INSERT INTO settings (id, tipo, commissione) VALUES ('main', $1, $2)
       ON CONFLICT (id) DO UPDATE SET
         tipo = COALESCE(EXCLUDED.tipo, settings.tipo),
         commissione = COALESCE(EXCLUDED.commissione, settings.commissione)
       RETURNING *`,
      [tipo != null ? tipo : null, commissione != null ? Number(commissione) : null]
    );
    res.json(settingsOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel salvataggio delle impostazioni.' });
  }
});

// ---------- avvisi partite (Telegram) ----------
app.post('/api/matches', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.casa || !b.trasferta) return res.status(400).json({ error: 'Squadre mancanti.' });
    if (!b.startAt || isNaN(Number(b.startAt))) return res.status(400).json({ error: 'Data/ora non valida.' });
    const id = newId();
    const createdAt = Date.now();
    const notifyMinutes = 10;
    const botEnabled = b.botEnabled === false ? false : true;
    const { rows } = await pool.query(
      `INSERT INTO matches (id, data, ora, campionato, casa, trasferta, tipo_giocata, start_at, notify_minutes, notified, created_at, quota_ingresso, esito_manuale, bot_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13) RETURNING *`,
      [id, b.data || '', b.ora || '', b.campionato || '', b.casa, b.trasferta, b.tipoGiocata || '', Number(b.startAt), notifyMinutes, createdAt, b.quotaIngresso || '', b.esitoManuale || null, botEnabled]
    );
    res.status(201).json(matchOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nella creazione della partita.' });
  }
});

app.patch('/api/matches/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const fields = req.body || {};
    const sets = [];
    const vals = [];
    let i = 1;
    if (Object.prototype.hasOwnProperty.call(fields, 'tipoGiocata')) {
      sets.push('tipo_giocata = $' + (i++)); vals.push(String(fields.tipoGiocata || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'notifyMinutes')) {
      sets.push('notify_minutes = $' + (i++)); vals.push(10);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'notified')) {
      sets.push('notified = $' + (i++)); vals.push(!!fields.notified);
    }
    const shouldRearmPrematch =
      !Object.prototype.hasOwnProperty.call(fields, 'notified') &&
      (
        Object.prototype.hasOwnProperty.call(fields, 'startAt') ||
        Object.prototype.hasOwnProperty.call(fields, 'data') ||
        Object.prototype.hasOwnProperty.call(fields, 'ora') ||
        (Object.prototype.hasOwnProperty.call(fields, 'botEnabled') && fields.botEnabled === true)
      );
    if (Object.prototype.hasOwnProperty.call(fields, 'liveStrategy')) {
      const v = String(fields.liveStrategy || '').trim();
      sets.push('live_strategy = $' + (i++)); vals.push(v && liveStrategie.STRATEGIE[v] ? v : null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'liveFavorita')) {
      const v = String(fields.liveFavorita || '').trim();
      sets.push('live_favorita = $' + (i++)); vals.push(v === 'casa' || v === 'trasferta' ? v : null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'liveAlertSent')) {
      sets.push('live_alert_sent = $' + (i++)); vals.push(!!fields.liveAlertSent);
      // Riarmare l'avviso azzera anche l'ultimo stato mostrato in dashboard
      if (!fields.liveAlertSent) {
        sets.push('live_last_level = $' + (i++)); vals.push(null);
        sets.push('live_last_summary = $' + (i++)); vals.push(null);
        sets.push('live_last_updated = $' + (i++)); vals.push(null);
        sets.push('live_last_score = $' + (i++)); vals.push(null);
        sets.push('live_last_notified_at = $' + (i++)); vals.push(null);
        sets.push('live_deterioration_alert_sent = $' + (i++)); vals.push(false);
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'casa')) {
      sets.push('casa = $' + (i++)); vals.push(String(fields.casa || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'trasferta')) {
      sets.push('trasferta = $' + (i++)); vals.push(String(fields.trasferta || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'campionato')) {
      sets.push('campionato = $' + (i++)); vals.push(String(fields.campionato || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'data')) {
      sets.push('data = $' + (i++)); vals.push(String(fields.data || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'ora')) {
      sets.push('ora = $' + (i++)); vals.push(String(fields.ora || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'startAt')) {
      const sa = Number(fields.startAt);
      if (!isNaN(sa)) { sets.push('start_at = $' + (i++)); vals.push(sa); }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'quotaIngresso')) {
      sets.push('quota_ingresso = $' + (i++)); vals.push(String(fields.quotaIngresso || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'esitoManuale')) {
      const v = String(fields.esitoManuale || '').trim();
      const valid = ['entrata_vinta', 'entrata_persa', 'non_entrata'];
      const isValidOutcome = valid.indexOf(v) !== -1;
      sets.push('esito_manuale = $' + (i++)); vals.push(isValidOutcome ? v : null);
      sets.push('outcome_set_at = $' + (i++)); vals.push(isValidOutcome ? Date.now() : null);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'botEnabled')) {
      sets.push('bot_enabled = $' + (i++)); vals.push(!!fields.botEnabled);
    }

    // If kickoff date/time is edited (or Telegram is explicitly re-enabled),
    // re-arm the 10-minute pre-match notification.
    if (shouldRearmPrematch) {
      sets.push('notified = $' + (i++)); vals.push(false);
      sets.push('notify_minutes = $' + (i++)); vals.push(10);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
    vals.push(id);
    const { rows } = await pool.query(
      'UPDATE matches SET ' + sets.join(', ') + ' WHERE id = $' + i + ' RETURNING *',
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Partita non trovata.' });

    // Run an immediate check after changing kickoff time. If the match is
    // already in the 10-minute window, the Telegram alert can leave now
    // instead of waiting for the next scheduler loop.
    if (shouldRearmPrematch) {
      scheduler.checkOnce().catch(function(err){
        console.error('Errore controllo immediato Telegram dopo modifica orario:', err.message);
      });
    }

    res.json(matchOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'aggiornamento della partita.' });
  }
});

// STEP 9 — azioni di massa Admin
app.post('/api/matches/bulk', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    const ids = Array.isArray(b.ids) ? [...new Set(b.ids.map(String).filter(Boolean))] : [];
    if (!ids.length) return res.status(400).json({ error: 'Nessuna partita selezionata.' });
    if (ids.length > 300) return res.status(400).json({ error: 'Troppe partite selezionate in una sola operazione.' });

    const action = String(b.action || 'update').toLowerCase();
    if (action === 'delete') {
      const { rowCount } = await pool.query('DELETE FROM matches WHERE id = ANY($1::text[])', [ids]);
      return res.json({ ok: true, deleted: rowCount, ids });
    }

    if (action !== 'update') return res.status(400).json({ error: 'Azione di massa non valida.' });
    const fields = b.fields || {};
    const sets = [];
    const vals = [];
    let i = 1;

    if (Object.prototype.hasOwnProperty.call(fields, 'tipoGiocata')) {
      sets.push('tipo_giocata = $' + (i++));
      vals.push(String(fields.tipoGiocata || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'quotaIngresso')) {
      sets.push('quota_ingresso = $' + (i++));
      vals.push(String(fields.quotaIngresso || ''));
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'botEnabled')) {
      const enabled = !!fields.botEnabled;
      sets.push('bot_enabled = $' + (i++)); vals.push(enabled);
      if (enabled) {
        sets.push('notified = $' + (i++)); vals.push(false);
        sets.push('notify_minutes = $' + (i++)); vals.push(10);
      }
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'esitoManuale')) {
      const v = String(fields.esitoManuale || '').trim();
      const valid = ['entrata_vinta', 'entrata_persa', 'non_entrata'];
      const ok = valid.includes(v);
      sets.push('esito_manuale = $' + (i++)); vals.push(ok ? v : null);
      sets.push('outcome_set_at = $' + (i++)); vals.push(ok ? Date.now() : null);
    }

    if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
    vals.push(ids);
    const { rows } = await pool.query(
      'UPDATE matches SET ' + sets.join(', ') + ' WHERE id = ANY($' + i + '::text[]) RETURNING *',
      vals
    );

    if (Object.prototype.hasOwnProperty.call(fields, 'botEnabled') && fields.botEnabled === true) {
      scheduler.checkOnce().catch(function(err){
        console.error('Errore controllo immediato Telegram dopo modifica massiva:', err.message);
      });
    }
    res.json({ ok: true, updated: rows.length, matches: rows.map(matchOut) });
  } catch (err) {
    console.error('bulk matches:', err);
    res.status(500).json({ error: 'Errore nell’operazione di massa.' });
  }
});

// STEP 6 — traccia il passaggio PRE-MATCH → LIVE → SEGNALE → ESITO
app.post('/api/matches/:id/lifecycle', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const event = String((req.body || {}).event || '').trim().toLowerCase();
    const now = Date.now();
    if (event === 'live') {
      const { rows } = await pool.query(
        'UPDATE matches SET live_started_at = COALESCE(live_started_at, $1) WHERE id = $2 RETURNING *',
        [now, id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Partita non trovata.' });
      return res.json(matchOut(rows[0]));
    }
    if (event === 'signal') {
      const score = Number((req.body || {}).score);
      const level = String((req.body || {}).level || 'verde').trim().toLowerCase();
      const { rows } = await pool.query(
        `UPDATE matches SET
          live_started_at = COALESCE(live_started_at, $1),
          signal_first_at = COALESCE(signal_first_at, $1),
          signal_first_level = COALESCE(signal_first_level, $2),
          signal_first_score = COALESCE(signal_first_score, $3)
         WHERE id = $4 RETURNING *`,
        [now, level || 'verde', Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null, id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Partita non trovata.' });
      if ((level || 'verde') === 'verde') {
        const resultForSnapshot = { level: 'verde', score100: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null, summary: String((req.body || {}).summary || '') };
        await saveSignalSnapshot(rows[0], resultForSnapshot, (req.body || {}).snapshot || {}, String((req.body || {}).source || 'analyzer'), now);
      }
      return res.json(matchOut(rows[0]));
    }
    return res.status(400).json({ error: 'Evento lifecycle non valido.' });
  } catch (err) {
    console.error('lifecycle:', err);
    res.status(500).json({ error: 'Errore nel tracciamento lifecycle.' });
  }
});

app.delete('/api/matches/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Partita non trovata.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'eliminazione della partita.' });
  }
});

app.post('/api/matches/:id/test-alert', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM matches WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Partita non trovata.' });
    const text = scheduler.formatAlert(rows[0]);
    const sentTo = await telegram.broadcast('🔔 <i>Prova avviso</i>\n\n' + text);
    res.json({ sentTo });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'invio della prova.' });
  }
});

// ---------- segnali live (bookmarklet da FlashScore) ----------
// Endpoint pubblico con CORS aperto: il bookmarklet gira sul dominio di FlashScore,
// quindi il browser fa una richiesta cross-origin verso questo server.
app.options('/api/live-stats', function(req, res) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

app.get('/api/live-stats', async (req, res) => {
  // Usato dal bookmarklet solo per un rapido controllo "sto parlando col server giusto?"
  res.header('Access-Control-Allow-Origin', '*');
  res.json({ ok: true });
});

function numOrNull(v) {
  const n = Number(v);
  return v === null || v === undefined || v === '' || isNaN(n) ? null : n;
}

function scorePairFromAny(value) {
  if (value && typeof value === 'object') {
    const h = numOrNull(value.home ?? value.homeScore ?? value.scoreHome);
    const a = numOrNull(value.away ?? value.awayScore ?? value.scoreAway);
    if (h !== null || a !== null) return [h, a];
  }
  const m = String(value == null ? '' : value).match(/(\d+)\s*[-:]\s*(\d+)/);
  return m ? [Number(m[1]), Number(m[2])] : [null, null];
}

function pairFromSnapshot(obj, key) {
  const v = obj && obj[key];
  if (Array.isArray(v)) return [numOrNull(v[0]), numOrNull(v[1])];
  if (v && typeof v === 'object') return [numOrNull(v.home ?? v[0]), numOrNull(v.away ?? v[1])];
  return [null, null];
}

async function saveSignalSnapshot(match, result, snapshot, source, createdAt) {
  if (!match || !match.id || !result || String(result.level || '').toLowerCase() !== 'verde') return null;
  const snap = snapshot || {};
  const scorePair = scorePairFromAny(snap.score || { home: snap.scoreHome, away: snap.scoreAway });
  const xg = pairFromSnapshot(snap, 'xg'), sot = pairFromSnapshot(snap, 'sot'), shots = pairFromSnapshot(snap, 'shots');
  const chances = pairFromSnapshot(snap, 'chances'), boxshots = pairFromSnapshot(snap, 'boxshots'), touches = pairFromSnapshot(snap, 'touches');
  const strategy = String(match.live_strategy || match.tipo_giocata || result.label || '').trim();
  const level = 'verde';
  const at = Number(createdAt) || Date.now();
  const vals = [
    newId(), match.id, at, strategy, level, result.score100 == null ? null : Number(result.score100),
    numOrNull(snap.minute), scorePair[0], scorePair[1],
    xg[0], xg[1], sot[0], sot[1], shots[0], shots[1], chances[0], chances[1],
    boxshots[0], boxshots[1], touches[0], touches[1], String(source || snap.source || '').trim(), String(result.summary || snap.summary || '').trim()
  ];
  const { rows } = await pool.query(`
    INSERT INTO signal_snapshots (
      id, match_id, created_at, strategy, level, score100, minute, score_home, score_away,
      xg_home, xg_away, sot_home, sot_away, shots_home, shots_away, chances_home, chances_away,
      boxshots_home, boxshots_away, touches_home, touches_away, source, summary
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
    ON CONFLICT (match_id, strategy, level) DO NOTHING
    RETURNING *
  `, vals);
  return rows[0] || null;
}

function signalSnapshotOut(row) {
  if (!row) return null;
  return {
    id: row.id, matchId: row.match_id, createdAt: Number(row.created_at), strategy: row.strategy || '', level: row.level || '',
    score100: row.score100 == null ? null : Number(row.score100), minute: row.minute == null ? null : Number(row.minute),
    scoreHome: row.score_home == null ? null : Number(row.score_home), scoreAway: row.score_away == null ? null : Number(row.score_away),
    xg: [row.xg_home == null ? null : Number(row.xg_home), row.xg_away == null ? null : Number(row.xg_away)],
    sot: [row.sot_home == null ? null : Number(row.sot_home), row.sot_away == null ? null : Number(row.sot_away)],
    shots: [row.shots_home == null ? null : Number(row.shots_home), row.shots_away == null ? null : Number(row.shots_away)],
    chances: [row.chances_home == null ? null : Number(row.chances_home), row.chances_away == null ? null : Number(row.chances_away)],
    boxshots: [row.boxshots_home == null ? null : Number(row.boxshots_home), row.boxshots_away == null ? null : Number(row.boxshots_away)],
    touches: [row.touches_home == null ? null : Number(row.touches_home), row.touches_away == null ? null : Number(row.touches_away)],
    source: row.source || '', summary: row.summary || ''
  };
}

app.get('/api/matches/:id/signal-snapshots', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM signal_snapshots WHERE match_id = $1 ORDER BY created_at ASC', [req.params.id]);
    res.json(rows.map(signalSnapshotOut));
  } catch (err) {
    console.error('signal snapshots:', err);
    res.status(500).json({ error: 'Errore nel recupero degli snapshot del segnale.' });
  }
});

app.post('/api/live-stats', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const b = req.body || {};
    const casa = String(b.casa || '').trim();
    const trasferta = String(b.trasferta || '').trim();
    if (!casa || !trasferta) return res.status(400).json({ error: 'Squadre mancanti.' });

    const payload = {
      scoreHome: numOrNull(b.scoreHome), scoreAway: numOrNull(b.scoreAway),
      xgHome: numOrNull(b.xgHome), xgAway: numOrNull(b.xgAway),
      sotHome: numOrNull(b.sotHome), sotAway: numOrNull(b.sotAway),
      chancesHome: numOrNull(b.chancesHome), chancesAway: numOrNull(b.chancesAway),
      shotsHome: numOrNull(b.shotsHome), shotsAway: numOrNull(b.shotsAway),
      boxshotsHome: numOrNull(b.boxshotsHome), boxshotsAway: numOrNull(b.boxshotsAway),
      touchesHome: numOrNull(b.touchesHome), touchesAway: numOrNull(b.touchesAway),
      minute: numOrNull(b.minute)
    };

    // STEP 8: continuiamo a seguire il match anche DOPO il primo VERDE.
    // live_alert_sent blocca solo un secondo alert VERDE, non il monitoraggio.
    const { rows } = await pool.query(
      `SELECT * FROM matches
       WHERE live_strategy IS NOT NULL
         AND esito_manuale IS NULL
       ORDER BY ABS(start_at - $1) ASC`,
      [Date.now()]
    );
    const match = rows.find(function (r) {
      return teamNamesMatch(r.casa, casa) && teamNamesMatch(r.trasferta, trasferta);
    });
    if (!match) return res.json({ sent: false, reason: 'no-match' });

    const previousLevel = String(match.live_last_level || '').toLowerCase();
    const previousScore = match.live_last_score == null ? null : Number(match.live_last_score);
    const result = liveStrategie.classify(match.live_strategy, payload, match);
    if (result.error) return res.json({ sent: false, reason: result.error });

    const lifecycleNow = Date.now();
    await pool.query(
      `UPDATE matches
       SET live_last_level = $1,
           live_last_summary = $2,
           live_last_updated = $3,
           live_last_score = $4,
           live_started_at = COALESCE(live_started_at, $3)
       WHERE id = $5`,
      [result.level, result.summary, lifecycleNow, result.score100 == null ? null : Number(result.score100), match.id]
    );

    if (result.level === 'verde' && result.gateOk) {
      await saveSignalSnapshot(match, result, {
        minute: payload.minute, scoreHome: payload.scoreHome, scoreAway: payload.scoreAway,
        xg: [payload.xgHome, payload.xgAway], sot: [payload.sotHome, payload.sotAway], shots: [payload.shotsHome, payload.shotsAway],
        chances: [payload.chancesHome, payload.chancesAway], boxshots: [payload.boxshotsHome, payload.boxshotsAway], touches: [payload.touchesHome, payload.touchesAway]
      }, 'live-stats', lifecycleNow);
      // Il segnale appartiene allo storico della partita anche se Telegram e' disattivato.
      // Non dipende dalla sessione Admin: /api/live-stats ricalcola il segnale sul server.
      await pool.query(
        `UPDATE matches SET
           signal_first_at = COALESCE(signal_first_at, $2),
           signal_first_level = COALESCE(signal_first_level, $3),
           signal_first_score = COALESCE(signal_first_score, $4)
         WHERE id = $1`,
        [match.id, lifecycleNow, result.level, result.score100 == null ? null : Number(result.score100)]
      );
    }

    const scoreText = (payload.scoreHome !== null && payload.scoreAway !== null)
      ? payload.scoreHome + '-' + payload.scoreAway : 'N/D';
    const minuteText = payload.minute == null ? 'N/D' : (Math.round(payload.minute) + "'");
    const total = (a, b) => (a == null || b == null) ? null : Number(a) + Number(b);
    const xgTotal = total(payload.xgHome, payload.xgAway);
    const sotTotal = total(payload.sotHome, payload.sotAway);
    const shotsTotal = total(payload.shotsHome, payload.shotsAway);
    const metricsLine = [
      'xG ' + (xgTotal == null ? 'N/D' : xgTotal.toFixed(2)),
      'SOT ' + (sotTotal == null ? 'N/D' : sotTotal),
      'Tiri ' + (shotsTotal == null ? 'N/D' : shotsTotal)
    ].join(' • ');

    // 1) Un solo alert VERDE per match/strategia.
    if (result.level === 'verde' && result.gateOk && !match.live_alert_sent && match.bot_enabled !== false) {
      const league = match.campionato ? ' (' + escapeHtmlLite(match.campionato) + ')' : '';
      const tipo = match.tipo_giocata ? escapeHtmlLite(match.tipo_giocata) : '—';
      const text = '🟢 <b>SEGNALE LIVE — ' + escapeHtmlLite(result.label) + '</b>' + league + '\n' +
        '<b>' + escapeHtmlLite(match.casa) + ' - ' + escapeHtmlLite(match.trasferta) + '</b>\n' +
        '⏱ ' + minuteText + ' • 📍 ' + scoreText + '\n' +
        '👉 ' + tipo + '\n' +
        '🎯 <b>' + (result.score100 == null ? 'N/D' : result.score100 + '/100') + '</b> • ' + escapeHtmlLite(metricsLine);
      const sentTo = await telegram.broadcast(text);
      await pool.query(
        `UPDATE matches SET live_alert_sent = true,
          live_last_notified_at = $2,
          signal_first_at = COALESCE(signal_first_at, $2),
          signal_first_level = COALESCE(signal_first_level, $3),
          signal_first_score = COALESCE(signal_first_score, $4)
         WHERE id = $1`,
        [match.id, lifecycleNow, result.level, result.score100 == null ? null : Number(result.score100)]
      );
      return res.json({ sent: true, kind: 'green', sentTo, level: result.level, score100: result.score100, summary: result.summary, match: { casa: match.casa, trasferta: match.trasferta } });
    }

    // 2) Dopo un VERDE: massimo un alert di deterioramento realmente importante.
    // Niente notifiche per normali oscillazioni VERDE↔GIALLO.
    const drasticScoreDrop = previousScore != null && result.score100 != null && previousScore >= 65 && result.score100 <= 40 && (previousScore - result.score100) >= 25;
    const becameRedAfterSignal = !!match.live_alert_sent && previousLevel && previousLevel !== 'rosso' && result.level === 'rosso';
    const shouldWarnDeterioration = match.bot_enabled !== false && !!match.live_alert_sent && !match.live_deterioration_alert_sent && (becameRedAfterSignal || drasticScoreDrop);

    if (shouldWarnDeterioration) {
      const text = '⚠️ <b>SEGNALE LIVE PEGGIORATO</b>\n' +
        '<b>' + escapeHtmlLite(match.casa) + ' - ' + escapeHtmlLite(match.trasferta) + '</b>\n' +
        '⏱ ' + minuteText + ' • 📍 ' + scoreText + '\n' +
        '🎯 Score: <b>' + (result.score100 == null ? 'N/D' : result.score100 + '/100') + '</b>\n' +
        '📉 ' + escapeHtmlLite(metricsLine) + '\n' +
        '<i>Il segnale iniziale resta nello storico; questo avviso indica solo un deterioramento marcato.</i>';
      const sentTo = await telegram.broadcast(text);
      await pool.query(
        `UPDATE matches
         SET live_deterioration_alert_sent = true,
             live_last_notified_at = $2
         WHERE id = $1`,
        [match.id, lifecycleNow]
      );
      return res.json({ sent: true, kind: 'deterioration', sentTo, level: result.level, score100: result.score100, summary: result.summary });
    }

    return res.json({
      sent: false,
      reason: match.live_alert_sent ? 'already-green-alerted' : 'no-important-change',
      level: result.level,
      score100: result.score100,
      summary: result.summary,
      matched: { casa: match.casa, trasferta: match.trasferta }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel controllo delle statistiche live.' });
  }
});

// ---------- stemmi squadre: alias + fallback + cache + override manuale ----------
function normCrestName(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
const CREST_TTL_HIT_MS = 30 * 24 * 60 * 60 * 1000;
const CREST_TTL_MISS_MS = 5 * 60 * 1000; // riprova molto prima i mancanti per evitare placeholder persistenti
// Versione cache automatica: evita di riusare vecchi risultati errati (es. foto di città).
// Gli override manuali restano sulla chiave storica e continuano a funzionare.
const CREST_CACHE_VERSION = 'v5';

const CREST_ALIASES = {
  'lahti': ['FC Lahti'],
  'sk rapid': ['Rapid Vienna', 'SK Rapid Wien', 'Rapid Wien'],
  'waterford united': ['Waterford FC', 'Waterford'],
  'klubi 04': ['Klubi 04', 'HJK Klubi 04'],
  'neuchatel xamax': ['Neuchatel Xamax', 'Neuchatel Xamax FCS'],
  'rapperswil jona': ['FC Rapperswil-Jona', 'Rapperswil-Jona'],
  'sjk': ['SJK Seinajoki', 'Seinajoen JK'],
  'wisla krakow': ['Wisla Krakow'],
  'slask wroclaw': ['Slask Wroclaw'],
  'america mineiro': ['America MG', 'America Mineiro'],
  'vila nova': ['Vila Nova FC'],
  'shamrock rovers': ['Shamrock Rovers FC'],
  'wsg tirol': ['WSG Swarovski Tirol', 'WSG Tirol'],
  'varda se': ['Kisvarda FC', 'Kisvarda'],
  'sirius': ['IK Sirius'],
  'servette': ['Servette FC'],
  'novi pazar': ['FK Novi Pazar', 'Novi Pazar'],
  'zemun': ['FK Zemun', 'Zemun'],
  'fk kosice': ['FC Kosice', 'Kosice', 'FK Kosice'],
  'kosice': ['FC Kosice', 'Kosice', 'FK Kosice'],
  'ruzomberok': ['MFK Ruzomberok', 'Ruzomberok'],
  'villa dalmine': ['Club Villa Dalmine', 'Villa Dalmine'],
  'ituzaingo': ['CA Ituzaingo', 'Club Atletico Ituzaingo', 'Ituzaingo'],
  'atletico mineiro': ['Clube Atletico Mineiro', 'Atletico Mineiro', 'Atletico-MG'],
  'chapecoense': ['Chapecoense', 'Associacao Chapecoense de Futebol', 'Chapecoense AF'],
  'sporting cp': ['Sporting CP', 'Sporting Clube de Portugal', 'Sporting'],
  'arouca': ['FC Arouca', 'Arouca'],
  'nacional': ['CD Nacional', 'Nacional da Madeira', 'Nacional'],
  'familicao': ['FC Famalicao', 'Famalicao'],
  'famalicao': ['FC Famalicao', 'Famalicao'],
  'fc tokyo': ['FC Tokyo'],
  'nagoya grampus': ['Nagoya Grampus'],
  'millwall': ['Millwall FC'],
  'west ham united': ['West Ham United', 'West Ham'],
  'barnsley': ['Barnsley FC'],
  'leicester city': ['Leicester City FC', 'Leicester City'],
  'tps': ['TPS Turku', 'Turun Palloseura'],
  'ilves': ['Ilves', 'Ilves Tampere'],
  'mp': ['Mikkelin Palloilijat', 'MP Mikkeli'],
  'jippo': ['JIPPO', 'JIPPO Joensuu'],
  'odddevold': ['IK Oddevold', 'Oddevold'],
  'varnamo': ['IFK Varnamo', 'Varnamo'],
  'ifk goteborg': ['IFK Goteborg', 'Goteborg'],
  'brommapojkarna': ['IF Brommapojkarna', 'Brommapojkarna'],
  'accrington stanley': ['Accrington Stanley'],
  'newport county': ['Newport County AFC', 'Newport County'],
  'kr reykjavik': ['KR Reykjavik', 'KR'],
  'vikingur reykjavik': ['Vikingur Reykjavik', 'Vikingur'],
  'lincoln city': ['Lincoln City FC', 'Lincoln City'],
  'swansea city': ['Swansea City AFC', 'Swansea City'],
  'mjallby': ['Mjallby AIF', 'Mjallby'],
  'aik': ['AIK'],
  'lokomotiv sofia 1929': ['Lokomotiv Sofia', 'Lokomotiv 1929 Sofia'],
  'cska sofia': ['CSKA Sofia'],
  'zalgiris': ['FK Zalgiris', 'Zalgiris Vilnius'],
  'kauno zalgiris': ['FK Kauno Zalgiris', 'Kauno Zalgiris'],
  'foggia': ['Calcio Foggia 1920', 'Foggia Calcio', 'Foggia'],
  'sorrento': ['Sorrento Calcio 1945', 'Sorrento Calcio', 'Sorrento'],
  'sd eibar': ['SD Eibar', 'Eibar'],
  'eibar': ['SD Eibar', 'Eibar'],
  'las palmas': ['UD Las Palmas', 'Las Palmas'],
  'burgos': ['Burgos CF', 'Burgos'],
  'eldense': ['CD Eldense', 'Eldense'],
  'perugia': ['AC Perugia Calcio', 'Perugia Calcio', 'Perugia'],
  'reggiana': ['AC Reggiana 1919', 'Reggiana 1919', 'Reggiana'],
  'de graafschap': ['De Graafschap', 'BV De Graafschap'],
  'sporting kc': ['Sporting Kansas City', 'Sporting KC', 'SKC'],
  'sporting kansas city': ['Sporting Kansas City', 'Sporting KC', 'SKC'],
  'toronto': ['Toronto FC'],
  'toronto fc': ['Toronto FC'],
  'dallas': ['FC Dallas'],
  'fc dallas': ['FC Dallas'],
  'los angeles': ['Los Angeles FC','LAFC'],
  'los angeles fc': ['Los Angeles FC','LAFC'],
  'valladolid': ['Real Valladolid'],
  'cordoba': ['Cordoba CF','Córdoba CF'],
  'mallorca': ['RCD Mallorca'],
  'almeria': ['UD Almeria','UD Almería'],
  'girona': ['Girona FC'],
  'albacete': ['Albacete Balompie','Albacete Balompié'],
  'avellino': ['US Avellino 1912','U.S. Avellino 1912'],
  'entella': ['Virtus Entella'],
  'port vale': ['Port Vale FC'],
  'mansfield': ['Mansfield Town','Mansfield Town FC'],
  'carlisle': ['Carlisle United','Carlisle United FC'],
  'halifax': ['FC Halifax Town'],
  'rochdale': ['Rochdale AFC'],
  'aldershot': ['Aldershot Town','Aldershot Town FC'],
  'san jose': ['San Jose Earthquakes','SJ Earthquakes'],
  'sj earthquakes': ['San Jose Earthquakes'],
  'vancouver': ['Vancouver Whitecaps FC','Vancouver Whitecaps'],
  'philadelphia': ['Philadelphia Union'],
  'philadelphia union': ['Philadelphia Union'],
  'orlando city': ['Orlando City SC','Orlando City'],
  'charlotte': ['Charlotte FC'],
  'chicago fire': ['Chicago Fire FC','Chicago Fire'],
  'montreal': ['CF Montreal','CF Montréal'],
  'cf montreal': ['CF Montreal','CF Montréal'],
  'cincinnati': ['FC Cincinnati'],
  'st louis city': ['St. Louis City SC','St Louis City SC'],
  'st louis': ['St. Louis City SC','St Louis City SC'],
  'san diego': ['San Diego FC'],
  'portland': ['Portland Timbers'],
  'new york rb': ['New York Red Bulls','NY Red Bulls'],
  'new york red bulls': ['New York Red Bulls'],
  'gimnastic': ['Gimnastic de Tarragona','Gimnàstic de Tarragona'],
  'gimnastic tarragona': ['Gimnastic de Tarragona','Gimnàstic de Tarragona'],
  'atletico baleares': ['CD Atletico Baleares','CD Atlético Baleares'],
  'teruel': ['CD Teruel'],
  'europa': ['CE Europa'],
  'antequera': ['Antequera CF'],
  'sabadell': ['CE Sabadell FC','Centre d Esports Sabadell Futbol Club'],
  'twente': ['FC Twente'],
  'fc twente': ['FC Twente'],
  'fortuna sittard': ['Fortuna Sittard'],
  'nac breda': ['NAC Breda'],
  'groningen': ['FC Groningen'],
  'fc groningen': ['FC Groningen'],
  'den bosch': ['FC Den Bosch'],
  'fc den bosch': ['FC Den Bosch'],
  'houston dynamo': ['Houston Dynamo FC','Houston Dynamo'],
  'nashville sc': ['Nashville SC'],
  'nashville': ['Nashville SC']
};

// ID Wikidata fissati per i club che possono essere ambigui o che i provider
// restituiscono con immagini generiche. Qui prendiamo lo stemma del club, non
// una foto della città e non il logo generico della lega.
const CREST_WIKIDATA_IDS = {
  'las palmas': 'Q11979',
  'ud las palmas': 'Q11979',
  'de graafschap': 'Q221927',
  'sporting kc': 'Q329812',
  'sporting kansas city': 'Q329812',
  'toronto': 'Q327238',
  'toronto fc': 'Q327238',
  'dallas': 'Q642291',
  'fc dallas': 'Q642291',
  'los angeles fc': 'Q18380286',
  'avellino': 'Q298217',
  'entella': 'Q2276413',
  'de graafschap': 'Q221927',
  'den bosch': 'Q875169',
  'fc den bosch': 'Q875169',
  'girona': 'Q11945',
  'albacete': 'Q576285',
  'gimnastic': 'Q257984',
  'gimnastic tarragona': 'Q257984',
  'teruel': 'Q2128712',
  'sabadell': 'Q12260',
  'atletico baleares': 'Q855199',
  'houston dynamo': 'Q328313',
  'sporting kansas city': 'Q329812',
  'chicago fire': 'Q308683',
  'charlotte': 'Q78944434',
  'montreal': 'Q167615',
  'cf montreal': 'Q167615',
  'cincinnati': 'Q20855983',
  'cordoba': 'Q10499',
  'valladolid': 'Q10319',
  'mallorca': 'Q8835',
  'groningen': 'Q24711',
  'fortuna sittard': 'Q854167'
};
const COUNTRY_ALIASES = {
  'republic of ireland':'ireland', 'england':'england', 'scotland':'scotland',
  'usa':'united states', 'united states of america':'united states',
  'south korea':'south korea', 'korea republic':'south korea',
  'czech republic':'czechia'
};
function countryHintFromCampionato(campionato) {
  const s = String(campionato || '').trim();
  if (!s) return '';
  const idx = s.indexOf(':');
  return (idx === -1 ? s : s.slice(0, idx)).trim();
}
function normCountry(s){
  const n=normCrestName(s);
  return COUNTRY_ALIASES[n] || n;
}
function countriesMatch(a, b) {
  const na = normCountry(a), nb = normCountry(b);
  if (!na || !nb) return false;
  return na === nb || na.indexOf(nb) !== -1 || nb.indexOf(na) !== -1;
}
function crestQueries(name){
  const raw=String(name||'').trim();
  const key=normCrestName(raw);
  const out=[raw].concat(CREST_ALIASES[key]||[]);
  const stripped=raw.replace(/\b(FC|AFC|CF|SC|SK|FK|AC|AS|SSC|SV|TSV|NK|JK)\b/gi,' ').replace(/\s+/g,' ').trim();
  if(stripped && normCrestName(stripped)!==key) out.push(stripped);
  if(raw && !/\bFC\b/i.test(raw)) out.push(raw+' FC');
  return [...new Set(out.filter(Boolean))];
}
function crestCandidateScore(team, requestedName, query, countryHint){
  const requested=normCrestName(requestedName), q=normCrestName(query);
  const names=[team.strTeam,team.strTeamShort,team.strAlternate].filter(Boolean).map(normCrestName);
  let score=0;
  if(names.includes(requested)) score+=100;
  if(names.includes(q)) score+=80;
  if(names.some(n=>n.includes(requested)||requested.includes(n))) score+=35;
  if(countryHint && countriesMatch(team.strCountry,countryHint)) score+=50;
  if(team.strSport && normCrestName(team.strSport)!=='soccer') score-=200;
  if(team.strBadge) score+=10;
  return score;
}
function meaningfulCrestTokens(s){
  const stop=new Set(['fc','cf','afc','sc','ac','as','sk','fk','sv','tsv','club','football','calcio','de','del','the']);
  return normCrestName(s).split(' ').filter(t=>t.length>2&&!stop.has(t));
}
function looksLikeFootballClubTitle(title, requestedName){
  const raw=String(title||'');
  const t=normCrestName(raw), req=normCrestName(requestedName);
  if(!t||!req) return false;
  const footballMarker=/(football club|football|soccer|calcio|futbol|fussball|fc\b|cf\b|afc\b|sc\b|ac\b|club)/i.test(raw);
  const tokens=meaningfulCrestTokens(requestedName);
  const overlap=tokens.filter(x=>t.includes(x)).length;
  const enoughOverlap=tokens.length ? overlap>=Math.min(2,tokens.length) : t.includes(req);
  return footballMarker && enoughOverlap;
}

function chooseBestWikidataLogoClaim(claims){
  const candidates=[];
  for(const prop of ['P154','P94']){
    for(const claim of (claims&&claims[prop])||[]){
      const filename=claim&&claim.mainsnak&&claim.mainsnak.datavalue&&claim.mainsnak.datavalue.value;
      if(!filename) continue;
      const f=String(filename).toLowerCase();
      let score=(prop==='P154'?30:20);
      if(/crest|badge|emblem|shield/.test(f)) score+=80;
      if(/logo/.test(f)) score+=35;
      if(/wordmark|logotype|text/.test(f)) score-=80;
      if(/old|former|2006|2010|histor/.test(f)) score-=25;
      candidates.push({filename,score});
    }
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates.length?candidates[0].filename:null;
}

async function lookupCrestWikidataById(id, matched){
  if(!id) return {url:null,matched:null};
  try{
    const entityUrl='https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(id)+'&props=claims&format=json&origin=*';
    const er=await fetch(entityUrl,{headers:{'User-Agent':'EasyBet/1.0 (team crest resolver)'}});
    if(!er.ok) return {url:null,matched:null};
    const ed=await er.json();
    const ent=ed&&ed.entities&&ed.entities[id];
    const claims=ent&&ent.claims?ent.claims:{};
    const filename=chooseBestWikidataLogoClaim(claims);
    if(!filename) return {url:null,matched:null};
    const url='https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(filename)+'?width=320';
    return {url,matched:matched||id,source:'wikidata-fixed'};
  }catch(err){
    console.error('Wikidata ID stemma "'+id+'":',err.message);
    return {url:null,matched:null};
  }
}

async function lookupCrestWikidata(name,countryHint){
  const clean=String(name||'').trim();
  if(!clean) return {url:null,matched:null};
  const queries=crestQueries(clean);
  const langs=['en','it'];
  let best=null,bestScore=-Infinity;
  for(const lang of langs){
    for(const q of queries){
      try{
        const searchUrl='https://www.wikidata.org/w/api.php?action=wbsearchentities&search='+encodeURIComponent(q)+'&language='+lang+'&uselang='+lang+'&type=item&limit=10&format=json&origin=*';
        const sr=await fetch(searchUrl,{headers:{'User-Agent':'EasyBet/1.0 (team crest resolver)'}});
        if(!sr.ok) continue;
        const sd=await sr.json();
        const items=Array.isArray(sd&&sd.search)?sd.search:[];
        for(const item of items){
          const label=normCrestName(item.label||'');
          const desc=String(item.description||'');
          const descNorm=normCrestName(desc);
          const req=normCrestName(clean);
          const qn=normCrestName(q);
          const football=/football club|association football club|soccer club|football team|calcio|societa calcistica|club de futbol|fussballverein/.test(descNorm);
          if(!football) continue;
          let score=0;
          if(label===req) score+=120;
          if(label===qn) score+=100;
          if(label.includes(req)||req.includes(label)) score+=55;
          const toks=meaningfulCrestTokens(clean);
          score+=toks.filter(t=>label.includes(t)).length*25;
          if(countryHint && descNorm.includes(normCountry(countryHint))) score+=25;
          if(score>bestScore){bestScore=score;best=item;}
        }
      }catch(err){ console.error('Lookup Wikidata stemma "'+q+'":',err.message); }
    }
  }
  if(!best || bestScore<55 || !best.id) return {url:null,matched:null};
  try{
    const entityUrl='https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(best.id)+'&props=claims&format=json&origin=*';
    const er=await fetch(entityUrl,{headers:{'User-Agent':'EasyBet/1.0 (team crest resolver)'}});
    if(!er.ok) return {url:null,matched:null};
    const ed=await er.json();
    const ent=ed&&ed.entities&&ed.entities[best.id];
    const claims=ent&&ent.claims?ent.claims:{};
    const filename=chooseBestWikidataLogoClaim(claims);
    if(!filename) return {url:null,matched:null};
    const url='https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(filename)+'?width=320';
    return {url,matched:best.label||clean,source:'wikidata'};
  }catch(err){
    console.error('Wikidata dettaglio stemma "'+clean+'":',err.message);
    return {url:null,matched:null};
  }
}

async function lookupCrestWikipedia(name,countryHint){
  const clean=String(name||'').trim();
  if(!clean) return {url:null,matched:null};
  const searches=[];
  if(countryHint) searches.push(clean+' football club '+countryHint);
  searches.push(clean+' football club');
  searches.push(clean+' calcio');
  searches.push(clean+' FC');
  for(const q of [...new Set(searches)]){
    try{
      const url='https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=0&gsrlimit=8&gsrsearch='+encodeURIComponent(q)+'&prop=pageimages&pithumbsize=320&format=json&origin=*';
      const r=await fetch(url,{headers:{'User-Agent':'EasyBet/1.0 (team crest fallback)'}});
      if(!r.ok) continue;
      const data=await r.json();
      const pages=data&&data.query&&data.query.pages?Object.values(data.query.pages):[];
      if(!pages.length) continue;
      const requested=normCrestName(clean);
      let best=null,bestScore=-Infinity;
      for(const page of pages){
        if(!page||!page.thumbnail||!page.thumbnail.source) continue;
        // Non accettiamo più pagine generiche di città/località/stadi come stemmi.
        if(!looksLikeFootballClubTitle(page.title, clean)) continue;
        const title=normCrestName(page.title||'');
        let score=0;
        if(title===requested) score+=120;
        if(title.includes(requested)||requested.includes(title)) score+=70;
        const reqTokens=meaningfulCrestTokens(clean);
        score+=reqTokens.filter(x=>title.includes(x)).length*25;
        if(/football|soccer|club|fc|cf|afc|sc|ac|calcio/.test(title)) score+=25;
        if(score>bestScore){bestScore=score;best=page;}
      }
      if(best&&best.thumbnail&&bestScore>=50){
        return {url:best.thumbnail.source,matched:best.title||null,source:'wikipedia'};
      }
    }catch(err){ console.error('Fallback Wikipedia stemma "'+q+'":',err.message); }
  }
  return {url:null,matched:null};
}

async function lookupCrest(name,countryHint){
  const key=normCrestName(name);

  // 1) Club noti/ambigui: QID Wikidata fissato. È la fonte più sicura.
  const fixedId=CREST_WIKIDATA_IDS[key];
  if(fixedId){
    const fixed=await lookupCrestWikidataById(fixedId,name);
    if(fixed&&fixed.url) return fixed;
  }

  // 2) Wikidata prima dei motori fuzzy: cerchiamo un'entità descritta come club/team di calcio
  // e chiediamo esplicitamente logo/stemma. Questo evita città, leghe e club omonimi.
  const wd=await lookupCrestWikidata(name,countryHint);
  if(wd && wd.url) return wd;

  // 3) TheSportsDB solo con corrispondenza FORTE del nome. In precedenza la ricerca fuzzy
  // poteva restituire un club diverso dello stesso Paese e quindi uno stemma sbagliato.
  const queries=crestQueries(name);
  const allowedNames=new Set(queries.map(normCrestName));
  allowedNames.add(key);
  let best=null, bestScore=-Infinity;
  for(const query of queries){
    try{
      const r=await fetch('https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t='+encodeURIComponent(query));
      if(!r.ok) continue;
      const data=await r.json();
      const teams=(data&&Array.isArray(data.teams)?data.teams:[]).filter(t=>t&&t.strBadge);
      for(const team of teams){
        if(team.strSport && normCrestName(team.strSport)!=='soccer') continue;
        if(countryHint && team.strCountry && !countriesMatch(team.strCountry,countryHint)) continue;
        const teamNames=[team.strTeam,team.strTeamShort].filter(Boolean).map(normCrestName);
        const alternates=String(team.strAlternate||'').split(/[,;/|]+/).map(normCrestName).filter(Boolean);
        const exact=[...teamNames,...alternates].some(n=>allowedNames.has(n));
        if(!exact) continue;
        const score=crestCandidateScore(team,name,query,countryHint)+100;
        if(score>bestScore){bestScore=score;best=team;}
      }
    }catch(err){ console.error('Lookup stemma "'+query+'":',err.message); }
  }
  if(best && best.strBadge) return {url:best.strBadge,matched:best.strTeam||null,source:'sportsdb-exact'};

  // 4) Wikipedia è l'ultima spiaggia e resta sottoposta al controllo sul titolo del club.
  return await lookupCrestWikipedia(name,countryHint);
}

app.get('/api/team-crest', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome squadra mancante.' });
    const countryHint = countryHintFromCampionato(req.query.country || '');
    const baseKey = normCrestName(name) + (countryHint ? '|' + normCountry(countryHint) : '');
    const autoKey = 'auto:' + CREST_CACHE_VERSION + '|' + baseKey;
    const now=Date.now();

    // Preserva gli override manuali già inseriti dall'admin.
    const manualQ = await pool.query('SELECT * FROM team_crests WHERE name_norm = $1 AND manual=true', [baseKey]);
    const manualCached = manualQ.rows[0];
    if(manualCached) return res.json({url:manualCached.url||null,manual:true,source:'manual'});

    // Cache automatica versionata: ignora le vecchie foto sbagliate già memorizzate.
    const autoQ = await pool.query('SELECT * FROM team_crests WHERE name_norm = $1', [autoKey]);
    const cached = autoQ.rows[0];
    if(cached){
      const age=now-Number(cached.fetched_at);
      const fresh=cached.url ? age<CREST_TTL_HIT_MS : age<CREST_TTL_MISS_MS;
      if(fresh) return res.json({url:cached.url||null,manual:false,source:'cache'});
    }

    const found=await lookupCrest(name,countryHint);
    await pool.query(
      `INSERT INTO team_crests (name_norm,nome_originale,url,fetched_at,manual) VALUES ($1,$2,$3,$4,false)
       ON CONFLICT (name_norm) DO UPDATE SET nome_originale=EXCLUDED.nome_originale,url=EXCLUDED.url,fetched_at=EXCLUDED.fetched_at,manual=false`,
      [autoKey,name,found.url,now]
    );
    res.json({url:found.url,manual:false,source:found.url?(found.source||'provider'):'fallback',matched:found.matched});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel recupero dello stemma.' });
  }
});

// Override manuale dall'admin. URL vuoto o "AUTO" = torna alla ricerca automatica.
app.put('/api/team-crest', requireAdmin, async (req,res)=>{
  try{
    const name=String((req.body||{}).name||'').trim();
    const campionato=String((req.body||{}).campionato||'').trim();
    const rawUrl=String((req.body||{}).url||'').trim();
    if(!name) return res.status(400).json({error:'Nome squadra mancante.'});
    const countryHint=countryHintFromCampionato(campionato);
    const key=normCrestName(name)+(countryHint?'|'+normCountry(countryHint):'');
    const autoKey='auto:'+CREST_CACHE_VERSION+'|'+key;
    if(!rawUrl || rawUrl.toUpperCase()==='AUTO'){
      await pool.query('DELETE FROM team_crests WHERE name_norm = ANY($1::text[])',[[key,autoKey]]);
      return res.json({ok:true,url:null,manual:false,reset:true});
    }
    if(!/^https?:\/\//i.test(rawUrl)) return res.status(400).json({error:'Inserisci un URL http/https valido.'});
    await pool.query(
      `INSERT INTO team_crests (name_norm,nome_originale,url,fetched_at,manual) VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (name_norm) DO UPDATE SET nome_originale=EXCLUDED.nome_originale,url=EXCLUDED.url,fetched_at=EXCLUDED.fetched_at,manual=true`,
      [key,name,rawUrl,Date.now()]
    );
    // Se imposto manualmente, elimino l'eventuale cache automatica della stessa squadra.
    await pool.query('DELETE FROM team_crests WHERE name_norm=$1',[autoKey]);
    res.json({ok:true,url:rawUrl,manual:true});
  }catch(err){ console.error(err); res.status(500).json({error:'Errore nel salvataggio dello stemma.'}); }
});

app.put('/api/alert-settings', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      "UPDATE alert_settings SET notify_minutes = $1 WHERE id='main' RETURNING *",
      [10]
    );
    res.json(alertSettingsOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel salvataggio delle impostazioni avvisi.' });
  }
});

app.post('/api/cron/telegram', async (req, res) => {
  try {
    const expected = String(process.env.CRON_SECRET || '');
    const received = String(req.get('x-cron-secret') || '');
    if (!expected || received !== expected) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await scheduler.checkOnce();
    res.json({ ok: true, checkedAt: Date.now() });
  } catch (err) {
    console.error('Errore cron Telegram:', err);
    res.status(500).json({ error: 'Errore nel controllo notifiche Telegram.' });
  }
});


// Motore condiviso delle strategie LIVE: stesso file usato dal backend e dal browser.
app.get('/strategie-live.js', function(req, res){
  res.type('application/javascript');
  res.sendFile(path.join(__dirname, 'strategie-live.js'));
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

// Fallback per qualsiasi GET non-API su un percorso sconosciuto: manda alla pagina
// pubblica (non al Taccuino, che è privato) invece di un 404 nudo.
app.get('*', function(req, res, next){
  if (req.path.indexOf('/api/') === 0) return next();
  res.sendFile(path.join(__dirname, 'public', 'easybet.html'));
});

const PORT = process.env.PORT || 3000;

let httpServer = null;

async function shutdown(signal) {
  console.log(signal + ' ricevuto: arresto pulito in corso...');
  try { await telegram.stopPolling(); } catch (err) { console.error('Errore stop Telegram:', err.message); }
  if (httpServer) {
    httpServer.close(function(){ process.exit(0); });
    setTimeout(function(){ process.exit(0); }, 5000).unref();
  } else {
    process.exit(0);
  }
}

process.once('SIGTERM', function(){ shutdown('SIGTERM'); });
process.once('SIGINT', function(){ shutdown('SIGINT'); });

migrate()
  .then(function(){
    httpServer = app.listen(PORT, function(){
      console.log('Taccuino Exchange in ascolto sulla porta ' + PORT);
    });
    telegram.startPolling();
    scheduler.start();
  })
  .catch(function(err){
    console.error('Errore durante la migrazione del database:', err);
    process.exit(1);
  });
