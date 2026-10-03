// EasyBet - motore unico delle strategie LIVE.
// Questo file viene usato sia dal backend Node sia dal Live Analyzer nel browser.
// Tutti i paletti/threshold delle strategie devono vivere qui, non duplicati nel frontend.

(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.EasyBetLiveStrategies = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  function n(v) {
    var x = Number(v);
    return v === null || v === undefined || v === '' || !Number.isFinite(x) ? null : x;
  }
  function pair(v) {
    if (!Array.isArray(v)) return [null, null];
    return [n(v[0]), n(v[1])];
  }
  function sumPair(p) {
    p = pair(p);
    return p[0] === null || p[1] === null ? null : p[0] + p[1];
  }
  function diffPair(p) {
    p = pair(p);
    return p[0] === null || p[1] === null ? null : p[0] - p[1];
  }
  function round2(v) { return v == null ? null : Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
  function numFromText(v) {
    if (v == null) return null;
    var m = String(v).replace(',', '.').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  }
  function oddNum(v) {
    var x = Number(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(x) && x > 1 ? x : null;
  }
  function line(label, value, pass, weight, need) {
    return [label, !!pass, value !== null && value !== undefined, weight || 1, value, need];
  }
  function fmtVal(v) {
    if (v === true) return 'sì';
    if (v === false) return 'no';
    var x = Number(v);
    if (!Number.isFinite(x)) return String(v);
    return Math.abs(x - Math.round(x)) < 1e-9 ? String(Math.round(x)) : (Math.round(x * 100) / 100).toFixed(2);
  }
  function weighted(list) {
    var available = list.filter(function (x) { return x[2]; });
    var totalW = available.reduce(function (a, x) { return a + (x[3] || 1); }, 0);
    var passW = available.filter(function (x) { return x[1]; }).reduce(function (a, x) { return a + (x[3] || 1); }, 0);
    var passed = available.filter(function (x) { return x[1]; }).length;
    var missing = available.filter(function (x) { return !x[1]; })
      .sort(function (a, b) { return (b[3] || 1) - (a[3] || 1); })
      .map(function (x) { return x[0] + ' ' + fmtVal(x[4]) + (x[5] ? ' → serve ' + x[5] : ''); });
    return {
      missing: missing,
      checks: available.map(function (x) { return [x[0], x[1]]; }),
      available: available.length,
      passed: passed,
      score: totalW ? passW / totalW : 0,
      totalWeight: totalW
    };
  }
  function score100(score) {
    if (score === null || score === undefined || !Number.isFinite(Number(score))) return null;
    return Math.max(0, Math.min(100, Math.round(Number(score) * 100)));
  }
  function sig(name, state, reason, why, criteria, score, extra) {
    var o = { name: name, state: state, reason: reason, why: why, criteria: criteria || [], score: score == null ? null : score, score100: score100(score) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function oddText(v) {
    var x = oddNum(v);
    return x == null ? '' : (' • quota ' + x.toFixed(2));
  }
  function softState(name, score, checks, greenAt, strongAt, waitAt, reasonBase, whyBase, core) {
    var miss = (checks.missing || []).slice(0, 3);
    var ex = { missing: checks.missing || [] };
    var missTxt = miss.length ? 'Manca: ' + miss.join(' · ') + '.' : '';
    if (checks.available < 2) return sig(name, 'DATI', 'Dati live insufficienti per una lettura affidabile.', 'Servono almeno 2 indicatori (xG, tiri, tiri in porta…). Incolla le statistiche o usa AUTO.', checks.checks, score, ex);
    if (score >= greenAt && core !== false) return sig(name, 'VERDE', reasonBase + ' ' + checks.passed + '/' + checks.available + ' criteri ok.', whyBase, checks.checks, score, ex);
    if (score >= strongAt) return sig(name, 'ATTENDI FORTE', 'Vicino all’ingresso: ' + checks.passed + '/' + checks.available + ' criteri ok.', missTxt || 'Manca una conferma forte (tiri in porta o xG).', checks.checks, score, ex);
    if (score >= waitAt) return sig(name, 'ATTENDI', 'Segnali presenti ma incompleti: ' + checks.passed + '/' + checks.available + ' criteri ok.', missTxt || whyBase, checks.checks, score, ex);
    return sig(name, 'NO BET', 'Pressione ancora troppo bassa: ' + checks.passed + '/' + checks.available + ' criteri ok.', missTxt || 'Indicatori deboli.', checks.checks, score, ex);
  }

  // UNICA configurazione dei paletti. Frontend e backend leggono questi stessi valori.
  var RULES = {
    over05ht: {
      label: 'Over 0.5 HT',
      window: { from: 15, to: 32 },
      base: { xg: 0.55, sot: 2, big: 1, box: 5, touches: 10, shots: 6, quotaMin: 1.60, quotaMax: 2.10 },
      system: 'O0.5 HT PRE+LIVE', // live sullo 0-0 dal 15', quota >= 1.60
      weights: { xg: 1.4, sot: 1.5, big: 1.1, box: 1.0, touches: 0.7, shots: 1.0, quota: 0.6 },
      state: { green: 0.60, strong: 0.46, wait: 0.30 },
      core: { sot: 2, shots: 7, xg: 0.60 }
    },
    over15ft: {
      label: 'Over 1.5 FT',
      system: 'EXCH O1.5 GOL 25-70', // ingresso solo sullo 0-0 tra 20' e 30', quota >= 1.70, uscita al primo gol o al 71'
      window: { from: 20, to: 30 },
      exitMinute: 71,
      allowPostGoal: false,
      base: { xg: 0.85, sot: 3, big: 1, box: 6, touches: 12, shots: 7, quotaMin: 1.70 },
      weights: { xg: 1.4, sot: 1.5, big: 1.0, box: 1.0, touches: 0.7, shots: 1.0, quota: 0.7 },
      state: { green: 0.60, strong: 0.47, wait: 0.30 },
      core: { sot: 3, shots: 8, xg: 0.90 },
      mid: { xg: 1.20, sot: 4, shots: 9, green: 0.64, strong: 0.50, wait: 0.34 },
      late: { xg: 1.55, sot: 5, shots: 11, green: 0.72, strong: 0.58, wait: 0.42 }
    },
    layx: {
      label: 'Banca X',
      system: 'EXCH LAY X HT', // ingresso solo all'intervallo sullo 0-0 o 1-1, quota Lay X <= 2.10, tenere fino al 90'
      quotaMax: 2.10,
      dyn: { dxg: 0.30, dsot: 1, dshots: 3, dtouches: 6, dbig: 1, quotaMin: 1.70, quotaMaxEval: 2.50 },
      weights: { dxg: 1.5, dsot: 1.5, dshots: 1.0, dtouches: 0.8, dbig: 1.1, quota: 0.7 },
      state: { green: 0.55, wait: 0.40, weak: 0.25 }
    },
    backfav: {
      label: 'Segna favorita',
      dyn: { dxg: 0.25, dsot: 1, dshots: 3, dtouches: 6, dbig: 1, quotaMin: 1.55, quotaMax: 2.50 },
      weights: { dxg: 1.5, dsot: 1.5, dshots: 1.0, dtouches: 0.8, dbig: 1.1, quota: 0.7 },
      state: { green: 0.58, strong: 0.42, wait: 0.28 }
    },
    under05ht: {
      label: 'Under 0.5 HT',
      system: 'EXCH UNDER 0.5 HT', // ingresso pre-match a quota >= 2.95, si tiene fino all'intervallo
      quotaMin: 2.95,
      warn: { xg: 0.80, sot: 3, big: 2 }
    },
    favht: {
      label: 'Favorito HT',
      system: 'EXCH FAVORITO HT', // favorito in casa (quota 1 pre-match <= 1.60), ingresso solo all'intervallo
      preMatchMax: 1.60,
      drawBackMin: 1.85,   // in parita': punta 1 solo a quota >= 1.85 (backtest: vince 57,3%)
      trailLayMax: 2.10    // favorito sotto: banca 2 solo a quota <= 2.10 (backtest: 1 o X 55,9%)
    }
  };
  var STRATEGIE = {
    over05ht: RULES.over05ht.label,
    over15ft: RULES.over15ft.label,
    layx: RULES.layx.label,
    backfav: RULES.backfav.label,
    favht: RULES.favht.label
  };

  function analyzeAll(metrics, context) {
    metrics = metrics || {};
    context = context || {};
    var odds = context.odds || {};
    var xg = sumPair(metrics.xg), sot = sumPair(metrics.sot), shots = sumPair(metrics.shots), big = sumPair(metrics.big), box = sumPair(metrics.boxshots), touches = sumPair(metrics.touches);
    var scoreText = String(context.score || '');
    var sm = scoreText.match(/(\d+)\s*[-:]\s*(\d+)/);
    var goals = sm ? Number(sm[1]) + Number(sm[2]) : 0;
    var minuteText = String(context.minute == null ? '' : context.minute).trim();
    var isHT = /^(ht|intervallo|half\s*time)$/i.test(minuteText);
    var minuteN = isHT ? 45 : numFromText(context.minute);
    function windowHint(from, to) {
      if (minuteN == null) return '';
      if (minuteN < from) return 'Finestra apre al ' + from + '’ (tra ' + Math.max(1, Math.round(from - minuteN)) + '’).';
      if (minuteN <= to) { var nx = Math.min(to, Math.floor(minuteN) + 5); return 'Finestra aperta fino al ' + to + '’' + (nx > minuteN ? ' · ricontrolla al ' + nx + '’' : '') + '.'; }
      return 'Finestra ' + from + '’–' + to + '’ chiusa.';
    }
    var htHint = isHT ? 'È intervallo: valuta ora.' : (minuteN == null ? '' : (minuteN < 45 ? 'Intervallo tra circa ' + Math.max(1, Math.round(45 - minuteN)) + '’.' : ''));
    var htOdds = oddNum(odds.ht), ftOdds = oddNum(odds.ft), layOdds = oddNum(odds.lay), favOdds = oddNum(odds.fav), awayLayOdds = oddNum(odds.away);

    var h = RULES.over05ht, f = RULES.over15ft, l = RULES.layx, bf = RULES.backfav, fh = RULES.favht;
    var q = weighted([
      line('xG', xg, xg != null && xg >= h.base.xg, h.weights.xg, '≥ ' + h.base.xg.toFixed(2)),
      line('Tiri in porta', sot, sot != null && sot >= h.base.sot, h.weights.sot, '≥ ' + h.base.sot),
      line('Big chances', big, big != null && big >= h.base.big, h.weights.big, '≥ ' + h.base.big),
      line('Tiri in area', box, box != null && box >= h.base.box, h.weights.box, '≥ ' + h.base.box),
      line('Tocchi area', touches, touches != null && touches >= h.base.touches, h.weights.touches, '≥ ' + h.base.touches),
      line('Tiri', shots, shots != null && shots >= h.base.shots, h.weights.shots, '≥ ' + h.base.shots),
      line('Quota', htOdds, htOdds != null && htOdds >= h.base.quotaMin && htOdds <= h.base.quotaMax, h.weights.quota, h.base.quotaMin.toFixed(2) + '–' + h.base.quotaMax.toFixed(2))
    ]);
    var s = weighted([
      line('xG', xg, xg != null && xg >= f.base.xg, f.weights.xg, '≥ ' + f.base.xg.toFixed(2)),
      line('Tiri in porta', sot, sot != null && sot >= f.base.sot, f.weights.sot, '≥ ' + f.base.sot),
      line('Big chances', big, big != null && big >= f.base.big, f.weights.big, '≥ ' + f.base.big),
      line('Tiri in area', box, box != null && box >= f.base.box, f.weights.box, '≥ ' + f.base.box),
      line('Tocchi area', touches, touches != null && touches >= f.base.touches, f.weights.touches, '≥ ' + f.base.touches),
      line('Tiri', shots, shots != null && shots >= f.base.shots, f.weights.shots, '≥ ' + f.base.shots),
      line('Quota', ftOdds, ftOdds != null && ftOdds >= f.base.quotaMin, f.weights.quota, '≥ ' + f.base.quotaMin.toFixed(2))
    ]);
    var coreHT = (sot != null && sot >= h.core.sot) || (shots != null && shots >= h.core.shots) || (xg != null && xg >= h.core.xg);
    var coreFT = (sot != null && sot >= f.core.sot) || (shots != null && shots >= f.core.shots) || (xg != null && xg >= f.core.xg);

    var ht;
    if (minuteN == null) ht = sig(h.label, 'DATI', 'Inserisci il minuto della partita.', 'Finestra principale 15’–30’.');
    else if (minuteN < h.window.from && goals > 0) ht = sig(
      h.label,
      'INGIOCABILE',
      'Gol già segnato prima della finestra EasyBet.',
      'L’Over 0.5 HT si è verificato prima dell’inizio della zona operativa: non è un ingresso EasyBet e non va contato come segnale.'
    );
    else if (minuteN < h.window.from) ht = sig(h.label, 'ATTENDI', 'Non ancora in zona operativa.', 'La finestra EasyBet parte indicativamente dal 15°.');
    else if (goals > 0) ht = sig(
      h.label,
      'CHIUSA',
      'Il gol è già stato segnato.',
      'La condizione Over 0.5 HT è già raggiunta: il mercato non viene più aperto come nuovo ingresso EasyBet.'
    );
    else if (minuteN > h.window.to) ht = sig(h.label, 'NO BET', 'Finestra operativa superata.', 'Non inseguire il mercato troppo tardi.');
    else ht = softState(h.label, q.score, q, h.state.green, h.state.strong, h.state.wait, 'Pressione live compatibile con l’ingresso.', 'SOT ' + (sot == null ? 'N/D' : sot) + ' • Tiri ' + (shots == null ? 'N/D' : shots) + ' • xG ' + (round2(xg) == null ? 'N/D' : round2(xg)) + oddText(htOdds), coreHT);

    ht.timing = windowHint(h.window.from, h.window.to);
    var earlyGoalBefore25 = !!context.earlyGoalBefore25;
    var firstGoalKnown = !!context.firstGoalKnown;
    var pressureReal = (big != null && big >= 1) || (box != null && box >= 6) || (touches != null && touches >= 12) || (shots != null && shots >= 8);
    var pressureStrong = ((big != null && big >= 1) ? 1 : 0) + ((box != null && box >= 8) ? 1 : 0) + ((touches != null && touches >= 15) ? 1 : 0) + ((shots != null && shots >= 10) ? 1 : 0) >= 2;
    var midChecks = weighted([
      line('xG ≥ ' + f.mid.xg.toFixed(2), xg, xg != null && xg >= f.mid.xg, 1.5),
      line('SOT ≥ ' + f.mid.sot, sot, sot != null && sot >= f.mid.sot, 1.6),
      line('Pressione reale', pressureReal, pressureReal, 1.3),
      line('Big chances', big, big != null && big >= 1, 1.0),
      line('Tiri ≥ ' + f.mid.shots, shots, shots != null && shots >= f.mid.shots, 1.0),
      line('Quota', ftOdds, ftOdds != null && ftOdds >= f.base.quotaMin, 0.7)
    ]);
    var lateChecks = weighted([
      line('xG ≥ ' + f.late.xg.toFixed(2), xg, xg != null && xg >= f.late.xg, 1.5),
      line('SOT ≥ ' + f.late.sot, sot, sot != null && sot >= f.late.sot, 1.6),
      line('Big chance', big, big != null && big >= 1, 1.1),
      line('Produzione forte', pressureStrong, pressureStrong, 1.3),
      line('Tiri ≥ ' + f.late.shots, shots, shots != null && shots >= f.late.shots, 1.0),
      line('Quota', ftOdds, ftOdds != null && ftOdds >= 1.60, 0.7)
    ]);
    var ft;
    var ftExit = ' Uscita: al primo gol in verde, oppure al ' + f.exitMinute + '° in perdita.';
    if (goals > 0 && minuteN != null && minuteN < f.window.from) ft = sig(f.label, 'INGIOCABILE', 'Gol segnato prima del 20°.', f.system + ' entra solo sullo 0-0 tra il 20° e il 30°: partita esclusa.');
    else if (goals > 0) ft = sig(f.label, 'CHIUSA', 'Gol segnato: nessun nuovo ingresso.', f.system + ' entra solo sullo 0-0. Se eri dentro, chiudi ora in verde.');
    else if (minuteN == null) ft = sig(f.label, 'DATI', 'Inserisci il minuto della partita.', 'Finestra di ingresso 20’–30’ sullo 0-0.');
    else if (minuteN < f.window.from) ft = sig(f.label, 'ATTENDI', 'Non ancora in zona operativa.', 'Ingresso sullo 0-0 tra il 20° e il 30° con quota Over 1.5 ≥ ' + f.base.quotaMin.toFixed(2) + '.');
    else if (minuteN > f.window.to) ft = sig(f.label, 'NO BET', 'Finestra operativa 20’–30’ superata.', 'Dopo il 30° ' + f.system + ' non apre nuovi ingressi.' + ftExit);
    else {
      ft = softState(f.label, s.score, s, f.state.green, f.state.strong, f.state.wait, '0-0 in finestra 20’–30’.', 'Criteri pesati' + oddText(ftOdds) + '.' + ftExit, coreFT);
      if (ft.state === 'VERDE' && ftOdds != null && ftOdds + 0.0001 < f.base.quotaMin) {
        ft.state = 'ATTESA QUOTA';
        ft.reason = 'Condizioni ok, quota Over 1.5 troppo bassa.';
        ft.why = 'Quota live ' + ftOdds.toFixed(2) + ' • serve ≥ ' + f.base.quotaMin.toFixed(2) + '.' + ftExit;
      }
    }

    ft.timing = goals > 0 ? '' : windowHint(f.window.from, f.window.to);
    var dxg = diffPair(metrics.xg), dsot = diffPair(metrics.sot), dshots = diffPair(metrics.shots), dtouch = diffPair(metrics.touches), dbig = diffPair(metrics.big);
    var layDyn = weighted([
      line('ΔxG', dxg, dxg != null && Math.abs(dxg) >= l.dyn.dxg, l.weights.dxg),
      line('ΔSOT', dsot, dsot != null && Math.abs(dsot) >= l.dyn.dsot, l.weights.dsot),
      line('ΔTiri', dshots, dshots != null && Math.abs(dshots) >= l.dyn.dshots, l.weights.dshots),
      line('ΔTocchi area', dtouch, dtouch != null && Math.abs(dtouch) >= l.dyn.dtouches, l.weights.dtouches),
      line('ΔBig chances', dbig, dbig != null && Math.abs(dbig) >= l.dyn.dbig, l.weights.dbig),
      line('Quota Lay X', layOdds, layOdds != null && layOdds >= l.dyn.quotaMin && layOdds <= l.dyn.quotaMaxEval, l.weights.quota)
    ]);
    var lay;
    var drawTarget = sm && Number(sm[1]) === Number(sm[2]) && (Number(sm[1]) === 0 || Number(sm[1]) === 1);
    var layRule = 'Regola ' + l.system + ': banca la X solo all’intervallo sullo 0-0 o 1-1 a quota ≤ ' + l.quotaMax.toFixed(2) + ' e tieni fino al 90’.';
    if (isHT) {
      if (!drawTarget) lay = sig(l.label, 'NON ATTIVA', 'Intervallo raggiunto, ma il risultato non è 0-0 o 1-1.', layRule, layDyn.checks, layDyn.score);
      else if (layOdds == null) lay = sig(l.label, 'ATTESA QUOTA', 'Pareggio all’intervallo: inserisci la quota Lay X.', layRule, layDyn.checks, layDyn.score);
      else if (layOdds > l.quotaMax + 0.0001) lay = sig(l.label, 'NO BET', 'Quota Lay X ' + layOdds.toFixed(2) + ' sopra ' + l.quotaMax.toFixed(2) + ': non entrare.', layRule, layDyn.checks, layDyn.score);
      else lay = sig(l.label, 'VERDE', 'Pareggio all’intervallo e quota Lay X ' + layOdds.toFixed(2) + ' ≤ ' + l.quotaMax.toFixed(2) + '.', layRule, layDyn.checks, layDyn.score);
    } else if (minuteN != null && minuteN < 45) lay = sig(l.label, 'VALUTA A HT', 'Strategia da valutare all’intervallo.', layRule);
    else if (minuteN === 45) lay = sig(l.label, 'ATTENDI HT', 'Attendo la fine effettiva del primo tempo.', 'Il 45° può includere recupero. Quando è davvero intervallo scrivi HT nel campo Minuto. ' + layRule);
    else if (minuteN != null && minuteN > 45) lay = sig(l.label, drawTarget ? 'NO BET' : 'NON ATTIVA', drawTarget ? 'Secondo tempo iniziato: nessun nuovo ingresso.' : 'Il risultato non è 0-0 o 1-1.', layRule);
    else lay = sig(l.label, 'DATI', 'Inserisci il minuto o HT.', layRule);

    var homeDyn = weighted([
      line('ΔxG', dxg, dxg != null && dxg >= bf.dyn.dxg, bf.weights.dxg),
      line('ΔSOT', dsot, dsot != null && dsot >= bf.dyn.dsot, bf.weights.dsot),
      line('ΔTiri', dshots, dshots != null && dshots >= bf.dyn.dshots, bf.weights.dshots),
      line('ΔTocchi area', dtouch, dtouch != null && dtouch >= bf.dyn.dtouches, bf.weights.dtouches),
      line('ΔBig chances', dbig, dbig != null && dbig >= bf.dyn.dbig, bf.weights.dbig),
      line('Quota favorita', favOdds, favOdds != null && favOdds >= bf.dyn.quotaMin && favOdds <= bf.dyn.quotaMax, bf.weights.quota)
    ]);
    var awayDyn = weighted([
      line('ΔxG', dxg, dxg != null && dxg <= -bf.dyn.dxg, bf.weights.dxg),
      line('ΔSOT', dsot, dsot != null && dsot <= -bf.dyn.dsot, bf.weights.dsot),
      line('ΔTiri', dshots, dshots != null && dshots <= -bf.dyn.dshots, bf.weights.dshots),
      line('ΔTocchi area', dtouch, dtouch != null && dtouch <= -bf.dyn.dtouches, bf.weights.dtouches),
      line('ΔBig chances', dbig, dbig != null && dbig <= -bf.dyn.dbig, bf.weights.dbig),
      line('Quota favorita', favOdds, favOdds != null && favOdds >= bf.dyn.quotaMin && favOdds <= bf.dyn.quotaMax, bf.weights.quota)
    ]);
    var favSel = context.favorite || 'none';
    var fav;
    if (favSel === 'none') {
      var side = homeDyn.passed > awayDyn.passed ? (context.homeName || 'Casa') : awayDyn.passed > homeDyn.passed ? (context.awayName || 'Ospite') : 'Nessuna';
      fav = sig(bf.label, 'DATI', 'Favorita pre-match non indicata. Dominante: ' + side + '.', 'Seleziona Casa o Ospite per valutare la strategia.', homeDyn.passed >= awayDyn.passed ? homeDyn.checks : awayDyn.checks, Math.max(homeDyn.score, awayDyn.score));
    } else {
      var ih = favSel === 'home', name = ih ? (context.homeName || 'Casa') : (context.awayName || 'Ospite'), fd = ih ? homeDyn : awayDyn;
      if (fd.available < 2) fav = sig(bf.label, 'DATI', 'Dati insufficienti per valutare ' + name + '.', 'Servono almeno 2 indicatori comparativi disponibili.', fd.checks, fd.score);
      else if (fd.score >= bf.state.green) fav = sig(bf.label, 'VERDE', name + ' sta confermando superiorità offensiva.', 'Punteggio adattivo ' + Math.round(fd.score * 100) + '%' + oddText(favOdds) + '. Non servono tutti i criteri insieme.', fd.checks, fd.score);
      else if (fd.score >= bf.state.strong) fav = sig(bf.label, 'ATTENDI FORTE', name + ' è vicina alla conferma del segnale.', 'Punteggio adattivo ' + Math.round(fd.score * 100) + '%' + oddText(favOdds) + '.', fd.checks, fd.score);
      else if (fd.score >= bf.state.wait) fav = sig(bf.label, 'ATTENDI', name + ' mostra qualche segnale di superiorità.', 'Punteggio adattivo ' + Math.round(fd.score * 100) + '%.', fd.checks, fd.score);
      else fav = sig(bf.label, 'NO BET', name + ' non sta mostrando sufficiente superiorità.', 'Punteggio adattivo ' + Math.round(fd.score * 100) + '%.', fd.checks, fd.score);
    }
    var fht;
    var fhRule = 'Regola ' + fh.system + ' (favorito in casa, quota 1 pre-match ≤ ' + fh.preMatchMax.toFixed(2) + '): all’intervallo, se il favorito è in parità PUNTA 1 a quota ≥ ' + fh.drawBackMin.toFixed(2) + '; se il favorito è sotto BANCA 2 a quota ≤ ' + fh.trailLayMax.toFixed(2) + '. Una sola giocata, tenere fino al 90’.';
    var fhHome = sm ? Number(sm[1]) : null, fhAway = sm ? Number(sm[2]) : null;
    // STEP54: GoalDir può saltare direttamente dall'ultimo minuto del 1° tempo al 46'-48' senza esporre uno stato HT.
    // Solo per Favorito HT usiamo una breve finestra di tolleranza come valutazione dell'intervallo, evitando l'esclusione prematura.
    var fhEvalHT = isHT || (minuteN != null && minuteN > 45 && minuteN <= 48);
    if (favSel === 'away') fht = sig(fh.label, 'NON ATTIVA', 'Sistema testato solo con il favorito in casa.', fhRule);
    else if (favSel !== 'home') fht = sig(fh.label, 'DATI', 'Indica la favorita: Casa.', fhRule);
    else if (!fhEvalHT && minuteN != null && minuteN < 45) fht = sig(fh.label, 'VALUTA A HT', 'Strategia da valutare all’intervallo.', fhRule);
    else if (!fhEvalHT && minuteN === 45) fht = sig(fh.label, 'ATTENDI HT', 'Attendo la fine effettiva del primo tempo.', 'Quando è davvero intervallo scrivi HT nel campo Minuto. ' + fhRule);
    else if (!fhEvalHT && minuteN != null && minuteN > 48) fht = sig(fh.label, 'NO BET', 'Secondo tempo iniziato: nessun nuovo ingresso.', fhRule);
    else if (!fhEvalHT) fht = sig(fh.label, 'DATI', 'Inserisci il minuto o HT.', fhRule);
    else if (fhHome == null) fht = sig(fh.label, 'DATI', 'Inserisci il risultato all’intervallo.', fhRule);
    else if (fhHome > fhAway) fht = sig(fh.label, 'NON ATTIVA', 'Il favorito è già in vantaggio.', fhRule);
    else if (fhHome === fhAway) {
      if (favOdds == null) fht = sig(fh.label, 'ATTESA QUOTA', 'Favorito in parità: inserisci la quota live dell’1.', fhRule);
      else if (favOdds + 0.0001 >= fh.drawBackMin) fht = sig(fh.label, 'VERDE', 'PUNTA 1 • favorito in parità, quota ' + favOdds.toFixed(2) + ' ≥ ' + fh.drawBackMin.toFixed(2) + '.', fhRule);
      else fht = sig(fh.label, 'NO BET', 'Quota 1 ' + favOdds.toFixed(2) + ' sotto ' + fh.drawBackMin.toFixed(2) + ': non entrare.', fhRule);
    } else {
      if (awayLayOdds != null && awayLayOdds <= fh.trailLayMax + 0.0001) fht = sig(fh.label, 'VERDE', 'BANCA 2 • favorito sotto, quota ospite ' + awayLayOdds.toFixed(2) + ' ≤ ' + fh.trailLayMax.toFixed(2) + '.', fhRule);
      else if (awayLayOdds == null) fht = sig(fh.label, 'ATTESA QUOTA', 'Favorito sotto: inserisci la quota BANCA 2.', fhRule);
      else fht = sig(fh.label, 'NO BET', 'Quota BANCA 2 ' + awayLayOdds.toFixed(2) + ' sopra ' + fh.trailLayMax.toFixed(2) + ': non entrare.', fhRule);
    }
    var u = RULES.under05ht, und;
    var uRule = 'Regola ' + u.system + ': ingresso pre-match a quota ≥ ' + u.quotaMin.toFixed(2) + ', si tiene fino all’intervallo.';
    var uWarn = (xg != null && xg >= u.warn.xg) || (sot != null && sot >= u.warn.sot) || (big != null && big >= u.warn.big);
    if (goals > 0) und = sig(u.label, 'CHIUSA', 'Gol nel primo tempo: Under 0.5 HT perso.', uRule);
    else if (isHT) und = sig(u.label, 'VERDE', '0-0 all’intervallo: Under 0.5 HT vinto.', uRule);
    else if (minuteN == null) und = sig(u.label, 'DATI', 'Inserisci il minuto della partita.', uRule);
    else if (minuteN > 45) und = sig(u.label, 'VERDE', 'Primo tempo chiuso sullo 0-0: Under 0.5 HT vinto.', uRule);
    else und = sig(u.label, uWarn ? 'ATTENDI' : 'IN CORSO', uWarn ? ('0-0 ma pressione alta (xG ' + fmtVal(xg) + ', tiri in porta ' + fmtVal(sot == null ? 0 : sot) + '): valuta l’uscita.') : '0-0 e pressione sotto controllo: tieni.', uRule, [], null, { timing: htHint });
    lay.timing = htHint; fht.timing = htHint;
    return [ht, ft, lay, fav, und, fht];
  }

  function keyToSignal(strategyKey) {
    if (strategyKey === 'over05ht') return RULES.over05ht.label;
    if (strategyKey === 'over15ft') return RULES.over15ft.label;
    if (strategyKey === 'layx') return RULES.layx.label;
    if (strategyKey === 'backfav') return RULES.backfav.label;
    if (strategyKey === 'favht') return RULES.favht.label;
    return null;
  }

  // Compatibilità col bookmarklet/backend: usa gli stessi paletti base del motore unico.
  function classify(strategyKey, payload, match) {
    payload = payload || {}; match = match || {};
    var wanted = keyToSignal(strategyKey);
    if (!wanted) return { error: 'strategia-sconosciuta' };
    var favorite = 'none';
    if (match.live_favorita === 'casa') favorite = 'home';
    if (match.live_favorita === 'trasferta') favorite = 'away';
    if (strategyKey === 'backfav' && favorite === 'none') return { error: 'favorita-non-impostata' };

    // Il bookmarklet storico non invia il minuto. Per non rompere le notifiche esistenti,
    // si applica la valutazione base con gli stessi RULES, senza i gate temporali del pannello.
    var metrics = {
      xg: [n(payload.xgHome), n(payload.xgAway)], sot: [n(payload.sotHome), n(payload.sotAway)],
      big: [n(payload.chancesHome), n(payload.chancesAway)], shots: [n(payload.shotsHome), n(payload.shotsAway)],
      boxshots: [n(payload.boxshotsHome), n(payload.boxshotsAway)], touches: [n(payload.touchesHome), n(payload.touchesAway)]
    };
    var totalXg = sumPair(metrics.xg), totalSot = sumPair(metrics.sot), totalBig = sumPair(metrics.big), totalShots = sumPair(metrics.shots), totalBox = sumPair(metrics.boxshots), totalTouches = sumPair(metrics.touches);
    var rule, checks, core, gateOk = true;
    if (strategyKey === 'over05ht' || strategyKey === 'over15ft') {
      rule = RULES[strategyKey];
      checks = weighted([
        line('xG', totalXg, totalXg != null && totalXg >= rule.base.xg, rule.weights.xg),
        line('SOT', totalSot, totalSot != null && totalSot >= rule.base.sot, rule.weights.sot),
        line('Big chances', totalBig, totalBig != null && totalBig >= rule.base.big, rule.weights.big),
        line('Tiri', totalShots, totalShots != null && totalShots >= rule.base.shots, rule.weights.shots),
        line('Tiri area', totalBox, totalBox != null && totalBox >= rule.base.box, rule.weights.box),
        line('Tocchi area', totalTouches, totalTouches != null && totalTouches >= rule.base.touches, rule.weights.touches)
      ]);
      core = (totalSot != null && totalSot >= rule.core.sot) || (totalShots != null && totalShots >= rule.core.shots) || (totalXg != null && totalXg >= rule.core.xg);
    } else if (strategyKey === 'layx') {
      rule = RULES.layx;
      var sh = n(payload.scoreHome), sa = n(payload.scoreAway), lm = n(payload.minute);
      // EXCH LAY X HT: ingresso solo all'intervallo (collector: minuto 45-47 o assente) sullo 0-0 / 1-1.
      gateOk = sh !== null && sa !== null && sh === sa && (sh === 0 || sh === 1) && (lm === null || (lm >= 45 && lm <= 47));
      var dx = diffPair(metrics.xg), ds = diffPair(metrics.sot), dsh = diffPair(metrics.shots), dt = diffPair(metrics.touches), db = diffPair(metrics.big);
      checks = weighted([
        line('ΔxG', dx, dx != null && Math.abs(dx) >= rule.dyn.dxg, rule.weights.dxg),
        line('ΔSOT', ds, ds != null && Math.abs(ds) >= rule.dyn.dsot, rule.weights.dsot),
        line('ΔTiri', dsh, dsh != null && Math.abs(dsh) >= rule.dyn.dshots, rule.weights.dshots),
        line('ΔTocchi area', dt, dt != null && Math.abs(dt) >= rule.dyn.dtouches, rule.weights.dtouches),
        line('ΔBig chances', db, db != null && Math.abs(db) >= rule.dyn.dbig, rule.weights.dbig)
      ]);
      core = checks.available >= 2;
    } else if (strategyKey === 'favht') {
      var fhh = n(payload.scoreHome), fha = n(payload.scoreAway), fhm = n(payload.minute), fhr = RULES.favht;
      var fhAtHt = fhm === null || (fhm >= 45 && fhm <= 47);
      var fhOk = favorite === 'home' && fhh !== null && fha !== null && fhAtHt && fhh <= fha;
      var fhSummary = !fhOk ? 'Favorito HT: condizioni non attive (serve favorito in casa, intervallo, favorito non in vantaggio)'
        : (fhh === fha ? 'Intervallo in parità • PUNTA 1 solo se quota ≥ ' + fhr.drawBackMin.toFixed(2)
          : 'Favorito sotto all’intervallo • BANCA 2 solo se quota ≤ ' + fhr.trailLayMax.toFixed(2));
      return { level: fhOk ? 'verde' : 'rosso', summary: fhSummary + ' • controlla la quota live', gateOk: fhOk, score: null, score100: null, passed: 0, available: 0, core: fhOk, label: wanted };
    } else {
      rule = RULES.backfav;
      var sign = favorite === 'home' ? 1 : -1;
      var fx = diffPair(metrics.xg), fs = diffPair(metrics.sot), fsh = diffPair(metrics.shots), ft = diffPair(metrics.touches), fb = diffPair(metrics.big);
      checks = weighted([
        line('ΔxG', fx, fx != null && sign * fx >= rule.dyn.dxg, rule.weights.dxg),
        line('ΔSOT', fs, fs != null && sign * fs >= rule.dyn.dsot, rule.weights.dsot),
        line('ΔTiri', fsh, fsh != null && sign * fsh >= rule.dyn.dshots, rule.weights.dshots),
        line('ΔTocchi area', ft, ft != null && sign * ft >= rule.dyn.dtouches, rule.weights.dtouches),
        line('ΔBig chances', fb, fb != null && sign * fb >= rule.dyn.dbig, rule.weights.dbig)
      ]);
      core = checks.available >= 2;
      var hsc = n(payload.scoreHome), asc = n(payload.scoreAway);
      gateOk = hsc !== null && asc !== null && hsc === 0 && asc === 0;
    }

    // Gate evento/tempo per Over 0.5 HT quando il collector fornisce minuto e risultato.
    // Se il gol è già arrivato prima del 15°, il mercato è ESCLUSO: non può generare un VERDE ufficiale.
    if (strategyKey === 'over05ht') {
      var pMinute = n(payload.minute);
      var pHome = n(payload.scoreHome), pAway = n(payload.scoreAway);
      var pGoals = (pHome == null || pAway == null) ? null : pHome + pAway;
      if (pMinute != null && pGoals != null) {
        if (pMinute < RULES.over05ht.window.from && pGoals > 0) {
          return {
            level: 'ingiocabile',
            summary: 'Gol segnato prima della finestra EasyBet • mercato escluso',
            gateOk: false,
            score: checks.score,
            score100: score100(checks.score),
            passed: checks.passed,
            available: checks.available,
            core: core,
            label: wanted
          };
        }
        if (pMinute < RULES.over05ht.window.from && pGoals === 0) {
          return {
            level: 'attendi',
            summary: 'Prima della finestra operativa 15’–30’',
            gateOk: false,
            score: checks.score,
            score100: score100(checks.score),
            passed: checks.passed,
            available: checks.available,
            core: core,
            label: wanted
          };
        }
        if (pGoals > 0) {
          return {
            level: 'chiusa',
            summary: 'Gol già segnato • condizione Over 0.5 HT già raggiunta',
            gateOk: false,
            score: checks.score,
            score100: score100(checks.score),
            passed: checks.passed,
            available: checks.available,
            core: core,
            label: wanted
          };
        }
        if (pMinute > RULES.over05ht.window.to) {
          return {
            level: 'rosso',
            summary: 'Finestra Over 0.5 HT superata senza ingresso',
            gateOk: false,
            score: checks.score,
            score100: score100(checks.score),
            passed: checks.passed,
            available: checks.available,
            core: core,
            label: wanted
          };
        }
      }
    }

    if (strategyKey === 'layx') {
      var s100x = score100(checks.score);
      return { level: gateOk ? 'verde' : 'rosso', summary: gateOk ? ('Pareggio all’intervallo • BANCA X solo se quota ≤ ' + RULES.layx.quotaMax.toFixed(2) + ', tieni fino al 90’') : 'Banca X non attiva: serve 0-0 o 1-1 all’intervallo', gateOk: gateOk, score: checks.score, score100: s100x, passed: checks.passed, available: checks.available, core: core, label: wanted };
    }
    // Over 1.5 FT (EXCH O1.5 GOL 25-70): solo sullo 0-0 tra 20' e 30' quando il collector invia minuto e risultato.
    if (strategyKey === 'over15ft') {
      var oMin = n(payload.minute), oH = n(payload.scoreHome), oA = n(payload.scoreAway);
      var oGoals = (oH == null || oA == null) ? null : oH + oA;
      if (oGoals != null && oGoals > 0) return { level: 'chiusa', summary: 'Gol segnato • EXCH O1.5 25-70 entra solo sullo 0-0', gateOk: false, score: checks.score, score100: score100(checks.score), passed: checks.passed, available: checks.available, core: core, label: wanted };
      if (oMin != null && oMin < RULES.over15ft.window.from) return { level: 'attendi', summary: 'Prima della finestra 20’–30’', gateOk: false, score: checks.score, score100: score100(checks.score), passed: checks.passed, available: checks.available, core: core, label: wanted };
      if (oMin != null && oMin > RULES.over15ft.window.to) return { level: 'rosso', summary: 'Finestra 20’–30’ superata senza ingresso', gateOk: false, score: checks.score, score100: score100(checks.score), passed: checks.passed, available: checks.available, core: core, label: wanted };
    }
    var greenAt = strategyKey === 'layx' ? RULES.layx.state.green : strategyKey === 'backfav' ? RULES.backfav.state.green : rule.state.green;
    var yellowAt = strategyKey === 'layx' ? RULES.layx.state.weak : strategyKey === 'backfav' ? RULES.backfav.state.wait : rule.state.wait;
    var level = (gateOk && core && checks.available >= 2 && checks.score >= greenAt) ? 'verde' : (checks.available >= 2 && checks.score >= yellowAt ? 'giallo' : 'rosso');
    var s100 = score100(checks.score);
    var summary = 'score ' + (s100 == null ? 'N/D' : s100 + '/100') + ' • ' + checks.passed + '/' + checks.available + ' criteri';
    return { level: level, summary: summary, gateOk: gateOk, score: checks.score, score100: s100, passed: checks.passed, available: checks.available, core: core, label: wanted };
  }

  // Partita "andata": la strategia non può più dare un ingresso (gol prima/dentro la finestra, finestra superata, condizione HT non valida).
  function exclusionOf(s) {
    if (!s) return null;
    if (s.state === 'INGIOCABILE' || s.state === 'CHIUSA' || s.state === 'NON ATTIVA') return s.reason || s.state;
    if (s.state === 'NO BET' && /superata|secondo tempo iniziato/i.test(String(s.reason || ''))) return s.reason;
    return null;
  }
  return { RULES: RULES, STRATEGIE: STRATEGIE, analyzeAll: analyzeAll, classify: classify, score100: score100, exclusionOf: exclusionOf };
});
