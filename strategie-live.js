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
  function line(label, value, pass, weight) {
    return [label, !!pass, value !== null && value !== undefined, weight || 1];
  }
  function weighted(list) {
    var available = list.filter(function (x) { return x[2]; });
    var totalW = available.reduce(function (a, x) { return a + (x[3] || 1); }, 0);
    var passW = available.filter(function (x) { return x[1]; }).reduce(function (a, x) { return a + (x[3] || 1); }, 0);
    var passed = available.filter(function (x) { return x[1]; }).length;
    return {
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
  function sig(name, state, reason, why, criteria, score) {
    return { name: name, state: state, reason: reason, why: why, criteria: criteria || [], score: score == null ? null : score, score100: score100(score) };
  }
  function oddText(v) {
    var x = oddNum(v);
    return x == null ? '' : (' • quota ' + x.toFixed(2));
  }
  function softState(name, score, checks, greenAt, strongAt, waitAt, reasonBase, whyBase, core) {
    if (checks.available < 2) return sig(name, 'DATI', 'Dati live insufficienti per una lettura affidabile.', 'Servono almeno 2 indicatori disponibili; le metriche mancanti vengono ignorate.', checks.checks, score);
    if (score >= greenAt && core !== false) return sig(name, 'VERDE', reasonBase + ' ' + checks.passed + '/' + checks.available + ' criteri disponibili.', 'Punteggio adattivo: ' + Math.round(score * 100) + '%. ' + whyBase, checks.checks, score);
    if (score >= strongAt) return sig(name, 'ATTENDI FORTE', 'Segnale vicino all’ingresso: ' + checks.passed + '/' + checks.available + ' criteri disponibili.', 'Punteggio adattivo: ' + Math.round(score * 100) + '%. Manca una conferma forte.', checks.checks, score);
    if (score >= waitAt) return sig(name, 'ATTENDI', 'Segnali presenti ma ancora incompleti: ' + checks.passed + '/' + checks.available + '.', 'Punteggio adattivo: ' + Math.round(score * 100) + '%. ' + whyBase, checks.checks, score);
    return sig(name, 'NO BET', 'Indicatori disponibili ancora troppo deboli.', 'Punteggio adattivo: ' + Math.round(score * 100) + '%. Le metriche assenti non penalizzano.', checks.checks, score);
  }

  // UNICA configurazione dei paletti. Frontend e backend leggono questi stessi valori.
  var RULES = {
    over05ht: {
      label: 'Over 0.5 HT',
      window: { from: 15, to: 32 },
      base: { xg: 0.55, sot: 2, big: 1, box: 5, touches: 10, shots: 6, quotaMin: 1.55, quotaMax: 2.10 },
      weights: { xg: 1.4, sot: 1.5, big: 1.1, box: 1.0, touches: 0.7, shots: 1.0, quota: 0.6 },
      state: { green: 0.60, strong: 0.46, wait: 0.30 },
      core: { sot: 2, shots: 7, xg: 0.60 }
    },
    over15ft: {
      label: 'Over 1.5 FT',
      window: { from: 20, to: 60 },
      base: { xg: 0.85, sot: 3, big: 1, box: 6, touches: 12, shots: 7, quotaMin: 1.55 },
      weights: { xg: 1.4, sot: 1.5, big: 1.0, box: 1.0, touches: 0.7, shots: 1.0, quota: 0.7 },
      state: { green: 0.60, strong: 0.47, wait: 0.30 },
      core: { sot: 3, shots: 8, xg: 0.90 },
      mid: { xg: 1.20, sot: 4, shots: 9, green: 0.64, strong: 0.50, wait: 0.34 },
      late: { xg: 1.55, sot: 5, shots: 11, green: 0.72, strong: 0.58, wait: 0.42 }
    },
    layx: {
      label: 'Banca X',
      quotaMax: 2.00,
      dyn: { dxg: 0.30, dsot: 1, dshots: 3, dtouches: 6, dbig: 1, quotaMin: 1.70, quotaMaxEval: 2.50 },
      weights: { dxg: 1.5, dsot: 1.5, dshots: 1.0, dtouches: 0.8, dbig: 1.1, quota: 0.7 },
      state: { green: 0.55, wait: 0.40, weak: 0.25 }
    },
    backfav: {
      label: 'Segna favorita',
      dyn: { dxg: 0.25, dsot: 1, dshots: 3, dtouches: 6, dbig: 1, quotaMin: 1.55, quotaMax: 2.50 },
      weights: { dxg: 1.5, dsot: 1.5, dshots: 1.0, dtouches: 0.8, dbig: 1.1, quota: 0.7 },
      state: { green: 0.58, strong: 0.42, wait: 0.28 }
    }
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
    var htOdds = oddNum(odds.ht), ftOdds = oddNum(odds.ft), layOdds = oddNum(odds.lay), favOdds = oddNum(odds.fav);

    var h = RULES.over05ht, f = RULES.over15ft, l = RULES.layx, bf = RULES.backfav;
    var q = weighted([
      line('xG', xg, xg != null && xg >= h.base.xg, h.weights.xg),
      line('SOT', sot, sot != null && sot >= h.base.sot, h.weights.sot),
      line('Big chances', big, big != null && big >= h.base.big, h.weights.big),
      line('Tiri area', box, box != null && box >= h.base.box, h.weights.box),
      line('Tocchi area', touches, touches != null && touches >= h.base.touches, h.weights.touches),
      line('Tiri', shots, shots != null && shots >= h.base.shots, h.weights.shots),
      line('Quota', htOdds, htOdds != null && htOdds >= h.base.quotaMin && htOdds <= h.base.quotaMax, h.weights.quota)
    ]);
    var s = weighted([
      line('xG', xg, xg != null && xg >= f.base.xg, f.weights.xg),
      line('SOT', sot, sot != null && sot >= f.base.sot, f.weights.sot),
      line('Big chances', big, big != null && big >= f.base.big, f.weights.big),
      line('Tiri area', box, box != null && box >= f.base.box, f.weights.box),
      line('Tocchi area', touches, touches != null && touches >= f.base.touches, f.weights.touches),
      line('Tiri', shots, shots != null && shots >= f.base.shots, f.weights.shots),
      line('Quota', ftOdds, ftOdds != null && ftOdds >= f.base.quotaMin, f.weights.quota)
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
    if (goals >= 2) ft = sig(f.label, 'CHIUSA', 'Sono già stati segnati almeno 2 gol.', 'La condizione Over 1.5 è raggiunta.');
    else if (goals > 0 && !firstGoalKnown) ft = sig(f.label, 'DATI GOL', 'Inserisci il minuto del primo gol.', 'Con inserimento manuale EasyBet deve sapere quando è arrivato il primo gol: se è prima del 25° l’Over 1.5 FT diventa INGIOCABILE.');
    else if (earlyGoalBefore25 && goals > 0) ft = sig(f.label, 'INGIOCABILE', 'Gol arrivato prima del 25° minuto.', 'Regola EasyBet: il primo gol è arrivato troppo presto; il mercato resta escluso perché la quota è già stata compressa.');
    else if (minuteN != null && minuteN < f.window.from) ft = sig(f.label, 'ATTENDI', 'Match ancora presto per il filtro principale.', 'Finestra operativa principale 20’–45’.');
    else if (minuteN != null && minuteN <= 45) ft = softState(f.label, s.score, s, f.state.green, f.state.strong, f.state.wait, 'Volume offensivo sufficiente.', 'Finestra 20’–45’ con criteri pesati' + oddText(ftOdds) + '.', coreFT);
    else if (minuteN != null && minuteN <= 55) {
      var midCore = ((xg != null && xg >= f.mid.xg) ? 1 : 0) + ((sot != null && sot >= f.mid.sot) ? 1 : 0) + (pressureReal ? 1 : 0) >= 2;
      ft = softState(f.label, midChecks.score, midChecks, f.mid.green, f.mid.strong, f.mid.wait, 'Finestra estesa con pressione convincente.', '46’–55’: bastano 2 segnali forti su 3 principali; non serve che tutte le metriche siano presenti' + oddText(ftOdds) + '.', midCore);
    } else if (minuteN != null && minuteN <= f.window.to) {
      var lateCore = ((xg != null && xg >= f.late.xg) ? 1 : 0) + ((sot != null && sot >= f.late.sot) ? 1 : 0) + ((big != null && big >= 1) ? 1 : 0) + (pressureStrong ? 1 : 0) >= 3;
      ft = softState(f.label, lateChecks.score, lateChecks, f.late.green, f.late.strong, f.late.wait, 'Scenario molto forte nonostante il minuto avanzato.', '56’–60’: servono almeno 3 segnali forti tra xG, SOT, big chance e produzione offensiva' + oddText(ftOdds) + '.', lateCore);
    } else if (minuteN != null && minuteN > f.window.to) ft = sig(f.label, 'NO BET', 'Finestra operativa chiusa.', 'Dopo il 60° minuto non vengono aperti nuovi ingressi Over 1.5 FT.');
    else ft = sig(f.label, 'DATI', 'Inserisci il minuto della partita.', 'Finestra operativa 20’–60’.');

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
    if (isHT) {
      if (!drawTarget) lay = sig(l.label, 'NON ATTIVA', 'Intervallo raggiunto, ma il risultato non è 0-0 o 1-1.', 'La strategia Banca X viene preparata a HT solo se il pareggio è 0-0 o 1-1.');
      else if (layDyn.available < 2) lay = sig(l.label, 'DATI', 'Intervallo: dati insufficienti per misurare la fragilità del pareggio.', 'Servono almeno 2 indicatori comparativi disponibili prima di preparare l’ingresso nel secondo tempo.', layDyn.checks, layDyn.score);
      else if (layDyn.score >= l.state.green) lay = sig(l.label, 'ATTENDI FORTE', 'Pareggio fragile: strategia idonea per il secondo tempo.', 'Attendi la ripresa e la quota Lay X a 2.00 o inferiore. Punteggio adattivo ' + Math.round(layDyn.score * 100) + '%' + oddText(layOdds) + '.', layDyn.checks, layDyn.score);
      else if (layDyn.score >= l.state.wait) lay = sig(l.label, 'ATTENDI', 'Pareggio interessante ma ancora da confermare.', 'La strategia resta osservata nel secondo tempo; attendi maggiore squilibrio e quota Lay X ≤ 2.00.', layDyn.checks, layDyn.score);
      else lay = sig(l.label, 'NO BET', 'Pareggio ancora troppo stabile a HT.', 'Può essere rivalutato nei primi minuti del secondo tempo solo se la pressione aumenta sensibilmente.', layDyn.checks, layDyn.score);
    } else if (minuteN != null && minuteN < 45) lay = sig(l.label, 'VALUTA A HT', 'Strategia da valutare all’intervallo.', 'Prima dell’HT non viene emesso un NO BET: la lettura parte sullo 0-0 o 1-1 e l’ingresso avviene nel secondo tempo.');
    else if (minuteN === 45) lay = sig(l.label, 'ATTENDI HT', 'Attendo la fine effettiva del primo tempo.', 'Il 45° può includere recupero. In manuale, quando è davvero intervallo scrivi HT nel campo Minuto.');
    else if (minuteN != null && minuteN > 45) {
      if (!drawTarget) lay = sig(l.label, 'NON ATTIVA', 'Il risultato non è 0-0 o 1-1.', 'Il pareggio target della strategia non è più presente, quindi non si apre un nuovo Lay X.');
      else if (layDyn.available < 2) lay = sig(l.label, 'DATI', 'Secondo tempo: dati insufficienti per valutare il Lay X.', 'Servono almeno 2 indicatori comparativi disponibili.', layDyn.checks, layDyn.score);
      else if (layDyn.score >= l.state.green) {
        if (layOdds == null) lay = sig(l.label, 'ATTESA QUOTA', 'Pareggio fragile: condizioni live confermate.', 'Inserisci la quota Lay X corrente. Il segnale può diventare VERDE solo con quota 2.00 o inferiore.', layDyn.checks, layDyn.score);
        else if (layOdds > l.quotaMax + 0.0001) lay = sig(l.label, 'ATTESA QUOTA', 'Pareggio fragile, ma la quota Lay X è ancora troppo alta.', 'Quota live ' + layOdds.toFixed(2) + ' • attendi ' + l.quotaMax.toFixed(2) + ' o inferiore prima dell’ingresso.', layDyn.checks, layDyn.score);
        else lay = sig(l.label, 'VERDE', 'Pareggio fragile nel secondo tempo e quota idonea.', 'Condizioni live confermate • quota Lay X ' + layOdds.toFixed(2) + ' ≤ ' + l.quotaMax.toFixed(2) + '.', layDyn.checks, layDyn.score);
      } else if (layDyn.score >= l.state.wait) lay = sig(l.label, 'ATTENDI FORTE', 'Pareggio sotto pressione nel secondo tempo.', 'Vicino all’ingresso: serve ulteriore conferma; quando i dati saranno sufficienti servirà comunque quota Lay X ≤ 2.00.', layDyn.checks, layDyn.score);
      else if (layDyn.score >= l.state.weak) lay = sig(l.label, 'ATTENDI', 'C’è qualche squilibrio, ma non abbastanza netto.', 'Continua a monitorare il secondo tempo e la quota Lay X.', layDyn.checks, layDyn.score);
      else lay = sig(l.label, 'NO BET', 'Il pareggio appare ancora abbastanza stabile.', 'Nessun ingresso finché pressione e squilibrio non aumentano.', layDyn.checks, layDyn.score);
    } else lay = sig(l.label, 'DATI', 'Inserisci il minuto o HT.', 'La strategia viene preparata a HT e giocata nel secondo tempo con quota Lay X ≤ 2.00.');

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
    return [ht, ft, lay, fav];
  }

  function keyToSignal(strategyKey) {
    if (strategyKey === 'over05ht') return RULES.over05ht.label;
    if (strategyKey === 'over15ft') return RULES.over15ft.label;
    if (strategyKey === 'layx') return RULES.layx.label;
    if (strategyKey === 'backfav') return RULES.backfav.label;
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
      var sh = n(payload.scoreHome), sa = n(payload.scoreAway);
      gateOk = sh !== null && sa !== null && sh === sa && (sh === 0 || sh === 1);
      var dx = diffPair(metrics.xg), ds = diffPair(metrics.sot), dsh = diffPair(metrics.shots), dt = diffPair(metrics.touches), db = diffPair(metrics.big);
      checks = weighted([
        line('ΔxG', dx, dx != null && Math.abs(dx) >= rule.dyn.dxg, rule.weights.dxg),
        line('ΔSOT', ds, ds != null && Math.abs(ds) >= rule.dyn.dsot, rule.weights.dsot),
        line('ΔTiri', dsh, dsh != null && Math.abs(dsh) >= rule.dyn.dshots, rule.weights.dshots),
        line('ΔTocchi area', dt, dt != null && Math.abs(dt) >= rule.dyn.dtouches, rule.weights.dtouches),
        line('ΔBig chances', db, db != null && Math.abs(db) >= rule.dyn.dbig, rule.weights.dbig)
      ]);
      core = checks.available >= 2;
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

    var greenAt = strategyKey === 'layx' ? RULES.layx.state.green : strategyKey === 'backfav' ? RULES.backfav.state.green : rule.state.green;
    var yellowAt = strategyKey === 'layx' ? RULES.layx.state.weak : strategyKey === 'backfav' ? RULES.backfav.state.wait : rule.state.wait;
    var level = (gateOk && core && checks.available >= 2 && checks.score >= greenAt) ? 'verde' : (checks.available >= 2 && checks.score >= yellowAt ? 'giallo' : 'rosso');
    var s100 = score100(checks.score);
    var summary = 'score ' + (s100 == null ? 'N/D' : s100 + '/100') + ' • ' + checks.passed + '/' + checks.available + ' criteri';
    return { level: level, summary: summary, gateOk: gateOk, score: checks.score, score100: s100, passed: checks.passed, available: checks.available, core: core, label: wanted };
  }

  return { RULES: RULES, analyzeAll: analyzeAll, classify: classify, score100: score100 };
});
