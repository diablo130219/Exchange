(function () {
  'use strict';

  if (window.__easybetLiveMonitor) {
    window.__easybetLiveMonitor.toggle();
    return;
  }

  var API_BASE = (function () {
    try {
      var src = document.currentScript && document.currentScript.src;
      if (src) return new URL(src).origin;
    } catch (e) {}
    return '';
  })();

  var POLL_MS = 20000;
  var timer = null;
  var running = false;

  // ---------- estrazione dati dalla pagina FlashScore ----------
  function clickShowMore() {
    var els = Array.prototype.slice.call(document.querySelectorAll('div,button,span'))
      .filter(function (e) {
        var t = (e.textContent || '').trim();
        return (t === 'Mostra altri' || t === 'Show more') && e.children.length === 0;
      });
    els.forEach(function (e) { try { e.click(); } catch (err) {} });
    return els.length;
  }

  function getTeams() {
    var title = document.title || '';
    var m = title.match(/:\s*(.+?)\s+v\s+(.+?)\s+\d{1,2}\/\d{1,2}\/\d{2,4}/i);
    if (!m) return null;
    return { casa: m[1].trim(), trasferta: m[2].trim() };
  }

  function getScore() {
    var title = document.title || '';
    // Es: "RAT 0-3 SHA | Flashscore.it: ..." -> 0 e 3
    var m = title.match(/^\S+\s+(\d+)\s*-\s*(\d+)\s+\S+/);
    if (!m) return { home: null, away: null };
    return { home: parseInt(m[1], 10), away: parseInt(m[2], 10) };
  }

  function pairStat(text, labelPattern, decimal) {
    var numRe = decimal ? '([0-9]+(?:\\.[0-9]+)?)' : '([0-9]+)';
    var re = new RegExp(numRe + '\\s*\\n\\s*(?:' + labelPattern + ')\\s*\\n\\s*' + numRe, 'i');
    var m = text.match(re);
    if (!m) return null;
    return { home: parseFloat(m[1]), away: parseFloat(m[2]) };
  }

  function getStats() {
    clickShowMore();
    var text = document.body ? document.body.innerText : '';
    return {
      xg: pairStat(text, 'Goal previsti \\(xG\\)', true),
      sot: pairStat(text, 'Tiri in porta', false),
      chances: pairStat(text, 'Grandi occasioni', false)
    };
  }

  // ---------- overlay UI ----------
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:270px;' +
    'background:#141821;color:#e8ebf2;font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;' +
    'border:1px solid #2a3040;border-radius:10px;box-shadow:0 6px 24px rgba(0,0,0,.4);padding:12px;';
  box.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">' +
      '<b style="font-size:13px;">⚡ EasyBet Live</b>' +
      '<span id="ebLiveClose" style="cursor:pointer;opacity:.7;padding:0 4px;">✕</span>' +
    '</div>' +
    '<div id="ebLiveTeams" style="opacity:.8;margin-bottom:6px;">Rilevo la partita…</div>' +
    '<div id="ebLiveStats" style="margin-bottom:8px;"></div>' +
    '<button id="ebLiveToggle" style="width:100%;padding:7px;border:0;border-radius:6px;background:#3d7bff;color:#fff;font-weight:600;cursor:pointer;">Avvia monitoraggio</button>' +
    '<div id="ebLiveLevel" style="margin-top:8px;font-weight:700;"></div>' +
    '<div id="ebLiveStatus" style="margin-top:4px;opacity:.7;font-size:11px;"></div>';
  document.body.appendChild(box);

  var teamsEl = box.querySelector('#ebLiveTeams');
  var statsEl = box.querySelector('#ebLiveStats');
  var statusEl = box.querySelector('#ebLiveStatus');
  var levelEl = box.querySelector('#ebLiveLevel');
  var toggleBtn = box.querySelector('#ebLiveToggle');
  var closeBtn = box.querySelector('#ebLiveClose');

  var LEVEL_STYLE = {
    verde: { color: '#2ecc71', label: '🟢 VERDE — buon ingresso' },
    giallo: { color: '#f1c40f', label: '🟡 GIALLO — aspetta conferma' },
    rosso: { color: '#e74c3c', label: '🔴 ROSSO — niente ingresso' }
  };

  function fmtPair(p) {
    if (!p) return '-';
    return p.home + ' / ' + p.away;
  }

  function tick() {
    var teams = getTeams();
    var score = getScore();
    if (!teams) {
      teamsEl.textContent = 'Nessuna partita rilevata in questa pagina.';
      statusEl.textContent = '';
      return;
    }
    teamsEl.textContent = teams.casa + ' - ' + teams.trasferta +
      (score.home !== null ? ' (' + score.home + '-' + score.away + ')' : '');

    var st = getStats();
    statsEl.innerHTML = 'xG: ' + fmtPair(st.xg) + ' • SOT: ' + fmtPair(st.sot) + ' • Occ: ' + fmtPair(st.chances);

    if (!API_BASE) {
      statusEl.textContent = 'Errore: impossibile determinare il server.';
      return;
    }

    fetch(API_BASE + '/api/live-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        casa: teams.casa,
        trasferta: teams.trasferta,
        scoreHome: score.home,
        scoreAway: score.away,
        xgHome: st.xg ? st.xg.home : null,
        xgAway: st.xg ? st.xg.away : null,
        sotHome: st.sot ? st.sot.home : null,
        sotAway: st.sot ? st.sot.away : null,
        chancesHome: st.chances ? st.chances.home : null,
        chancesAway: st.chances ? st.chances.away : null
      })
    }).then(function (r) { return r.json(); }).then(function (data) {
      var now = new Date().toLocaleTimeString('it-IT');
      if (data.sent) {
        levelEl.innerHTML = '🎉 Avviso inviato!';
        levelEl.style.color = '#2ecc71';
        statusEl.textContent = 'alle ' + now;
        stop();
        return;
      }
      if (data.level && LEVEL_STYLE[data.level]) {
        levelEl.textContent = LEVEL_STYLE[data.level].label;
        levelEl.style.color = LEVEL_STYLE[data.level].color;
        statusEl.textContent = (data.summary || '') + ' • agg. ' + now;
      } else if (data.reason === 'no-match') {
        levelEl.textContent = '';
        statusEl.textContent = 'Nessuna partita con strategia live corrispondente in dashboard (' + now + ').';
      } else if (data.reason === 'favorita-non-impostata') {
        levelEl.textContent = '';
        statusEl.textContent = 'Imposta la squadra favorita per questa partita in dashboard.';
      } else {
        levelEl.textContent = '';
        statusEl.textContent = 'Controllato alle ' + now + '.';
      }
    }).catch(function () {
      statusEl.textContent = 'Errore di connessione al server.';
    });
  }

  function start() {
    running = true;
    toggleBtn.textContent = 'Ferma monitoraggio';
    toggleBtn.style.background = '#e5484d';
    tick();
    timer = setInterval(tick, POLL_MS);
  }
  function stop() {
    running = false;
    toggleBtn.textContent = 'Avvia monitoraggio';
    toggleBtn.style.background = '#3d7bff';
    if (timer) { clearInterval(timer); timer = null; }
  }

  toggleBtn.addEventListener('click', function () {
    if (running) stop(); else start();
  });
  closeBtn.addEventListener('click', function () {
    stop();
    box.remove();
    window.__easybetLiveMonitor = null;
  });

  tick();
  statusEl.textContent = 'Pronto. Premi "Avvia monitoraggio" per iniziare.';

  window.__easybetLiveMonitor = {
    toggle: function () {
      box.style.display = box.style.display === 'none' ? 'block' : 'none';
    }
  };
})();
