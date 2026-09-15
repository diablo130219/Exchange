// Profili di ingresso live (VERDE/GIALLO/ROSSO) definiti da Monica.
// "scope" dice se le metriche vanno lette sul totale partita (casa+trasferta)
// o solo sulla squadra favorita (impostata per singola partita in dashboard).
// "gate" è una condizione extra sul punteggio, richiesta prima di considerare l'ingresso.

const STRATEGIE = {
  over05ht: {
    key: 'over05ht',
    label: 'Over 0.5 HT',
    scope: 'totale',
    gate: null,
    verde: function (m) { return m.xg >= 0.65 && m.sot >= 2 && m.chances >= 1; },
    giallo: function (m) { return m.xg >= 0.35; }
  },
  over15ft: {
    key: 'over15ft',
    label: 'Over 1.5 FT',
    scope: 'totale',
    gate: null,
    verde: function (m) { return m.xg >= 1.00 && m.sot >= 3 && m.chances >= 1; },
    giallo: function (m) { return m.xg >= 0.55; }
  },
  layx: {
    key: 'layx',
    label: 'Lay X',
    scope: 'totale',
    gate: function (ctx) {
      return ctx.scoreHome !== null && ctx.scoreAway !== null &&
        ctx.scoreHome === ctx.scoreAway && (ctx.scoreHome === 0 || ctx.scoreHome === 1);
    },
    gateLabel: 'punteggio 0-0 o 1-1',
    verde: function (m) { return m.xg >= 1.5 && m.sot >= 4 && m.chances >= 2; },
    giallo: function (m) { return m.xg >= 0.9; }
  },
  backfav: {
    key: 'backfav',
    label: 'Back Favorita pre-gol',
    scope: 'favorita',
    gate: function (ctx) {
      return ctx.scoreHome !== null && ctx.scoreAway !== null && ctx.scoreHome === 0 && ctx.scoreAway === 0;
    },
    gateLabel: 'punteggio ancora 0-0',
    verde: function (m) { return m.xg >= 0.60 && m.sot >= 2 && m.chances >= 1; },
    giallo: function (m) { return m.xg >= 0.30; }
  }
};

function computeMetrics(strategy, payload, match) {
  if (strategy.scope === 'totale') {
    return {
      xg: (payload.xgHome || 0) + (payload.xgAway || 0),
      sot: (payload.sotHome || 0) + (payload.sotAway || 0),
      chances: (payload.chancesHome || 0) + (payload.chancesAway || 0)
    };
  }
  // scope === 'favorita'
  var side = match.live_favorita;
  if (side === 'casa') {
    return { xg: payload.xgHome || 0, sot: payload.sotHome || 0, chances: payload.chancesHome || 0 };
  }
  if (side === 'trasferta') {
    return { xg: payload.xgAway || 0, sot: payload.sotAway || 0, chances: payload.chancesAway || 0 };
  }
  return null; // favorita non impostata sulla partita
}

// Ritorna { level, summary, gateOk, metrics } oppure { error }
function classify(strategyKey, payload, match) {
  const strategy = STRATEGIE[strategyKey];
  if (!strategy) return { error: 'strategia-sconosciuta' };

  const ctx = { scoreHome: payload.scoreHome, scoreAway: payload.scoreAway };
  const gateOk = strategy.gate ? !!strategy.gate(ctx) : true;

  const metrics = computeMetrics(strategy, payload, match);
  if (!metrics) return { error: 'favorita-non-impostata' };

  let level = 'rosso';
  if (gateOk && strategy.verde(metrics)) level = 'verde';
  else if (strategy.giallo(metrics)) level = 'giallo';

  const summary = 'xG ' + metrics.xg.toFixed(2) + ' • SOT ' + metrics.sot + ' • Occ ' + metrics.chances +
    (strategy.gate ? (gateOk ? '' : ' • condizione punteggio non soddisfatta (' + strategy.gateLabel + ')') : '');

  return { level: level, summary: summary, gateOk: gateOk, metrics: metrics, label: strategy.label };
}

module.exports = { STRATEGIE: STRATEGIE, classify: classify };
