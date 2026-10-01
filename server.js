const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pool, migrate } = require('./db');
const telegram = require('./telegram');
const scheduler = require('./scheduler');
const liveStrategie = require('./strategie-live');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// ---------- sicurezza Admin ----------
// L'admin non si affida piu' a un PIN salvato nel browser: il PIN viene verificato
// sul server tramite ADMIN_PIN e, dopo il login, viene emesso un cookie HttpOnly
// firmato e valido per un periodo limitato.
const ADMIN_COOKIE = 'easybet_admin';
const ADMIN_SESSION_MS = Math.max(15 * 60 * 1000, Number(process.env.ADMIN_SESSION_HOURS || 12) * 60 * 60 * 1000);
const ADMIN_PIN = String(process.env.ADMIN_PIN || '');
const ADMIN_SESSION_SECRET = String(process.env.ADMIN_SESSION_SECRET || '');
const ADMIN_PIN_OK = ADMIN_PIN.length >= 6;
const ADMIN_SECRET_OK = ADMIN_SESSION_SECRET.length >= 32;
const ADMIN_SECURITY_READY = ADMIN_PIN_OK && ADMIN_SECRET_OK;
const ADMIN_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 5;
const adminLoginAttempts = new Map();
const adminLoginCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of adminLoginAttempts.entries()) {
    if (!rec || now - Number(rec.startedAt || 0) > ADMIN_LOGIN_WINDOW_MS * 2) adminLoginAttempts.delete(key);
  }
}, ADMIN_LOGIN_WINDOW_MS);
if (adminLoginCleanupTimer.unref) adminLoginCleanupTimer.unref();

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
function signAdminSession(payload) {
  return crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(String(payload)).digest('hex');
}
function makeAdminToken() {
  const iat = Date.now();
  const exp = iat + ADMIN_SESSION_MS;
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = iat + '.' + exp + '.' + nonce;
  return payload + '.' + signAdminSession(payload);
}
function validAdminToken(token) {
  if (!ADMIN_SECURITY_READY) return false;
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return false;
  const iat = Number(parts[0]);
  const exp = Number(parts[1]);
  const nonce = String(parts[2] || '');
  const sig = String(parts[3] || '');
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) return false;
  if (iat > Date.now() + 60 * 1000 || exp <= Date.now()) return false;
  if (exp - iat > ADMIN_SESSION_MS + 60 * 1000) return false;
  if (!/^[a-f0-9]{32}$/i.test(nonce)) return false;
  const payload = iat + '.' + exp + '.' + nonce;
  return safeEqualText(sig, signAdminSession(payload));
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
  if (!ADMIN_SECURITY_READY) return res.status(503).json({ error: 'Sicurezza Admin non configurata correttamente.' });
  const token = parseCookies(req)[ADMIN_COOKIE];
  if (!validAdminToken(token)) return res.status(401).json({ error: 'Accesso admin richiesto.' });
  next();
}
function requireSameSiteAdmin(req, res, next) {
  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') return res.status(403).json({ error: 'Richiesta cross-site bloccata.' });

  const origin = String(req.headers.origin || '').trim();
  if (origin) {
    try {
      const u = new URL(origin);
      const host = String(req.headers.host || '').toLowerCase();
      if (String(u.host || '').toLowerCase() !== host) {
        return res.status(403).json({ error: 'Origine non autorizzata.' });
      }
    } catch (_) {
      return res.status(403).json({ error: 'Origine non valida.' });
    }
  }
  requireAdmin(req, res, next);
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

app.use('/api/admin', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.setHeader('Pragma', 'no-cache');
  next();
});
app.get('/api/admin/status', (req, res) => {
  const authenticated = ADMIN_SECURITY_READY && validAdminToken(parseCookies(req)[ADMIN_COOKIE]);
  res.json({
    configured: ADMIN_SECURITY_READY,
    authenticated,
    pinOk: ADMIN_PIN_OK,
    secretOk: ADMIN_SECRET_OK,
    sessionHours: Math.round(ADMIN_SESSION_MS / 3600000 * 10) / 10
  });
});
app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PIN_OK) return res.status(503).json({ error: 'Configura ADMIN_PIN con almeno 6 caratteri.' });
  if (!ADMIN_SECRET_OK) return res.status(503).json({ error: 'Configura ADMIN_SESSION_SECRET con almeno 32 caratteri casuali.' });
  if (!loginAllowed(req)) {
    res.setHeader('Retry-After', String(Math.ceil(ADMIN_LOGIN_WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Troppi tentativi. Riprova tra qualche minuto.' });
  }
  const pin = String((req.body || {}).pin || '');
  if (!safeEqualText(pin, ADMIN_PIN)) {
    noteFailedLogin(req);
    return res.status(401).json({ error: 'PIN errato.' });
  }
  clearFailedLogin(req);
  res.setHeader('Set-Cookie', ADMIN_COOKIE + '=' + encodeURIComponent(makeAdminToken()) + '; ' + adminCookieOptions(req));
  res.json({ ok: true });
});
app.post('/api/admin/logout', (req, res) => {
  res.setHeader('Set-Cookie', clearAdminCookie(req));
  res.json({ ok: true });
});

// ---------- backup / export Admin ----------
app.get('/api/admin/backup', requireSameSiteAdmin, async (req, res) => {
  try {
    const [matchesRes, snapshotsRes, alertRes, crestsRes, exchangeRes] = await Promise.all([
      pool.query('SELECT * FROM matches ORDER BY start_at ASC, id ASC'),
      pool.query('SELECT * FROM signal_snapshots ORDER BY created_at ASC, id ASC'),
      pool.query("SELECT * FROM alert_settings WHERE id='main'"),
      pool.query('SELECT * FROM team_crests ORDER BY name_norm ASC'),
      pool.query('SELECT * FROM exchange_periods ORDER BY start_date ASC, uid ASC')
    ]);

    const payload = {
      format: 'easybet-backup',
      version: 1,
      exportedAt: Date.now(),
      exportedAtIso: new Date().toISOString(),
      counts: {
        matches: matchesRes.rows.length,
        signalSnapshots: snapshotsRes.rows.length,
        teamCrests: crestsRes.rows.length,
        exchangePeriods: exchangeRes.rows.length
      },
      data: {
        matches: matchesRes.rows,
        signalSnapshots: snapshotsRes.rows,
        alertSettings: alertRes.rows[0] || null,
        teamCrests: crestsRes.rows,
        exchangePeriods: exchangeRes.rows
      }
    };

    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${backupFilename('easybet-backup', 'json')}"`);
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    console.error('Backup EasyBet:', err);
    res.status(500).json({ error: 'Impossibile creare il backup.' });
  }
});

app.get('/api/admin/export/matches.csv', requireSameSiteAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        m.id,
        m.data,
        m.start_at,
        m.campionato,
        m.casa,
        m.trasferta,
        m.tipo_giocata,
        m.quota_ingresso,
        m.esito_manuale,
        m.live_started_at,
        m.signal_first_at,
        m.signal_first_level,
        m.signal_first_score,
        m.outcome_set_at,
        ss.minute AS signal_minute,
        ss.score_home AS signal_score_home,
        ss.score_away AS signal_score_away,
        ss.xg_home,
        ss.xg_away,
        ss.sot_home,
        ss.sot_away,
        ss.shots_home,
        ss.shots_away,
        ss.chances_home,
        ss.chances_away,
        ss.boxshots_home,
        ss.boxshots_away,
        ss.touches_home,
        ss.touches_away,
        ss.source AS signal_source,
        ss.summary AS signal_summary
      FROM matches m
      LEFT JOIN LATERAL (
        SELECT s.*
        FROM signal_snapshots s
        WHERE s.match_id = m.id
          AND LOWER(COALESCE(s.level,'')) = 'verde'
        ORDER BY s.created_at ASC
        LIMIT 1
      ) ss ON TRUE
      ORDER BY m.start_at ASC, m.id ASC
    `);

    const columns = [
      'id','data','start_at','campionato','casa','trasferta','tipo_giocata',
      'quota_ingresso','esito_manuale','live_started_at','signal_first_at',
      'signal_first_level','signal_first_score','outcome_set_at','signal_minute',
      'signal_score_home','signal_score_away','xg_home','xg_away','sot_home','sot_away',
      'shots_home','shots_away','chances_home','chances_away','boxshots_home','boxshots_away',
      'touches_home','touches_away','signal_source','signal_summary'
    ];

    const lines = [columns.map(csvCell).join(',')];
    rows.forEach(row => {
      lines.push(columns.map(c => csvCell(row[c])).join(','));
    });

    const csv = '\uFEFF' + lines.join('\r\n');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${backupFilename('easybet-partite', 'csv')}"`);
    res.send(csv);
  } catch (err) {
    console.error('Export CSV EasyBet:', err);
    res.status(500).json({ error: 'Impossibile creare il CSV.' });
  }
});

// EasyBet pubblico è la home del servizio; l'area Admin resta separata e protetta.
app.use(express.static(path.join(__dirname, 'public'), { index: 'easybet.html' }));

function newId() {
  return crypto.randomUUID();
}

// ---------- mappers: DB row (snake_case) <-> API/client shape (camelCase) ----------
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
    importSource: row.import_source || '',
    importMatchId: row.import_match_id || '',
    importData: row.import_data || null,
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
  if (/UNDER\s*0\.?5/.test(s)) return 'UNDER 0.5 HT';
  if (/FAVORITO/.test(s)) return 'FAVORITO HT';
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

function scoreBucketLabel(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'N/D';
  if (n < 60) return '0–59';
  if (n < 70) return '60–69';
  if (n < 80) return '70–79';
  if (n < 90) return '80–89';
  return '90–100';
}
function scoreBucketOrder(label) {
  return ({'0–59':0,'60–69':1,'70–79':2,'80–89':3,'90–100':4,'N/D':5})[label] ?? 99;
}
function scoreValidation(rows) {
  const map = new Map();
  const byStrategyMap = new Map();
  const details = [];
  rows.forEach(row => {
    const outcome = perfOutcome(row.esito_manuale);
    const score = row.signal_first_score == null ? null : Number(row.signal_first_score);
    if (!outcome || !Number.isFinite(score)) return;
    const bucket = scoreBucketLabel(score);
    const strategy = perfStrategyLabel(row.tipo_giocata);
    if (!map.has(bucket)) map.set(bucket, { label: bucket, total:0, entered:0, wins:0, losses:0, skipped:0, scoreSum:0 });
    const a = map.get(bucket);
    a.total++; a.scoreSum += score;
    if (outcome === 'entrata_vinta') { a.wins++; a.entered++; }
    else if (outcome === 'entrata_persa') { a.losses++; a.entered++; }
    else if (outcome === 'non_entrata') a.skipped++;

    if (!byStrategyMap.has(strategy)) byStrategyMap.set(strategy, new Map());
    const sm = byStrategyMap.get(strategy);
    if (!sm.has(bucket)) sm.set(bucket, { label: bucket, total:0, entered:0, wins:0, losses:0, skipped:0, scoreSum:0 });
    const sa = sm.get(bucket);
    sa.total++; sa.scoreSum += score;
    if (outcome === 'entrata_vinta') { sa.wins++; sa.entered++; }
    else if (outcome === 'entrata_persa') { sa.losses++; sa.entered++; }
    else if (outcome === 'non_entrata') sa.skipped++;

    details.push({
      id: row.id,
      casa: row.casa || '',
      trasferta: row.trasferta || '',
      campionato: row.campionato || '',
      startAt: Number(row.start_at) || 0,
      strategy,
      score: Math.round(score),
      bucket,
      quota: perfQuota(row.quota_ingresso),
      outcome
    });
  });
  function finish(a) {
    return {
      label: a.label,
      total: a.total,
      entered: a.entered,
      wins: a.wins,
      losses: a.losses,
      skipped: a.skipped,
      winRate: perfPct(a.wins, a.entered),
      entryRate: perfPct(a.entered, a.total),
      avgScore: a.total ? Math.round(a.scoreSum / a.total * 10) / 10 : null,
      sample: a.entered >= 30 ? 'robusto' : a.entered >= 10 ? 'medio' : 'piccolo'
    };
  }
  const buckets = Array.from(map.values()).map(finish).sort((a,b) => scoreBucketOrder(a.label)-scoreBucketOrder(b.label));
  const byStrategy = Array.from(byStrategyMap.entries()).map(([strategy, sm]) => ({
    strategy,
    buckets: Array.from(sm.values()).map(finish).sort((a,b) => scoreBucketOrder(a.label)-scoreBucketOrder(b.label))
  })).sort((a,b) => a.strategy.localeCompare(b.strategy));
  return {
    totalSignals: details.length,
    totalEntered: buckets.reduce((n,x)=>n+x.entered,0),
    buckets,
    byStrategy,
    details: details.sort((a,b)=>b.startAt-a.startAt)
  };
}


function signalMinuteBucket(minute) {
  const n = Number(minute);
  if (!Number.isFinite(n)) return 'N/D';
  if (n <= 14) return '0–14';
  if (n <= 25) return '15–25';
  if (n <= 35) return '26–35';
  if (n <= 45) return '36–45';
  if (n <= 60) return '46–60';
  if (n <= 75) return '61–75';
  return '76+';
}
function signalMinuteOrder(label) {
  return ({'0–14':0,'15–25':1,'26–35':2,'36–45':3,'46–60':4,'61–75':5,'76+':6,'N/D':7})[label] ?? 99;
}
function minuteValidation(rows) {
  const map = new Map();
  const byStrategyMap = new Map();
  const details = [];

  rows.forEach(row => {
    const outcome = perfOutcome(row.esito_manuale);
    const minute = row.signal_minute == null ? null : Number(row.signal_minute);
    if (!outcome || !Number.isFinite(minute)) return;

    const bucket = signalMinuteBucket(minute);
    const strategy = perfStrategyLabel(row.tipo_giocata);

    if (!map.has(bucket)) map.set(bucket, {
      label: bucket, total: 0, entered: 0, wins: 0, losses: 0, skipped: 0, minuteSum: 0
    });
    const a = map.get(bucket);
    a.total++; a.minuteSum += minute;
    if (outcome === 'entrata_vinta') { a.wins++; a.entered++; }
    else if (outcome === 'entrata_persa') { a.losses++; a.entered++; }
    else if (outcome === 'non_entrata') a.skipped++;

    if (!byStrategyMap.has(strategy)) byStrategyMap.set(strategy, new Map());
    const sm = byStrategyMap.get(strategy);
    if (!sm.has(bucket)) sm.set(bucket, {
      label: bucket, total: 0, entered: 0, wins: 0, losses: 0, skipped: 0, minuteSum: 0
    });
    const sa = sm.get(bucket);
    sa.total++; sa.minuteSum += minute;
    if (outcome === 'entrata_vinta') { sa.wins++; sa.entered++; }
    else if (outcome === 'entrata_persa') { sa.losses++; sa.entered++; }
    else if (outcome === 'non_entrata') sa.skipped++;

    details.push({
      id: row.id,
      casa: row.casa || '',
      trasferta: row.trasferta || '',
      campionato: row.campionato || '',
      startAt: Number(row.start_at) || 0,
      strategy,
      minute: Math.round(minute),
      bucket,
      score: row.signal_first_score == null ? null : Math.round(Number(row.signal_first_score)),
      quota: perfQuota(row.quota_ingresso),
      outcome
    });
  });

  function finish(a) {
    return {
      label: a.label,
      total: a.total,
      entered: a.entered,
      wins: a.wins,
      losses: a.losses,
      skipped: a.skipped,
      winRate: perfPct(a.wins, a.entered),
      entryRate: perfPct(a.entered, a.total),
      avgMinute: a.total ? Math.round((a.minuteSum / a.total) * 10) / 10 : null,
      sample: a.entered >= 30 ? 'robusto' : a.entered >= 10 ? 'medio' : 'piccolo'
    };
  }

  const buckets = Array.from(map.values())
    .map(finish)
    .sort((a, b) => signalMinuteOrder(a.label) - signalMinuteOrder(b.label));

  const byStrategy = Array.from(byStrategyMap.entries()).map(([strategy, sm]) => ({
    strategy,
    buckets: Array.from(sm.values())
      .map(finish)
      .sort((a, b) => signalMinuteOrder(a.label) - signalMinuteOrder(b.label))
  })).sort((a, b) => a.strategy.localeCompare(b.strategy));

  return {
    totalSignals: details.length,
    totalEntered: buckets.reduce((n, x) => n + x.entered, 0),
    buckets,
    byStrategy,
    details: details.sort((a, b) => b.startAt - a.startAt)
  };
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
      SELECT m.id, m.data, m.campionato, m.casa, m.trasferta, m.tipo_giocata, m.start_at, m.quota_ingresso, m.esito_manuale,
             m.signal_first_at, m.signal_first_level, m.signal_first_score,
             ss.minute AS signal_minute
      FROM matches m
      LEFT JOIN LATERAL (
        SELECT s.minute
        FROM signal_snapshots s
        WHERE s.match_id = m.id
          AND LOWER(COALESCE(s.level,'')) = 'verde'
        ORDER BY s.created_at ASC
        LIMIT 1
      ) ss ON TRUE
      WHERE m.esito_manuale IS NOT NULL AND m.esito_manuale <> ''
      ORDER BY m.start_at ASC
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
    // Periodo selezionabile dalla pagina Statistiche.
    // Manteniamo anche i periodi riepilogativi per compatibilità con il frontend storico.
    const requestedPeriod = String(req.query.period || '30d').toLowerCase();
    const nowDate = new Date(now);
    const seasonYear = nowDate.getUTCMonth() >= 6 ? nowDate.getUTCFullYear() : nowDate.getUTCFullYear() - 1;
    const seasonStart = Date.UTC(seasonYear, 6, 1, 0, 0, 0, 0);
    let selectedRows = rows;
    let selectedLabel = 'Tutto';
    if (requestedPeriod === '7d') { selectedRows = rows.filter(r => Number(r.start_at) >= now - 7 * 86400000); selectedLabel = 'Ultimi 7 giorni'; }
    else if (requestedPeriod === '30d') { selectedRows = rows.filter(r => Number(r.start_at) >= now - 30 * 86400000); selectedLabel = 'Ultimi 30 giorni'; }
    else if (requestedPeriod === 'season') { selectedRows = rows.filter(r => Number(r.start_at) >= seasonStart); selectedLabel = 'Stagione ' + seasonYear + '/' + String(seasonYear + 1).slice(-2); }
    else { selectedRows = rows; }

    const selectedAcc = perfAccumulator(selectedLabel);
    selectedRows.forEach(row => perfAdd(selectedAcc, row));
    const selectedOverall = perfFinish(selectedAcc);
    const byStrategy = perfGroup(selectedRows, r => perfStrategyLabel(r.tipo_giocata));
    const byLeague = perfGroup(selectedRows, r => r.campionato || 'Senza campionato');
    const dailyMap = new Map();
    selectedRows.forEach(row => {
      const outcome = perfOutcome(row.esito_manuale);
      if (!outcome) return;
      const key = perfDateKeyRome(row.start_at);
      if (!dailyMap.has(key)) dailyMap.set(key, perfAccumulator(key));
      perfAdd(dailyMap.get(key), row);
    });
    const daily = Array.from(dailyMap.values()).map(perfFinish).sort((a,b) => a.label.localeCompare(b.label)).slice(-60);
    const details = selectedRows.map(row => ({
      id: row.id,
      startAt: Number(row.start_at) || 0,
      data: row.data || '',
      campionato: row.campionato || '',
      casa: row.casa || '',
      trasferta: row.trasferta || '',
      strategy: perfStrategyLabel(row.tipo_giocata),
      quota: perfQuota(row.quota_ingresso),
      outcome: perfOutcome(row.esito_manuale) || ''
    })).sort((a,b) => b.startAt - a.startAt);
    const scoreValidationData = scoreValidation(selectedRows.filter(r => r.signal_first_at && r.signal_first_score != null));
    const minuteValidationData = minuteValidation(selectedRows.filter(r => r.signal_first_at && r.signal_minute != null));
    res.json({ generatedAt: now, overall, periods, selected:{ key: requestedPeriod, label: selectedLabel, overall: selectedOverall }, byStrategy, byLeague, daily, details, scoreValidation: scoreValidationData, minuteValidation: minuteValidationData });
  } catch (err) {
    console.error('performance-stats:', err);
    res.status(500).json({ error: 'Errore nel calcolo delle statistiche performance.' });
  }
});


function csvCell(value) {
  if (value == null) return '';
  const text = String(value);
  if (/[",\n\r]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
  return text;
}
function backupFilename(prefix, ext) {
  const d = new Date();
  const stamp =
    d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0') + '-' +
    String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0');
  return `${prefix}-${stamp}.${ext}`;
}

// ---------- EasyBet state (initial load + polling sync) ----------
app.get('/api/state', async (req, res) => {
  try {
    const [matchesRes, alertSettingsRes, subsRes] = await Promise.all([
      pool.query('SELECT * FROM matches ORDER BY start_at ASC'),
      pool.query("SELECT * FROM alert_settings WHERE id='main'"),
      pool.query('SELECT COUNT(*)::int AS n FROM subscribers')
    ]);
    res.json({
      matches: matchesRes.rows.map(matchOut),
      alertSettings: alertSettingsOut(alertSettingsRes.rows[0]),
      subscriberCount: subsRes.rows[0] ? subsRes.rows[0].n : 0,
      botConfigured: telegram.isConfigured
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel caricamento dei dati EasyBet.' });
  }
});



// ---------- Diario Exchange (privato, integrato in EasyBet) ----------
function exchangeStateOut(row) {
  if (!row) return null;
  const state = row.state && typeof row.state === 'object' ? row.state : {};
  return { ...state, uid: row.uid, name: row.name, start: row.start_date, updatedAt: Number(row.updated_at) || 0 };
}
function exchangeNormalizeState(body, uidOverride) {
  const b = body && typeof body === 'object' ? body : {};
  const uid = String(uidOverride || b.uid || '').trim().slice(0, 64);
  const name = String(b.name || 'Periodo').trim().slice(0, 120) || 'Periodo';
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(b.start || '')) ? String(b.start) : new Date().toISOString().slice(0,10);
  const cash = Math.max(0, Number(b.cash) || 0);
  const targetPct = Math.max(0, Math.min(100, Number(b.targetPct == null ? 5 : b.targetPct) || 0));
  const stakePct = Math.max(0, Math.min(100, Number(b.stakePct == null ? 3 : b.stakePct) || 0));
  const length = Math.max(1, Math.min(366, Math.round(Number(b.length) || 31)));
  const targetMode = ['bank','calendar','trading','linear'].includes(String(b.targetMode)) ? String(b.targetMode) : 'calendar';
  const commission = Math.max(0, Math.min(20, Number(b.commission == null ? 5 : b.commission) || 0));
  const rulesIn = b.rules && typeof b.rules === 'object' ? b.rules : {};
  const rules = {
    stopLossPct: Math.max(0, Math.min(100, Number(rulesIn.stopLossPct == null ? 5 : rulesIn.stopLossPct) || 0)),
    stopWin: rulesIn.stopWin === false ? false : true,
    maxSessions: Math.max(0, Math.min(10, Math.round(Number(rulesIn.maxSessions) || 0))),
    maxStakePct: Math.max(0, Math.min(100, Number(rulesIn.maxStakePct) || 0))
  };
  const days = b.days && typeof b.days === 'object' && !Array.isArray(b.days) ? b.days : {};
  const ops = Array.isArray(b.ops) ? b.ops.slice(0, 10000) : [];
  return { uid, name, start, cash, targetPct, stakePct, length, targetMode, commission, rules, days, ops };
}
function exchangeUid() { return 'ex_' + crypto.randomBytes(8).toString('hex'); }

app.get('/api/exchange/periods', requireSameSiteAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT uid, name, start_date, state, created_at, updated_at FROM exchange_periods ORDER BY start_date DESC, created_at DESC');
    res.setHeader('Cache-Control', 'no-store');
    res.json({ periods: rows.map(exchangeStateOut) });
  } catch (err) {
    console.error('exchange periods:', err);
    res.status(500).json({ error: 'Errore nel caricamento del Diario Exchange.' });
  }
});

app.post('/api/exchange/periods', requireSameSiteAdmin, async (req, res) => {
  try {
    const uid = exchangeUid();
    const state = exchangeNormalizeState(req.body, uid);
    const now = Date.now();
    await pool.query(`INSERT INTO exchange_periods (uid, name, start_date, state, created_at, updated_at)
                      VALUES ($1,$2,$3,$4::jsonb,$5,$5)`, [uid, state.name, state.start, JSON.stringify(state), now]);
    res.status(201).json({ period: { ...state, updatedAt: now } });
  } catch (err) {
    console.error('exchange create:', err);
    res.status(500).json({ error: 'Impossibile creare il periodo.' });
  }
});

app.put('/api/exchange/periods/:uid', requireSameSiteAdmin, async (req, res) => {
  try {
    const uid = String(req.params.uid || '').trim().slice(0,64);
    const state = exchangeNormalizeState(req.body, uid);
    const now = Date.now();
    const q = await pool.query(`UPDATE exchange_periods SET name=$2, start_date=$3, state=$4::jsonb, updated_at=$5 WHERE uid=$1 RETURNING uid`,
      [uid, state.name, state.start, JSON.stringify(state), now]);
    if (!q.rowCount) return res.status(404).json({ error: 'Periodo non trovato.' });
    res.json({ period: { ...state, updatedAt: now } });
  } catch (err) {
    console.error('exchange update:', err);
    res.status(500).json({ error: 'Impossibile salvare il periodo.' });
  }
});

app.delete('/api/exchange/periods/:uid', requireSameSiteAdmin, async (req, res) => {
  try {
    const uid = String(req.params.uid || '').trim().slice(0,64);
    const q = await pool.query('DELETE FROM exchange_periods WHERE uid=$1', [uid]);
    if (!q.rowCount) return res.status(404).json({ error: 'Periodo non trovato.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('exchange delete:', err);
    res.status(500).json({ error: 'Impossibile eliminare il periodo.' });
  }
});

app.get('/api/exchange/export.csv', requireSameSiteAdmin, async (req, res) => {
  try {
    const uid = String(req.query.uid || '').trim().slice(0,64);
    const { rows } = await pool.query('SELECT state FROM exchange_periods WHERE uid=$1', [uid]);
    if (!rows[0]) return res.status(404).json({ error: 'Periodo non trovato.' });
    const state = rows[0].state || {};
    const ops = Array.isArray(state.ops) ? state.ops : [];
    const header = ['Data','Sessione','Partita','Campionato','Mercato','Strategia','Tipo','Quota entrata','Quota uscita','Stake','Minuto','Profitto','Note'];
    const lines = [header.map(csvCell).join(',')];
    ops.forEach(o => lines.push([
      o.day, Number(o.slot || 0) + 1, o.event, o.league, o.market, o.strategy, o.side,
      o.oddsIn, o.oddsOut, o.stake, o.minute, o.profit, o.note
    ].map(csvCell).join(',')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${backupFilename('easybet-diario-exchange', 'csv')}"`);
    res.send('\ufeff' + lines.join('\n'));
  } catch (err) {
    console.error('exchange export:', err);
    res.status(500).json({ error: 'Impossibile esportare il Diario Exchange.' });
  }
});

// ---------- Masaniello Studio (privato, integrato in EasyBet) ----------
function masanielloNormalizeState(body) {
  const b = body && typeof body === 'object' ? body : {};
  const items = Array.isArray(b.items) ? b.items.slice(0, 200) : [];
  const selected = String(b.selected || '').slice(0, 80);
  const settings = b.settings && typeof b.settings === 'object' && !Array.isArray(b.settings) ? b.settings : {};
  return { app: 'MasanielloStudio/1-web', selected, items, settings };
}

app.get('/api/masaniello/state', requireSameSiteAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT state, updated_at FROM masaniello_state WHERE id='main'");
    const state = rows[0] && rows[0].state ? rows[0].state : { app:'MasanielloStudio/1-web', selected:'', items:[], settings:{} };
    res.setHeader('Cache-Control', 'no-store');
    res.json({ state, updatedAt: rows[0] ? Number(rows[0].updated_at) || 0 : 0 });
  } catch (err) {
    console.error('masaniello state:', err);
    res.status(500).json({ error: 'Errore nel caricamento di Masaniello Studio.' });
  }
});

app.put('/api/masaniello/state', requireSameSiteAdmin, async (req, res) => {
  try {
    const state = masanielloNormalizeState(req.body);
    const now = Date.now();
    await pool.query(`INSERT INTO masaniello_state (id, state, updated_at)
                      VALUES ('main',$1::jsonb,$2)
                      ON CONFLICT (id) DO UPDATE SET state=EXCLUDED.state, updated_at=EXCLUDED.updated_at`,
                     [JSON.stringify(state), now]);
    res.json({ state, updatedAt: now });
  } catch (err) {
    console.error('masaniello save:', err);
    res.status(500).json({ error: 'Impossibile salvare Masaniello Studio.' });
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

// ---------- avvisi partite (Telegram) ----------
app.post('/api/matches', requireSameSiteAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.casa || !b.trasferta) return res.status(400).json({ error: 'Squadre mancanti.' });
    if (!b.startAt || isNaN(Number(b.startAt))) return res.status(400).json({ error: 'Data/ora non valida.' });
    const id = newId();
    const createdAt = Date.now();
    const notifyMinutes = 10;
    const botEnabled = b.botEnabled === false ? false : true;
    const { rows } = await pool.query(
      `INSERT INTO matches (id, data, ora, campionato, casa, trasferta, tipo_giocata, start_at, notify_minutes, notified, created_at, quota_ingresso, esito_manuale, bot_enabled, import_source, import_match_id, import_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [id, b.data || '', b.ora || '', b.campionato || '', b.casa, b.trasferta, b.tipoGiocata || '', Number(b.startAt), notifyMinutes, createdAt, b.quotaIngresso || '', b.esitoManuale || null, botEnabled, b.importSource || null, b.importMatchId || null, b.importData || null]
    );
    res.status(201).json(matchOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nella creazione della partita.' });
  }
});

app.patch('/api/matches/:id', requireSameSiteAdmin, async (req, res) => {
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
app.post('/api/matches/bulk', requireSameSiteAdmin, async (req, res) => {
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
app.post('/api/matches/:id/lifecycle', requireSameSiteAdmin, async (req, res) => {
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

app.delete('/api/matches/:id', requireSameSiteAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Partita non trovata.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'eliminazione della partita.' });
  }
});

app.post('/api/matches/:id/test-alert', requireSameSiteAdmin, async (req, res) => {
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


function liveTotals(payload) {
  function total(a, b) {
    return (a == null || b == null) ? null : Number(a) + Number(b);
  }
  return {
    goals: total(payload.scoreHome, payload.scoreAway),
    xg: total(payload.xgHome, payload.xgAway),
    sot: total(payload.sotHome, payload.sotAway),
    shots: total(payload.shotsHome, payload.shotsAway)
  };
}
function postGoalPressureOk(match, totals) {
  const dxg = (totals.xg == null || match.live_post_goal_base_xg == null) ? null : totals.xg - Number(match.live_post_goal_base_xg);
  const dsot = (totals.sot == null || match.live_post_goal_base_sot == null) ? null : totals.sot - Number(match.live_post_goal_base_sot);
  const dshots = (totals.shots == null || match.live_post_goal_base_shots == null) ? null : totals.shots - Number(match.live_post_goal_base_shots);
  const available = [dxg, dsot, dshots].filter(v => v != null && Number.isFinite(v)).length;
  const ok =
    (dxg != null && dxg >= 0.12) ||
    (dsot != null && dsot >= 1) ||
    (dshots != null && dshots >= 2);
  return { ok, available, dxg, dsot, dshots };
}

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
    const totalsNow = liveTotals(payload);
    const prevGoals = match.live_last_goals == null ? null : Number(match.live_last_goals);
    const currentMinute = payload.minute == null ? null : Math.round(Number(payload.minute));

    let postGoalJustStarted = false;
    if (
      match.live_strategy === 'over15ft' &&
      liveStrategie.RULES.over15ft.allowPostGoal !== false &&
      !match.signal_first_at &&
      !match.live_alert_sent &&
      totalsNow.goals === 1 &&
      currentMinute != null &&
      currentMinute >= 25 &&
      previousLevel !== 'verde' &&
      (
        prevGoals === 0 ||
        (prevGoals == null && !!match.live_last_level && match.live_post_goal_minute == null)
      )
    ) {
      postGoalJustStarted = true;
      match.live_post_goal_minute = currentMinute;
      match.live_post_goal_hold_until = currentMinute + 4;
      match.live_post_goal_base_xg = totalsNow.xg;
      match.live_post_goal_base_sot = totalsNow.sot;
      match.live_post_goal_base_shots = totalsNow.shots;
      await pool.query(
        `UPDATE matches SET
           live_post_goal_minute = $2,
           live_post_goal_hold_until = $3,
           live_post_goal_base_xg = $4,
           live_post_goal_base_sot = $5,
           live_post_goal_base_shots = $6
         WHERE id = $1`,
        [match.id, currentMinute, currentMinute + 4, totalsNow.xg, totalsNow.sot, totalsNow.shots]
      );
    }

    let result = liveStrategie.classify(match.live_strategy, payload, match);
    if (result.error) return res.json({ sent: false, reason: result.error });

    // Over 1.5 FT: se prima del gol non c'era ancora un VERDE ufficiale,
    // il gol non può trasformare immediatamente ATTENDI -> VERDE.
    if (
      match.live_strategy === 'over15ft' &&
      liveStrategie.RULES.over15ft.allowPostGoal !== false &&
      !match.signal_first_at &&
      !match.live_alert_sent &&
      totalsNow.goals === 1 &&
      currentMinute != null &&
      match.live_post_goal_minute != null
    ) {
      const holdUntil = Number(match.live_post_goal_hold_until || (Number(match.live_post_goal_minute) + 4));
      const pressure = postGoalPressureOk(match, totalsNow);
      if (postGoalJustStarted || currentMinute < holdUntil) {
        result = Object.assign({}, result, {
          level: 'rivaluta',
          gateOk: false,
          summary: `Gol appena segnato • rivaluta dal ${holdUntil}° con nuova pressione`,
          score100: result.score100
        });
      } else if (!pressure.ok) {
        result = Object.assign({}, result, {
          level: 'rivaluta',
          gateOk: false,
          summary: 'Attesa nuova pressione post-gol • i dati pre-gol non bastano per entrare',
          score100: result.score100
        });
      }
    }

    const lifecycleNow = Date.now();
    await pool.query(
      `UPDATE matches
       SET live_last_level = $1,
           live_last_summary = $2,
           live_last_updated = $3,
           live_last_score = $4,
           live_started_at = COALESCE(live_started_at, $3),
           live_last_goals = $5
       WHERE id = $6`,
      [result.level, result.summary, lifecycleNow, result.score100 == null ? null : Number(result.score100), totalsNow.goals, match.id]
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
  // Formati: "Italia: Serie A" oppure CGMBet "USA - MLS" / "Wales - Premier League".
  const m = s.split(/\s*:\s*|\s+-\s+/);
  return (m[0] || s).trim();
}
// Vecchio calcolo (solo ':'), usato per ritrovare gli stemmi manuali già salvati.
function legacyCountryHintFromCampionato(campionato) {
  const s = String(campionato || '').trim();
  if (!s) return '';
  const idx = s.indexOf(':');
  return (idx === -1 ? s : s.slice(0, idx)).trim();
}
const COUNTRY_DEMONYMS = {
  'wales':['welsh'],'england':['english'],'scotland':['scottish'],'ireland':['irish'],'northern ireland':['northern irish'],
  'germany':['german'],'norway':['norwegian'],'brazil':['brazil'],'serbia':['serbian'],'united states':['american','united states'],
  'italy':['italian'],'spain':['spanish'],'france':['french'],'netherlands':['dutch'],'chile':['chilean'],'argentina':['argentin'],
  'mexico':['mexican'],'japan':['japanese'],'south korea':['south korean','korean'],'china':['chinese'],'sweden':['swedish'],
  'denmark':['danish'],'finland':['finnish'],'croatia':['croatian'],'slovenia':['sloven'],'slovakia':['slovak'],'czechia':['czech'],
  'poland':['polish'],'romania':['romanian'],'bulgaria':['bulgarian'],'hungary':['hungarian'],'austria':['austrian'],'belgium':['belgian'],
  'switzerland':['swiss'],'portugal':['portuguese'],'greece':['greek'],'turkey':['turkish'],'russia':['russian'],'ukraine':['ukrainian'],
  'australia':['australian'],'lithuania':['lithuanian'],'iceland':['icelandic'],'estonia':['estonian'],'latvia':['latvian'],
  'colombia':['colombian'],'uruguay':['uruguayan'],'paraguay':['paraguayan'],'peru':['peruvian'],'ecuador':['ecuadorian']
};
function descMatchesCountry(descNorm, countryHint){
  if(!countryHint) return false;
  const c=normCountry(countryHint);
  if(descNorm.includes(c)) return true;
  return (COUNTRY_DEMONYMS[c]||[]).some(d=>descNorm.includes(d));
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
          if(descMatchesCountry(descNorm,countryHint)) score+=25;
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

// Ricerca diretta tra le entità Wikidata "club calcistico" (P31=Q476028): evita città, persone e omonimi.
async function lookupCrestWikidataClub(name,countryHint){
  const clean=String(name||'').trim();
  if(!clean) return {url:null,matched:null};
  const req=normCrestName(clean), toks=meaningfulCrestTokens(clean);
  const youth=/\b(women|ladies|femenino|feminino|frauen|reserves?|ii|b|u\d{2}|under \d{2}|academy|youth|juniors?)\b/;
  const ids=[];
  const qs=[...new Set([clean].concat(crestQueries(clean).slice(0,3)))];
  for(const q of qs){
    try{
      const url='https://www.wikidata.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q+' haswbstatement:P31=Q476028')+'&srlimit=8&format=json&origin=*';
      const r=await fetch(url,{headers:{'User-Agent':'EasyBet/1.0 (team crest resolver)'}});
      if(!r.ok) continue;
      const d=await r.json();
      ((d&&d.query&&d.query.search)||[]).forEach(x=>{ if(x&&x.title&&!ids.includes(x.title)) ids.push(x.title); });
    }catch(err){ console.error('Wikidata club search "'+q+'":',err.message); }
    if(ids.length>=8) break;
  }
  if(!ids.length) return {url:null,matched:null};
  try{
    const url='https://www.wikidata.org/w/api.php?action=wbgetentities&ids='+encodeURIComponent(ids.slice(0,12).join('|'))+'&props=labels|aliases|descriptions|claims&languages=en|it|de|es|pt|fr&format=json&origin=*';
    const r=await fetch(url,{headers:{'User-Agent':'EasyBet/1.0 (team crest resolver)'}});
    if(!r.ok) return {url:null,matched:null};
    const d=await r.json();
    let best=null,bestScore=-Infinity;
    for(const id of ids){
      const ent=d&&d.entities&&d.entities[id];
      if(!ent) continue;
      const filename=chooseBestWikidataLogoClaim(ent.claims||{});
      if(!filename) continue;
      const names=[];
      Object.values(ent.labels||{}).forEach(l=>names.push(normCrestName(l.value)));
      Object.values(ent.aliases||{}).forEach(arr=>(arr||[]).forEach(a=>names.push(normCrestName(a.value))));
      const desc=normCrestName(Object.values(ent.descriptions||{}).map(x=>x.value).join(' '));
      let score=0;
      if(names.includes(req)) score+=120;
      else if(names.some(n=>n.includes(req)||req.includes(n))) score+=60;
      const label=names[0]||'';
      score+=toks.filter(t=>names.some(n=>n.split(' ').includes(t))).length*25;
      if(descMatchesCountry(desc,countryHint)) score+=40;
      if(youth.test(label)&&!youth.test(req)) score-=90;
      if(score>bestScore){bestScore=score;best={id,filename,label:(ent.labels&&ent.labels.en&&ent.labels.en.value)||label};}
    }
    if(!best||bestScore<60) return {url:null,matched:null};
    return {url:'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(best.filename)+'?width=320',matched:best.label,source:'wikidata-club'};
  }catch(err){
    console.error('Wikidata club entities "'+clean+'":',err.message);
    return {url:null,matched:null};
  }
}

async function lookupCrest(name,countryHint){
  const key=normCrestName(name);

  // 1) Club noti/ambigui: QID Wikidata fissato. È la fonte più sicura.
  const fixedId=CREST_WIKIDATA_IDS[key];
  if(fixedId){
    const fixed=await lookupCrestWikidataById(fixedId,name);
    if(fixed&&fixed.url) return fixed;
  }

  // 1b) Ricerca mirata tra i club di calcio di Wikidata.
  const club=await lookupCrestWikidataClub(name,countryHint);
  if(club && club.url) return club;

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

// Massimo 3 ricerche stemma contemporanee: troppe richieste insieme fanno bloccare Wikimedia (429) e i loghi restano vuoti.
let crestActive=0; const crestWaiting=[];
function withCrestSlot(fn){
  return new Promise((resolve,reject)=>{
    const run=()=>{crestActive++;Promise.resolve().then(fn).then(resolve,reject).finally(()=>{crestActive--;const nx=crestWaiting.shift();if(nx)nx();});};
    if(crestActive<3) run(); else crestWaiting.push(run);
  });
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
    const legacyHint = legacyCountryHintFromCampionato(req.query.country || '');
    const legacyKey = normCrestName(name) + (legacyHint ? '|' + normCountry(legacyHint) : '');
    const manualQ = await pool.query('SELECT * FROM team_crests WHERE name_norm = ANY($1::text[]) AND manual=true ORDER BY name_norm = $2 DESC', [[baseKey, legacyKey], baseKey]);
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

    const found=await withCrestSlot(()=>lookupCrest(name,countryHint));
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
app.put('/api/team-crest', requireSameSiteAdmin, async (req,res)=>{
  try{
    const name=String((req.body||{}).name||'').trim();
    const campionato=String((req.body||{}).campionato||'').trim();
    const rawUrl=String((req.body||{}).url||'').trim();
    if(!name) return res.status(400).json({error:'Nome squadra mancante.'});
    const countryHint=countryHintFromCampionato(campionato);
    const key=normCrestName(name)+(countryHint?'|'+normCountry(countryHint):'');
    const autoKey='auto:'+CREST_CACHE_VERSION+'|'+key;
    const legacyHint=legacyCountryHintFromCampionato(campionato);
    const legacyKey=normCrestName(name)+(legacyHint?'|'+normCountry(legacyHint):'');
    if(!rawUrl || rawUrl.toUpperCase()==='AUTO'){
      await pool.query('DELETE FROM team_crests WHERE name_norm = ANY($1::text[])',[[key,autoKey,legacyKey]]);
      return res.json({ok:true,url:null,manual:false,reset:true});
    }
    if(!/^https?:\/\//i.test(rawUrl)) return res.status(400).json({error:'Inserisci un URL http/https valido.'});
    await pool.query(
      `INSERT INTO team_crests (name_norm,nome_originale,url,fetched_at,manual) VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (name_norm) DO UPDATE SET nome_originale=EXCLUDED.nome_originale,url=EXCLUDED.url,fetched_at=EXCLUDED.fetched_at,manual=true`,
      [key,name,rawUrl,Date.now()]
    );
    // Se imposto manualmente, elimino l'eventuale cache automatica della stessa squadra.
    await pool.query('DELETE FROM team_crests WHERE name_norm = ANY($1::text[])',[[autoKey].concat(legacyKey!==key?[legacyKey]:[])]);
    res.json({ok:true,url:rawUrl,manual:true});
  }catch(err){ console.error(err); res.status(500).json({error:'Errore nel salvataggio dello stemma.'}); }
});

app.put('/api/alert-settings', requireSameSiteAdmin, async (req, res) => {
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

// Fallback per qualsiasi GET non-API su un percorso sconosciuto:
 // ritorna alla pagina pubblica EasyBet invece di mostrare un 404 nudo.
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
      console.log('EasyBet in ascolto sulla porta ' + PORT);
    });
    telegram.startPolling();
    scheduler.start();
  })
  .catch(function(err){
    console.error('Errore durante la migrazione del database:', err);
    process.exit(1);
  });
