const path = require('path');
const crypto = require('crypto');
const express = require('express');
const { pool, migrate } = require('./db');
const telegram = require('./telegram');
const scheduler = require('./scheduler');
const liveStrategie = require('./strategie-live');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

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
    liveLastUpdated: row.live_last_updated === null || row.live_last_updated === undefined ? null : Number(row.live_last_updated)
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
    const notifyMinutes = isNaN(parseInt(b.notifyMinutes, 10)) ? 10 : parseInt(b.notifyMinutes, 10);
    const { rows } = await pool.query(
      `INSERT INTO matches (id, data, ora, campionato, casa, trasferta, tipo_giocata, start_at, notify_minutes, notified, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10) RETURNING *`,
      [id, b.data || '', b.ora || '', b.campionato || '', b.casa, b.trasferta, b.tipoGiocata || '', Number(b.startAt), notifyMinutes, createdAt]
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
      const nm = parseInt(fields.notifyMinutes, 10);
      sets.push('notify_minutes = $' + (i++)); vals.push(isNaN(nm) ? 10 : nm);
    }
    if (Object.prototype.hasOwnProperty.call(fields, 'notified')) {
      sets.push('notified = $' + (i++)); vals.push(!!fields.notified);
    }
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
    if (!sets.length) return res.status(400).json({ error: 'Nessun campo da aggiornare.' });
    vals.push(id);
    const { rows } = await pool.query(
      'UPDATE matches SET ' + sets.join(', ') + ' WHERE id = $' + i + ' RETURNING *',
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Partita non trovata.' });
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

app.put('/api/alert-settings', async (req, res) => {
  try {
    const { notifyMinutes } = req.body || {};
    const nm = parseInt(notifyMinutes, 10);
    if (isNaN(nm) || nm < 1) return res.status(400).json({ error: 'Minuti non validi.' });
    const { rows } = await pool.query(
      "UPDATE alert_settings SET notify_minutes = $1 WHERE id='main' RETURNING *",
      [nm]
    );
    res.json(alertSettingsOut(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Errore nel salvataggio delle impostazioni avvisi.' });
  }
});

app.get('/healthz', (req, res) => res.status(200).send('ok'));

// SPA fallback: serve index.html for any non-API GET (harmless here since there's one page,
// but keeps things robust if navigation ever adds routes).
app.get('*', function(req, res, next){
  if (req.path.indexOf('/api/') === 0) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;

migrate()
  .then(function(){
    app.listen(PORT, function(){
      console.log('Taccuino Exchange in ascolto sulla porta ' + PORT);
    });
    telegram.startPolling();
    scheduler.start();
  })
  .catch(function(err){
    console.error('Errore durante la migrazione del database:', err);
    process.exit(1);
  });
