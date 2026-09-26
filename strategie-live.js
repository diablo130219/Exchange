// Profili di ingresso live (VERDE/GIALLO/ROSSO) definiti da Monica.
// Da questa versione il VERDE usa un punteggio adattivo: una singola metrica
// mancante/debole non boccia automaticamente il match. Restano però dei
// "core signals" obbligatori per evitare ingressi basati solo su volume sterile.

function n(v) {
  var x = Number(v);
  return v === null || v === undefined || v === '' || !Number.isFinite(x) ? null : x;
}

function sum2(a, b) {
  a = n(a); b = n(b);
  if (a === null && b === null) return null;
  if (a === null || b === null) return null; // totale affidabile solo se ho entrambe le squadre
  return a + b;
}

function weighted(checks) {
  var available = checks.filter(function (c) { return c.value !== null; });
  var total = available.reduce(function (acc, c) { return acc + c.weight; }, 0);
  var pass = available.filter(function (c) { return c.pass; })
    .reduce(function (acc, c) { return acc + c.weight; }, 0);
  return {
    score: total ? pass / total : 0,
    available: available.length,
    passed: available.filter(function (c) { return c.pass; }).length,
    checks: available
  };
}

function c(label, value, pass, weight) {
  return { label: label, value: n(value), pass: !!pass, weight: weight || 1 };
}

function adaptive(m, cfg) {
  var checks = [
    c('xG', m.xg, m.xg !== null && m.xg >= cfg.xg, 1.4),
    c('SOT', m.sot, m.sot !== null && m.sot >= cfg.sot, 1.5),
    c('Occ', m.chances, m.chances !== null && m.chances >= cfg.chances, 1.0),
    c('Tiri', m.shots, m.shots !== null && m.shots >= cfg.shots, 1.0),
    c('Tiri area', m.boxshots, m.boxshots !== null && m.boxshots >= cfg.boxshots, 1.0),
    c('Tocchi area', m.touches, m.touches !== null && m.touches >= cfg.touches, 0.7)
  ];
  var w = weighted(checks);
  var core = !!cfg.core(m);
  return {
    green: w.available >= 2 && core && w.score >= cfg.greenAt,
    yellow: w.available >= 2 && w.score >= cfg.yellowAt,
    score: w.score,
    passed: w.passed,
    available: w.available,
    checks: w.checks,
    core: core
  };
}

const STRATEGIE = {
  over05ht: {
    key: 'over05ht',
    label: 'Over 0.5 HT',
    scope: 'totale',
    gate: null,
    quotaLabel: '1,65–1,80',
    evaluate: function (m) {
      return adaptive(m, {
        xg: 0.55, sot: 2, chances: 1, shots: 6, boxshots: 5, touches: 10,
        greenAt: 0.60, yellowAt: 0.30,
        core: function (x) {
          return (x.sot !== null && x.sot >= 2) ||
            (x.shots !== null && x.shots >= 7) ||
            (x.xg !== null && x.xg >= 0.60);
        }
      });
    }
  },
  over15ft: {
    key: 'over15ft',
    label: 'Over 1.5 FT',
    scope: 'totale',
    gate: null,
    quotaLabel: '~1,66',
    evaluate: function (m) {
      return adaptive(m, {
        xg: 0.85, sot: 3, chances: 1, shots: 7, boxshots: 6, touches: 12,
        greenAt: 0.60, yellowAt: 0.30,
        core: function (x) {
          return (x.sot !== null && x.sot >= 3) ||
            (x.shots !== null && x.shots >= 8) ||
            (x.xg !== null && x.xg >= 0.90);
        }
      });
    }
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
    quotaLabel: '1,90–2,20',
    // Lay X resta volutamente più selettivo.
    evaluate: function (m) {
      var w = weighted([
        c('xG', m.xg, m.xg !== null && m.xg >= 1.50, 1.5),
        c('SOT', m.sot, m.sot !== null && m.sot >= 4, 1.6),
        c('Occ', m.chances, m.chances !== null && m.chances >= 2, 1.2),
        c('Tiri', m.shots, m.shots !== null && m.shots >= 10, 1.0),
        c('Tiri area', m.boxshots, m.boxshots !== null && m.boxshots >= 7, 1.0),
        c('Tocchi area', m.touches, m.touches !== null && m.touches >= 14, 0.7)
      ]);
      var coreCount = 0;
      if (m.xg !== null && m.xg >= 1.35) coreCount++;
      if (m.sot !== null && m.sot >= 4) coreCount++;
      if (m.chances !== null && m.chances >= 1) coreCount++;
      return {
        green: w.available >= 2 && coreCount >= 2 && w.score >= 0.66,
        yellow: w.available >= 2 && w.score >= 0.42,
        score: w.score, passed: w.passed, available: w.available, checks: w.checks, core: coreCount >= 2
      };
    }
  },
  backfav: {
    key: 'backfav',
    label: 'Back Favorita pre-gol',
    scope: 'favorita',
    gate: function (ctx) {
      return ctx.scoreHome !== null && ctx.scoreAway !== null && ctx.scoreHome === 0 && ctx.scoreAway === 0;
    },
    gateLabel: 'punteggio ancora 0-0',
    quotaLabel: '~1,90',
    evaluate: function (m) {
      return adaptive(m, {
        xg: 0.50, sot: 2, chances: 1, shots: 5, boxshots: 4, touches: 8,
        greenAt: 0.58, yellowAt: 0.28,
        core: function (x) {
          return (x.xg !== null && x.xg >= 0.55) ||
            (x.sot !== null && x.sot >= 2) ||
            (x.shots !== null && x.shots >= 6);
        }
      });
    }
  }
};

function computeMetrics(strategy, payload, match) {
  if (strategy.scope === 'totale') {
    return {
      xg: sum2(payload.xgHome, payload.xgAway),
      sot: sum2(payload.sotHome, payload.sotAway),
      chances: sum2(payload.chancesHome, payload.chancesAway),
      shots: sum2(payload.shotsHome, payload.shotsAway),
      boxshots: sum2(payload.boxshotsHome, payload.boxshotsAway),
      touches: sum2(payload.touchesHome, payload.touchesAway)
    };
  }
  var side = match.live_favorita;
  if (side === 'casa') {
    return {
      xg: n(payload.xgHome), sot: n(payload.sotHome), chances: n(payload.chancesHome),
      shots: n(payload.shotsHome), boxshots: n(payload.boxshotsHome), touches: n(payload.touchesHome)
    };
  }
  if (side === 'trasferta') {
    return {
      xg: n(payload.xgAway), sot: n(payload.sotAway), chances: n(payload.chancesAway),
      shots: n(payload.shotsAway), boxshots: n(payload.boxshotsAway), touches: n(payload.touchesAway)
    };
  }
  return null;
}

function fmt(v, digits) {
  return v === null ? 'N/D' : (digits ? Number(v).toFixed(digits) : String(v));
}

// Ritorna { level, summary, gateOk, metrics, score } oppure { error }
function classify(strategyKey, payload, match) {
  const strategy = STRATEGIE[strategyKey];
  if (!strategy) return { error: 'strategia-sconosciuta' };

  const ctx = { scoreHome: n(payload.scoreHome), scoreAway: n(payload.scoreAway) };
  const gateOk = strategy.gate ? !!strategy.gate(ctx) : true;
  const metrics = computeMetrics(strategy, payload, match);
  if (!metrics) return { error: 'favorita-non-impostata' };

  const evalResult = strategy.evaluate(metrics);
  let level = 'rosso';
  if (gateOk && evalResult.green) level = 'verde';
  else if (evalResult.yellow) level = 'giallo';

  const pct = Math.round((evalResult.score || 0) * 100);
  const summary = 'xG ' + fmt(metrics.xg, 2) + ' • SOT ' + fmt(metrics.sot) + ' • Occ ' + fmt(metrics.chances) +
    ' • Tiri ' + fmt(metrics.shots) + ' • Area ' + fmt(metrics.boxshots) + ' • Tocchi ' + fmt(metrics.touches) +
    ' • score ' + pct + '%' +
    (strategy.gate ? (gateOk ? '' : ' • condizione punteggio non soddisfatta (' + strategy.gateLabel + ')') : '');

  return {
    level: level,
    summary: summary,
    gateOk: gateOk,
    metrics: metrics,
    score: evalResult.score,
    passed: evalResult.passed,
    available: evalResult.available,
    core: evalResult.core,
    label: strategy.label
  };
}

module.exports = { STRATEGIE: STRATEGIE, classify: classify };
