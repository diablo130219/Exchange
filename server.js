const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pool, migrate } = require('./db');
const telegram = require('./telegram');
const scheduler = require('./scheduler');
const liveStrategie = require('./strategie-live');

const app = express();
app.use(express.json());
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
    quotaIngresso: row.quota_ingresso || '',
    esitoManuale: row.esito_manuale || '',
    botEnabled: row.bot_enabled === false ? false : true
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
app.post('/api/matches', async (req, res) => {
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

app.patch('/api/matches/:id', async (req, res) => {
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
      sets.push('esito_manuale = $' + (i++)); vals.push(valid.indexOf(v) !== -1 ? v : null);
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

app.delete('/api/matches/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM matches WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Partita non trovata.' });
    res.status(204).end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nell\'eliminazione della partita.' });
  }
});

app.post('/api/matches/:id/test-alert', async (req, res) => {
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

app.post('/api/live-stats', async (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  try {
    const b = req.body || {};
    const casa = String(b.casa || '').trim();
    const trasferta = String(b.trasferta || '').trim();
    if (!casa || !trasferta) return res.status(400).json({ error: 'Squadre mancanti.' });

    const payload = {
      scoreHome: numOrNull(b.scoreHome),
      scoreAway: numOrNull(b.scoreAway),
      xgHome: numOrNull(b.xgHome) || 0,
      xgAway: numOrNull(b.xgAway) || 0,
      sotHome: numOrNull(b.sotHome) || 0,
      sotAway: numOrNull(b.sotAway) || 0,
      chancesHome: numOrNull(b.chancesHome) || 0,
      chancesAway: numOrNull(b.chancesAway) || 0
    };

    const { rows } = await pool.query(
      `SELECT * FROM matches WHERE live_alert_sent = false AND live_strategy IS NOT NULL`
    );
    const match = rows.find(function (r) {
      return teamNamesMatch(r.casa, casa) && teamNamesMatch(r.trasferta, trasferta);
    });
    if (!match) return res.json({ sent: false, reason: 'no-match' });

    const result = liveStrategie.classify(match.live_strategy, payload, match);
    if (result.error) return res.json({ sent: false, reason: result.error });

    await pool.query(
      'UPDATE matches SET live_last_level = $1, live_last_summary = $2, live_last_updated = $3 WHERE id = $4',
      [result.level, result.summary, Date.now(), match.id]
    );

    if (result.level === 'verde' && result.gateOk) {
      const league = match.campionato ? ' (' + escapeHtmlLite(match.campionato) + ')' : '';
      const tipo = match.tipo_giocata ? escapeHtmlLite(match.tipo_giocata) : '—';
      const punteggio = (payload.scoreHome !== null && payload.scoreAway !== null)
        ? ('\n📍 Risultato attuale: ' + payload.scoreHome + '-' + payload.scoreAway) : '';
      const text = '🟢 <b>Segnale LIVE — ' + escapeHtmlLite(result.label) + '</b>' + league + '\n' +
        escapeHtmlLite(match.casa) + ' - ' + escapeHtmlLite(match.trasferta) + '\n' +
        '👉 ' + tipo + punteggio + '\n' +
        '📊 ' + escapeHtmlLite(result.summary);
      const sentTo = await telegram.broadcast(text);
      await pool.query('UPDATE matches SET live_alert_sent = true WHERE id = $1', [match.id]);
      return res.json({ sent: true, sentTo, level: result.level, summary: result.summary, match: { casa: match.casa, trasferta: match.trasferta } });
    }
    return res.json({ sent: false, level: result.level, summary: result.summary, matched: { casa: match.casa, trasferta: match.trasferta } });
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
  'kauno zalgiris': ['FK Kauno Zalgiris', 'Kauno Zalgiris']
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
async function lookupCrestWikipedia(name,countryHint){
  const clean=String(name||'').trim();
  if(!clean) return {url:null,matched:null};
  const searches=[];
  if(countryHint) searches.push(clean+' football club '+countryHint);
  searches.push(clean+' football club');
  searches.push(clean+' FC');
  for(const q of [...new Set(searches)]){
    try{
      const url='https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=0&gsrlimit=6&gsrsearch='+encodeURIComponent(q)+'&prop=pageimages&pithumbsize=320&format=json&origin=*';
      const r=await fetch(url,{headers:{'User-Agent':'EasyBet/1.0 (team crest fallback)'}});
      if(!r.ok) continue;
      const data=await r.json();
      const pages=data&&data.query&&data.query.pages?Object.values(data.query.pages):[];
      if(!pages.length) continue;
      const requested=normCrestName(clean);
      let best=null,bestScore=-Infinity;
      for(const page of pages){
        if(!page||!page.thumbnail||!page.thumbnail.source) continue;
        const title=normCrestName(page.title||'');
        let score=0;
        if(title===requested) score+=120;
        if(title.includes(requested)||requested.includes(title)) score+=70;
        const reqTokens=requested.split(' ').filter(x=>x.length>2);
        score+=reqTokens.filter(x=>title.includes(x)).length*15;
        if(/football|soccer|club|fc|cf|afc|sc/.test(title)) score+=10;
        if(score>bestScore){bestScore=score;best=page;}
      }
      if(best&&best.thumbnail&&bestScore>=25){
        return {url:best.thumbnail.source,matched:best.title||null,source:'wikipedia'};
      }
    }catch(err){ console.error('Fallback Wikipedia stemma "'+q+'":',err.message); }
  }
  return {url:null,matched:null};
}

async function lookupCrest(name,countryHint){
  const queries=crestQueries(name);
  let best=null, bestScore=-Infinity;
  for(const query of queries){
    try{
      const r=await fetch('https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t='+encodeURIComponent(query));
      if(!r.ok) continue;
      const data=await r.json();
      const teams=(data&&Array.isArray(data.teams)?data.teams:[]).filter(t=>t&&t.strBadge);
      for(const team of teams){
        const score=crestCandidateScore(team,name,query,countryHint);
        const passesCountry=!countryHint || countriesMatch(team.strCountry,countryHint);
        const finalScore=score + (passesCountry ? 25 : 0);
        if(finalScore>bestScore){bestScore=finalScore;best=team;}
      }
      if(bestScore>=150) break;
    }catch(err){ console.error('Lookup stemma "'+query+'":',err.message); }
  }
  if(best && best.strBadge) return {url:best.strBadge,matched:best.strTeam||null,source:'sportsdb'};
  return await lookupCrestWikipedia(name,countryHint);
}

app.get('/api/team-crest', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Nome squadra mancante.' });
    const countryHint = countryHintFromCampionato(req.query.country || '');
    const key = normCrestName(name) + (countryHint ? '|' + normCountry(countryHint) : '');
    const { rows } = await pool.query('SELECT * FROM team_crests WHERE name_norm = $1', [key]);
    const cached = rows[0], now=Date.now();
    if(cached){
      if(cached.manual) return res.json({url:cached.url||null,manual:true,source:'manual'});
      const age=now-Number(cached.fetched_at);
      const fresh=cached.url ? age<CREST_TTL_HIT_MS : age<CREST_TTL_MISS_MS;
      if(fresh) return res.json({url:cached.url||null,manual:false,source:'cache'});
    }
    const found=await lookupCrest(name,countryHint);
    await pool.query(
      `INSERT INTO team_crests (name_norm,nome_originale,url,fetched_at,manual) VALUES ($1,$2,$3,$4,false)
       ON CONFLICT (name_norm) DO UPDATE SET nome_originale=EXCLUDED.nome_originale,url=EXCLUDED.url,fetched_at=EXCLUDED.fetched_at,manual=false`,
      [key,name,found.url,now]
    );
    res.json({url:found.url,manual:false,source:found.url?(found.source||'provider'):'fallback',matched:found.matched});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel recupero dello stemma.' });
  }
});

// Override manuale dall'admin. URL vuoto o "AUTO" = torna alla ricerca automatica.
app.put('/api/team-crest', async (req,res)=>{
  try{
    const name=String((req.body||{}).name||'').trim();
    const campionato=String((req.body||{}).campionato||'').trim();
    const rawUrl=String((req.body||{}).url||'').trim();
    if(!name) return res.status(400).json({error:'Nome squadra mancante.'});
    const countryHint=countryHintFromCampionato(campionato);
    const key=normCrestName(name)+(countryHint?'|'+normCountry(countryHint):'');
    if(!rawUrl || rawUrl.toUpperCase()==='AUTO'){
      await pool.query('DELETE FROM team_crests WHERE name_norm=$1',[key]);
      return res.json({ok:true,url:null,manual:false,reset:true});
    }
    if(!/^https?:\/\//i.test(rawUrl)) return res.status(400).json({error:'Inserisci un URL http/https valido.'});
    await pool.query(
      `INSERT INTO team_crests (name_norm,nome_originale,url,fetched_at,manual) VALUES ($1,$2,$3,$4,true)
       ON CONFLICT (name_norm) DO UPDATE SET nome_originale=EXCLUDED.nome_originale,url=EXCLUDED.url,fetched_at=EXCLUDED.fetched_at,manual=true`,
      [key,name,rawUrl,Date.now()]
    );
    res.json({ok:true,url:rawUrl,manual:true});
  }catch(err){ console.error(err); res.status(500).json({error:'Errore nel salvataggio dello stemma.'}); }
});

app.put('/api/alert-settings', async (req, res) => {
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
