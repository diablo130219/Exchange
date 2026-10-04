// EasyBet · salvataggio Money Management sul server (con copia locale e controllo versione).
// - I dati restano nel database: aggiornare la pagina o cambiare dispositivo non azzera più le casse.
// - La copia nel browser serve solo come cache / modalità offline.
// - Se un altro dispositivo ha salvato una versione più recente, non viene sovrascritta.
(function () {
  'use strict';
  function lsGet(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } }

  function bind(cfg) {
    var metaKey = cfg.localKey + '.__sync';
    var meta = (function () { try { return JSON.parse(lsGet(metaKey) || 'null') || { version: 0, dirty: false }; } catch (_) { return { version: 0, dirty: false }; } })();
    var timer = null, inflight = false, again = false, loaded = false, status = { kind: 'loading', text: 'Sincronizzazione…' };

    function writeMeta() { lsSet(metaKey, JSON.stringify(meta)); }
    function writeLocal() { lsSet(cfg.localKey, JSON.stringify(cfg.get())); }
    function setStatus(kind, text) { status = { kind: kind, text: text }; if (cfg.onStatus) cfg.onStatus(status); }
    function adopt(state, version) {
      cfg.set(state); meta.version = Number(version) || 0; meta.dirty = false; writeLocal(); writeMeta();
      if (cfg.onChange) cfg.onChange();
    }

    function push() {
      if (inflight) { again = true; return Promise.resolve(); }
      inflight = true;
      var body = JSON.stringify({ state: cfg.get(), baseVersion: meta.version || 0 });
      return fetch('/api/mm-state/' + cfg.key, { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: body, keepalive: body.length < 60000 })
        .then(function (r) {
          return r.json().catch(function () { return {}; }).then(function (j) {
            if (r.status === 401 || r.status === 403) { setStatus('local', 'Salvato solo su questo dispositivo · accedi come admin per salvarlo sul server'); return; }
            if (r.status === 409 && j.state) { adopt(j.state, j.version); setStatus('warn', 'Aggiornato con i dati più recenti salvati da un altro dispositivo'); return; }
            if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
            meta.version = Number(j.version) || meta.version; meta.dirty = false; writeMeta();
            setStatus('ok', 'Salvato sul server');
          });
        })
        .catch(function () { setStatus('local', 'Server non raggiungibile · salvato su questo dispositivo, riprovo al prossimo salvataggio'); })
        .then(function () { inflight = false; if (again) { again = false; push(); } });
    }

    function save() {
      writeLocal(); meta.dirty = true; writeMeta();
      if (!loaded) return; // prima del caricamento dal server non si scrive mai sul server
      clearTimeout(timer); timer = setTimeout(push, 500);
    }

    function load() {
      return fetch('/api/mm-state/' + cfg.key + '?ts=' + Date.now(), { credentials: 'same-origin', cache: 'no-store' })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) { loaded = false; setStatus('local', 'Salvato solo su questo dispositivo · accedi come admin per salvarlo sul server'); return; }
          return r.json().then(function (j) {
            if (!r.ok) throw new Error(j.error || 'Errore');
            loaded = true;
            if (!j.state) {
              // Server ancora vuoto: carico i dati già presenti in questo browser (migrazione automatica).
              if (cfg.hasData(cfg.get())) { meta.version = 0; return push(); }
              setStatus('ok', 'Salvato sul server'); return;
            }
            if (meta.dirty && Number(meta.version) === Number(j.version) && cfg.hasData(cfg.get())) {
              return push(); // modifiche fatte offline partendo dalla versione attuale: le invio
            }
            adopt(j.state, j.version);
            setStatus('ok', 'Salvato sul server');
          });
        })
        .catch(function () { setStatus('local', 'Server non raggiungibile · uso i dati salvati su questo dispositivo'); });
    }

    // Quando torni sulla pagina riallineo con il server (es. modifiche fatte dal telefono).
    function refresh() { if (loaded && !meta.dirty && !inflight) load(); }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
    window.addEventListener('focus', refresh);
    window.addEventListener('pagehide', function () { if (meta.dirty && loaded) { clearTimeout(timer); push(); } });

    load();
    // Scelte di sola visualizzazione (metodo/cassa selezionati): solo copia locale, non toccano il server.
    function saveLocal() { writeLocal(); }
    return { save: save, saveLocal: saveLocal, reload: load, status: function () { return status; }, isLoaded: function () { return loaded; } };
  }

  function badge(st) {
    st = st || { kind: 'loading', text: 'Sincronizzazione…' };
    var icon = st.kind === 'ok' ? '☁︎' : st.kind === 'warn' ? '↻' : st.kind === 'local' ? '⚠︎' : '…';
    return '<div class="mm-sync mm-sync-' + st.kind + '"><span>' + icon + '</span>' + String(st.text).replace(/[&<>]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]; }) + '</div>';
  }

  window.EasyBetMMStore = { bind: bind, badge: badge };
})();
