(function(){
  var THEME_KEY = 'easybet-theme';
  function applyTheme(theme){
    var next = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);document.body.setAttribute('data-theme', next);
    var btn = document.getElementById('themeToggleAdmin');
    if (btn){
      btn.textContent = next === 'light' ? '🌙 Scuro' : '☀️ Chiaro';
      btn.setAttribute('aria-label', next === 'light' ? 'Attiva modalità scura' : 'Attiva modalità chiara');
      btn.title = next === 'light' ? 'Passa alla modalità scura' : 'Passa alla modalità chiara';
    }
  }
  try { applyTheme(localStorage.getItem(THEME_KEY) || 'dark'); } catch(e){ applyTheme('dark'); }
  // ---------------- accesso Admin lato server ----------------
  var pinGate = document.getElementById('pinGate');
  var appEl = document.getElementById('app');
  var pinInput = document.getElementById('pinInput');
  var pinBtn = document.getElementById('pinBtn');
  var pinError = document.getElementById('pinError');
  var pinSub = document.getElementById('pinSub');
  var pinReset = document.getElementById('pinReset');

  function showApp(){
    pinGate.style.display = 'none';
    appEl.style.display = 'block';
    initAppOnce();
  }

  function showGate(message){
    appEl.style.display = 'none';
    pinGate.style.display = 'flex';
    if(message) pinSub.textContent = message;
  }

  function checkAdminSession(){
    fetch('/api/admin/status', { credentials:'same-origin', cache:'no-store' })
      .then(function(r){ return r.json().then(function(j){ return {ok:r.ok, body:j}; }); })
      .then(function(x){
        if(!x.body.configured){
          pinSub.textContent = 'Sicurezza non configurata: imposta ADMIN_PIN sul server';
          pinBtn.disabled = true;
          pinInput.disabled = true;
          pinError.textContent = 'Su Render aggiungi la variabile ambiente ADMIN_PIN e ridistribuisci il servizio.';
          return;
        }
        pinBtn.disabled = false; pinInput.disabled = false;
        if(x.body.authenticated) showApp();
        else showGate('Inserisci il PIN admin');
      })
      .catch(function(){
        showGate('Impossibile verificare la sessione admin');
        pinError.textContent = 'Controlla che il server sia raggiungibile.';
      });
  }

  function tryUnlock(){
    var v = pinInput.value.trim();
    pinError.textContent = '';
    if (!v){ pinError.textContent = 'Inserisci il PIN.'; return; }
    pinBtn.disabled = true;
    fetch('/api/admin/login', {
      method:'POST',
      credentials:'same-origin',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({pin:v})
    }).then(function(r){
      return r.json().catch(function(){return {};}).then(function(j){ return {ok:r.ok,status:r.status,body:j}; });
    }).then(function(x){
      pinBtn.disabled = false;
      if(x.ok){ pinInput.value=''; showApp(); return; }
      pinError.textContent = x.body.error || (x.status===429 ? 'Troppi tentativi. Riprova più tardi.' : 'Accesso negato.');
      pinInput.value=''; pinInput.focus();
    }).catch(function(){
      pinBtn.disabled = false;
      pinError.textContent = 'Errore di collegamento al server.';
    });
  }

  pinBtn.addEventListener('click', tryUnlock);
  pinInput.addEventListener('keydown', function(e){ if (e.key === 'Enter') tryUnlock(); });
  pinReset.addEventListener('click', function(){
    alert('Il PIN non è più salvato nel browser. Per cambiarlo modifica ADMIN_PIN nelle variabili ambiente del server e ridistribuisci il servizio.');
  });

  var themeToggleAdmin = document.getElementById('themeToggleAdmin');
  if (themeToggleAdmin){
    themeToggleAdmin.addEventListener('click', function(){
      var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      try { localStorage.setItem(THEME_KEY, next); } catch(e){}
      applyTheme(next);
    });
  }

  document.getElementById('lockBtn').addEventListener('click', function(){
    fetch('/api/admin/logout', {method:'POST',credentials:'same-origin'})
      .finally(function(){ location.reload(); });
  });

  checkAdminSession();

  // Se la sessione scade mentre l'admin è aperto, blocca nuovamente la pagina.
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function(){
    var args = arguments;
    var url = String(args[0] || '');
    return nativeFetch.apply(window, args).then(function(resp){
      if(resp.status === 401 && url.indexOf('/api/admin/login') === -1 && url.indexOf('/api/admin/status') === -1){
        showGate('Sessione scaduta. Inserisci di nuovo il PIN admin.');
      }
      return resp;
    });
  };

  // ---------------- app ----------------
  var appInited = false;
  function initAppOnce(){
    if (appInited) return;
    appInited = true;
    startApp();
  }

  function startApp(){
    var ESITO_LABEL = {
      entrata_vinta: '🟢 Entrata e vinta',
      entrata_persa: '🔴 Entrata e persa',
      non_entrata: '🟡 Non entrata'
    };

    var crestCache = {};
    var matches = [];
    var selectedIds = new Set();
    var currentFilter = 'tutte';
    var currentDateFilter = 'tutte';

    var ICON_CLOCK = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>';
    var ICON_SHIELD = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6l7-3z"/></svg>';
    var ICON_CHART = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V11M12 20V4M20 20v-7"/></svg>';
    var ICON_TARGET = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor" stroke="none"/></svg>';
    var ICON_TROPHY = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M7 5H4v1a4 4 0 004 4M17 5h3v1a4 4 0 01-4 4"/></svg>';
    var ICON_HOURGLASS = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12"/><path d="M7 3c0 5 5 5.5 5 9s-5 4-5 9M17 3c0 5-5 5.5-5 9s5 4 5 9"/></svg>';

    function esc(s){
      return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    }

    function normTeamKey(s){
      return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
    }

    var CREST_ALIASES = {
      'lahti':['FC Lahti'],'sk rapid':['Rapid Vienna','SK Rapid Wien','Rapid Wien'],'waterford united':['Waterford FC','Waterford'],
      'klubi 04':['Klubi 04','HJK Klubi 04'],'neuchatel xamax':['Neuchatel Xamax','Neuchatel Xamax FCS'],'rapperswil jona':['FC Rapperswil-Jona','Rapperswil-Jona'],
      'sjk':['SJK Seinajoki','Seinajoen JK'],'wisla krakow':['Wisla Krakow'],'slask wroclaw':['Slask Wroclaw'],'america mineiro':['America MG','America Mineiro'],
      'vila nova':['Vila Nova FC'],'shamrock rovers':['Shamrock Rovers FC'],'wsg tirol':['WSG Swarovski Tirol','WSG Tirol'],'varda se':['Kisvarda FC','Kisvarda'],'sirius':['IK Sirius'],'servette':['Servette FC'],
      'fc tokyo':['FC Tokyo'],'nagoya grampus':['Nagoya Grampus'],'millwall':['Millwall FC'],'west ham united':['West Ham United','West Ham'],'barnsley':['Barnsley FC'],
      'leicester city':['Leicester City FC','Leicester City'],'tps':['TPS Turku','Turun Palloseura'],'ilves':['Ilves','Ilves Tampere'],'mp':['Mikkelin Palloilijat','MP Mikkeli'],
      'jippo':['JIPPO','JIPPO Joensuu'],'odddevold':['IK Oddevold','Oddevold'],'varnamo':['IFK Varnamo','Varnamo'],'ifk goteborg':['IFK Goteborg','Goteborg'],
      'brommapojkarna':['IF Brommapojkarna','Brommapojkarna'],'accrington stanley':['Accrington Stanley'],'newport county':['Newport County AFC','Newport County'],
      'kr reykjavik':['KR Reykjavik','KR'],'vikingur reykjavik':['Vikingur Reykjavik','Vikingur'],'lincoln city':['Lincoln City FC','Lincoln City'],'swansea city':['Swansea City AFC','Swansea City'],
      'oddevold':['IK Oddevold','Oddevold'],'mjallby':['Mjallby AIF','Mjallby'],'aik':['AIK'],'lokomotiv sofia 1929':['Lokomotiv Sofia','Lokomotiv 1929 Sofia'],
      'cska sofia':['CSKA Sofia'],'zalgiris':['FK Zalgiris','Zalgiris Vilnius'],'kauno zalgiris':['FK Kauno Zalgiris','Kauno Zalgiris'],
      'novi pazar':['FK Novi Pazar','Novi Pazar'],'zemun':['FK Zemun','Zemun'],'fk kosice':['FC Kosice','Kosice','FK Kosice'],'kosice':['FC Kosice','Kosice','FK Kosice'],'ruzomberok':['MFK Ruzomberok','Ruzomberok'],'villa dalmine':['Club Villa Dalmine','Villa Dalmine'],'ituzaingo':['CA Ituzaingo','Club Atletico Ituzaingo','Ituzaingo'],'atletico mineiro':['Clube Atletico Mineiro','Atletico Mineiro','Atletico-MG'],'chapecoense':['Chapecoense','Associacao Chapecoense de Futebol','Chapecoense AF'],'sporting cp':['Sporting CP','Sporting Clube de Portugal','Sporting'],'arouca':['FC Arouca','Arouca'],'nacional':['CD Nacional','Nacional da Madeira','Nacional'],'familicao':['FC Famalicao','Famalicao'],'famalicao':['FC Famalicao','Famalicao']
    };

    function crestQueries(name){
      var raw = String(name||'').trim();
      var key = normTeamKey(raw);
      var out = [raw].concat(CREST_ALIASES[key] || []);
      var stripped = raw.replace(/\b(FC|AFC|CF|SC|SK|FK|AC|AS|SSC|SV|TSV|NK|JK|IFK|BK|IF)\b/gi,' ').replace(/\s+/g,' ').trim();
      if (stripped && normTeamKey(stripped)!==key) out.push(stripped);
      if (raw && !/\bFC\b/i.test(raw)) out.push(raw + ' FC');
      return out.filter(Boolean).filter(function(v,i,a){ return a.indexOf(v)===i; });
    }

    function initials(name){
      var parts = String(name||'').trim().split(/\s+/);
      var a = (parts[0]||'')[0] || '?';
      var b = (parts[1]||'')[0] || '';
      return (a+b).toUpperCase();
    }

    function crestImg(name, campionato, size){
      var id = 'crest-' + Math.random().toString(36).slice(2);
      setTimeout(function(){ loadCrest(name, campionato, id); }, 0);
      var cls = 'crest placeholder' + (size==='lg' ? ' crest-lg' : '');
      return '<span class="'+cls+'" id="'+id+'">'+esc(initials(name))+'</span>';
    }

    function loadCrest(name, campionato, id){
      if (!String(name||'').trim()) return;
      var key = normTeamKey(name) + '|' + normTeamKey(campionato||'');
      if (crestCache[key] !== undefined){ applyCrest(id, crestCache[key]); return; }
      var queries = crestQueries(name);
      (function tryNext(idx){
        if (idx >= queries.length){ crestCache[key] = null; return; }
        var q = queries[idx];
        var url = '/api/team-crest?name=' + encodeURIComponent(q) + (campionato ? '&country=' + encodeURIComponent(campionato) : '');
        fetch(url)
          .then(function(r){ return r.ok ? r.json() : null; })
          .then(function(d){
            if (d && d.url){
              crestCache[key] = d.url;
              applyCrest(id, d.url);
            } else {
              tryNext(idx+1);
            }
          })
          .catch(function(){ tryNext(idx+1); });
      })(0);
    }

    function applyCrest(id, url){
      var el = document.getElementById(id);
      if (!el || !url) return;
      var originalClass = el.className;
      var originalText = el.textContent;
      var img = document.createElement('img');
      img.className = el.className.replace(/\bplaceholder\b/,'').replace(/\s+/g,' ').trim();
      img.src = url;
      img.alt = '';
      img.onerror = function(){
        var ph = document.createElement('span');
        ph.className = originalClass;
        ph.id = id;
        ph.textContent = originalText;
        img.replaceWith(ph);
      };
      el.replaceWith(img);
    }

    function fmtWhen(m){
      var d = new Date(Number(m.startAt));
      var dd = (m.data || d.toLocaleDateString('it-IT'));
      var oo = (m.ora || d.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}));
      return dd + ' ' + oo;
    }

    function matchesFilter(m){
      if (currentFilter === 'tutte') return true;
      return (m.esitoManuale || '') === currentFilter;
    }

    function formatSectionDate(ts){
      var d = new Date(Number(ts));
      if (isNaN(d.getTime())) return 'data non valida';
      return d.toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    }

    function renderCard(m){
      var esito = m.esitoManuale || '';
      var cls = 'card' + (esito ? ' esito-'+esito : '') + (selectedIds.has(String(m.id)) ? ' is-selected' : '');
      var bannerCls = esito ? esito : 'attesa';
      var bannerIcon = esito ? ICON_TROPHY : ICON_HOURGLASS;
      var searchText = [m.casa,m.trasferta,m.campionato,m.tipoGiocata,m.quotaIngresso].filter(Boolean).join(' ').toLowerCase();
      return '<div class="'+cls+'" data-id="'+esc(m.id)+'" data-search="'+esc(searchText)+'">'+
        '<label class="card-select" title="Seleziona partita"><input type="checkbox" data-role="select" data-id="'+esc(m.id)+'"'+(selectedIds.has(String(m.id))?' checked':'')+'></label>'+
        '<div class="card-top2">'+
          '<div class="league-badge">'+ICON_SHIELD+'<span>'+esc(m.campionato||'—')+'</span></div>'+
          '<div class="kickoff">'+ICON_CLOCK+'<span>'+esc(fmtWhen(m))+'</span></div>'+
        '</div>'+
        '<div class="matchup">'+
          '<div class="side">'+
            '<div class="side-label">Casa</div>'+
            crestImg(m.casa, m.campionato, 'lg')+
            '<div class="side-name">'+esc(m.casa)+'</div>'+
            '<button type="button" class="crest-edit-btn" data-role="crest" data-team="'+esc(m.casa)+'" data-league="'+esc(m.campionato||'')+'">Stemma</button>'+
          '</div>'+
          '<div class="vs-mid">VS</div>'+
          '<div class="side">'+
            '<div class="side-label">Trasferta</div>'+
            crestImg(m.trasferta, m.campionato, 'lg')+
            '<div class="side-name">'+esc(m.trasferta)+'</div>'+
            '<button type="button" class="crest-edit-btn" data-role="crest" data-team="'+esc(m.trasferta)+'" data-league="'+esc(m.campionato||'')+'">Stemma</button>'+
          '</div>'+
        '</div>'+
        '<div class="stats-row">'+
          '<div class="stat">'+ICON_CHART+'<div class="stat-text"><span class="stat-label">Quota ingresso</span><span class="stat-value">'+esc(m.quotaIngresso||'—')+'</span></div></div>'+
          '<div class="stat">'+ICON_TARGET+'<div class="stat-text"><span class="stat-label">Strategia</span><span class="stat-value">'+esc(m.tipoGiocata||'—')+'</span></div></div>'+
        '</div>'+
        '<div class="esito-banner '+bannerCls+'">'+bannerIcon+
          '<div class="esito-banner-text"><span class="esito-tag">Esito</span>'+
            '<select class="esito-select-inline" data-id="'+esc(m.id)+'" data-role="esito">'+
              '<option value=""'+(esito===''?' selected':'')+'>In attesa</option>'+
              '<option value="entrata_vinta"'+(esito==='entrata_vinta'?' selected':'')+'>Entrata • Vinta</option>'+
              '<option value="entrata_persa"'+(esito==='entrata_persa'?' selected':'')+'>Entrata • Persa</option>'+
              '<option value="non_entrata"'+(esito==='non_entrata'?' selected':'')+'>Non entrata</option>'+
            '</select>'+
          '</div>'+
        '</div>'+
        '<div class="card-foot">'+
          '<label class="bot-toggle"><input type="checkbox" data-role="bot" data-id="'+esc(m.id)+'"'+(m.botEnabled?' checked':'')+'> su Telegram</label>'+
          '<div class="card-actions">'+
            '<button class="icon-btn" data-role="edit" data-id="'+esc(m.id)+'" title="Modifica">✎</button>'+
          '</div>'+
        '</div>'+
      '</div>';
    }

    function localDateKey(ts){
      var d = new Date(Number(ts));
      if (isNaN(d.getTime())) return '';
      var y = d.getFullYear();
      var m = String(d.getMonth()+1).padStart(2,'0');
      var day = String(d.getDate()).padStart(2,'0');
      return y+'-'+m+'-'+day;
    }

    function relativeDateKeys(){
      var now = new Date();
      var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      var tomorrow = new Date(today.getTime() + 86400000);
      var afterTomorrow = new Date(today.getTime() + 2*86400000);
      function key(d){
        return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
      }
      return { today:key(today), tomorrow:key(tomorrow), afterTomorrow:key(afterTomorrow) };
    }

    function matchesDateFilter(m){
      if (currentDateFilter === 'tutte') return true;
      var keys = relativeDateKeys();
      var mk = localDateKey(m.startAt);
      if (currentDateFilter === 'oggi') return mk === keys.today;
      if (currentDateFilter === 'domani') return mk === keys.tomorrow;
      if (currentDateFilter === 'future') return mk >= keys.afterTomorrow;
      return true;
    }

    function visibleMatches(){
      return matches.filter(matchesFilter).filter(matchesDateFilter);
    }

    function updateBulkUI(){
      var count = selectedIds.size;
      var el = document.getElementById('bulkCount');
      if (el) el.textContent = String(count);
      ['bulkApply','bulkCopyFirst','bulkDelete','bulkClear'].forEach(function(id){
        var b=document.getElementById(id); if(b) b.disabled = count===0;
      });
      ['bulkStrategy','bulkQuota','bulkOutcome','bulkBot'].forEach(function(id){
        var x=document.getElementById(id); if(x) x.disabled = count===0;
      });
    }

    function bulkRequest(action, fields){
      var ids = Array.from(selectedIds);
      if (!ids.length) return Promise.reject(new Error('Seleziona almeno una partita.'));
      return fetch('/api/matches/bulk', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ids:ids, action:action, fields:fields||{}})
      }).then(function(r){
        return r.json().catch(function(){ return {}; }).then(function(d){ if(!r.ok) throw new Error(d.error||'Errore operazione di massa'); return d; });
      });
    }

    function reloadAfterBulk(){
      return fetch('/api/matches').then(function(r){return r.json();}).then(function(data){
        matches = Array.isArray(data) ? data : [];
        var valid = new Set(matches.map(function(m){return String(m.id);}));
        selectedIds.forEach(function(id){ if(!valid.has(id)) selectedIds.delete(id); });
        render(); updateBulkUI();
      });
    }

    function render(){
      var grid = document.getElementById('grid');
      var list = matches.filter(matchesFilter).filter(matchesDateFilter);
      if (!list.length){
        grid.innerHTML = '<div class="empty">Nessuna partita in questa vista.</div>';
        updateBulkUI();
        return;
      }

      var groups = [];
      list.forEach(function(m){
        var key = localDateKey(m.startAt);
        var existing = groups.find(function(g){ return g.key === key; });
        if (!existing){
          existing = { key:key, label: formatSectionDate(m.startAt), items: [] };
          groups.push(existing);
        }
        existing.items.push(m);
      });

      groups.sort(function(a,b){ return b.key.localeCompare(a.key); });

      var keys = relativeDateKeys();
      grid.innerHTML = '<div class="date-groups">' + groups.map(function(group, idx){
        var countLabel = group.items.length + ' ' + (group.items.length === 1 ? 'partita' : 'partite');
        var shouldOpen = group.key === keys.today || group.key === keys.tomorrow || (currentDateFilter !== 'tutte' && idx === 0);
        return '<details class="date-section"'+(shouldOpen?' open':'')+'>'+
          '<summary>'+
            '<div class="date-head">'+
              '<div><div class="date-title">📅 ' + esc(group.label) + '</div><span class="date-sub">Partite raggruppate per data</span></div>'+
              '<div class="date-tools">'+
                '<div class="date-search-wrap">'+
                  '<span class="date-search-icon">⌕</span>'+
                  '<input class="date-search" type="search" autocomplete="off" data-date-search="'+esc(group.key)+'" placeholder="Cerca squadra, campionato o strategia...">'+
                  '<button type="button" class="date-search-clear" data-date-clear="'+esc(group.key)+'" aria-label="Cancella ricerca">×</button>'+
                '</div>'+
                '<div class="date-count" data-date-count="'+esc(group.key)+'" data-total="'+group.items.length+'">' + esc(countLabel) + '</div>'+
              '</div>'+
            '</div>'+
          '</summary>'+
          '<div class="grid date-grid">' + group.items.map(renderCard).join('') + '<div class="date-search-empty">Nessuna partita trovata per questa ricerca.</div></div>'+
        '</details>';
      }).join('') + '</div>';
      updateBulkUI();
    }

    function filterDateSection(input){
      var section = input.closest('details.date-section');
      if (!section) return;
      var q = String(input.value || '').trim().toLowerCase();
      var cards = Array.prototype.slice.call(section.querySelectorAll('.date-grid > .card'));
      var visible = 0;
      cards.forEach(function(card){
        var hay = String(card.getAttribute('data-search') || '').toLowerCase();
        var show = !q || hay.indexOf(q) !== -1;
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      var key = input.getAttribute('data-date-search');
      var count = section.querySelector('[data-date-count="'+key+'"]');
      var total = cards.length;
      if (count){
        count.textContent = q ? (visible + ' / ' + total + ' partite') : (total + ' ' + (total === 1 ? 'partita' : 'partite'));
      }
      var clear = section.querySelector('[data-date-clear="'+key+'"]');
      if (clear) clear.classList.toggle('show', !!q);
      var empty = section.querySelector('.date-search-empty');
      if (empty) empty.style.display = (q && visible === 0) ? 'block' : 'none';
      if (q) section.open = true;
    }

    document.getElementById('grid').addEventListener('input', function(e){
      var input = e.target.closest('.date-search');
      if (!input) return;
      filterDateSection(input);
    });

    document.getElementById('grid').addEventListener('click', function(e){
      var input = e.target.closest('.date-search');
      if (input){ e.stopPropagation(); return; }
      var clear = e.target.closest('.date-search-clear');
      if (!clear) return;
      e.preventDefault();
      e.stopPropagation();
      var section = clear.closest('details.date-section');
      var key = clear.getAttribute('data-date-clear');
      var target = section && section.querySelector('[data-date-search="'+key+'"]');
      if (target){ target.value = ''; filterDateSection(target); target.focus(); }
    });

    document.getElementById('grid').addEventListener('keydown', function(e){
      if (e.target.closest('.date-search')) e.stopPropagation();
    });

    function loadMatches(){
      return fetch('/api/state').then(function(r){ return r.json(); }).then(function(s){
        matches = (s.matches || []).slice().sort(function(a,b){ return b.startAt - a.startAt; });
        render();
      }).catch(function(){
        document.getElementById('grid').innerHTML = '<div class="empty">Errore nel caricamento.</div>';
      });
    }

    // pills
    document.getElementById('pills').addEventListener('click', function(e){
      var btn = e.target.closest('.pill');
      if (!btn) return;
      currentFilter = btn.getAttribute('data-f');
      document.querySelectorAll('.pill').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      render();
    });

    document.getElementById('dateFilters').addEventListener('click', function(e){
      var btn = e.target.closest('.date-pill');
      if (!btn) return;
      currentDateFilter = btn.getAttribute('data-datef') || 'tutte';
      document.querySelectorAll('.date-pill').forEach(function(p){ p.classList.remove('active'); });
      btn.classList.add('active');
      render();
    });

    // inline esito / bot toggle
    document.getElementById('grid').addEventListener('change', function(e){
      var role = e.target.getAttribute('data-role');
      if (role === 'select'){
        var sid = String(e.target.getAttribute('data-id') || '');
        if (e.target.checked) selectedIds.add(sid); else selectedIds.delete(sid);
        var card = e.target.closest('.card'); if(card) card.classList.toggle('is-selected', e.target.checked);
        updateBulkUI();
        return;
      }
      var id = e.target.getAttribute('data-id');
      if (!role || !id) return;
      var payload = {};
      if (role === 'esito') payload.esitoManuale = e.target.value;
      if (role === 'bot') payload.botEnabled = e.target.checked;
      fetch('/api/matches/' + encodeURIComponent(id), {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(payload)
      }).then(function(r){ return r.json(); }).then(function(updated){
        var idx = matches.findIndex(function(m){ return m.id === id; });
        if (idx !== -1) matches[idx] = updated;
        render();
      });
    });

    document.getElementById('grid').addEventListener('click', function(e){
      var crestBtn = e.target.closest('[data-role="crest"]');
      if (crestBtn){
        var team=crestBtn.getAttribute('data-team')||'';
        var league=crestBtn.getAttribute('data-league')||'';
        var url=window.prompt('URL dello stemma per '+team+'\n\nIncolla un URL immagine http/https. Scrivi AUTO per tornare alla ricerca automatica.','');
        if(url===null) return;
        fetch('/api/team-crest',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:team,campionato:league,url:url})})
          .then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'Errore'); return d;})})
          .then(function(){
            Object.keys(crestCache).forEach(function(k){if(k.indexOf(String(team).toLowerCase())===0) delete crestCache[k];});
            render();
          }).catch(function(err){window.alert(err.message||'Errore salvataggio stemma');});
        return;
      }
      var btn = e.target.closest('[data-role="edit"]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var m = matches.find(function(x){ return x.id === id; });
      if (m) openModal(m);
    });

    // STEP 9 — azioni di massa
    document.getElementById('bulkSelectVisible').addEventListener('click', function(){
      visibleMatches().forEach(function(m){ selectedIds.add(String(m.id)); });
      render();
    });
    document.getElementById('bulkClear').addEventListener('click', function(){ selectedIds.clear(); render(); });

    document.getElementById('bulkApply').addEventListener('click', function(){
      var fields = {};
      var strategy = document.getElementById('bulkStrategy').value.trim();
      var quota = document.getElementById('bulkQuota').value.trim();
      var outcome = document.getElementById('bulkOutcome').value;
      var bot = document.getElementById('bulkBot').value;
      if (strategy) fields.tipoGiocata = strategy;
      if (quota) fields.quotaIngresso = quota;
      if (outcome !== '__keep__') fields.esitoManuale = outcome;
      if (bot !== '__keep__') fields.botEnabled = bot === 'on';
      if (!Object.keys(fields).length){ window.alert('Scegli almeno una modifica da applicare.'); return; }
      var n=selectedIds.size;
      if(!window.confirm('Applicare le modifiche a '+n+' partite selezionate?')) return;
      bulkRequest('update',fields).then(function(){
        document.getElementById('bulkStrategy').value='';
        document.getElementById('bulkQuota').value='';
        document.getElementById('bulkOutcome').value='__keep__';
        document.getElementById('bulkBot').value='__keep__';
        return reloadAfterBulk();
      }).catch(function(err){ window.alert(err.message); });
    });

    document.getElementById('bulkCopyFirst').addEventListener('click', function(){
      var ids=Array.from(selectedIds);
      if(ids.length<2){ window.alert('Seleziona almeno due partite.'); return; }
      var source=matches.find(function(m){return String(m.id)===ids[0];});
      if(!source){ window.alert('Partita sorgente non trovata.'); return; }
      var targetIds=ids.slice(1);
      if(!window.confirm('Copiare strategia "'+(source.tipoGiocata||'')+'" e quota "'+(source.quotaIngresso||'')+'" dalla prima selezionata alle altre '+targetIds.length+'?')) return;
      fetch('/api/matches/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ids:targetIds,action:'update',fields:{tipoGiocata:source.tipoGiocata||'',quotaIngresso:source.quotaIngresso||''}})})
        .then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'Errore'); return d;});})
        .then(reloadAfterBulk).catch(function(err){window.alert(err.message);});
    });

    document.getElementById('bulkDelete').addEventListener('click', function(){
      var n=selectedIds.size;
      if(!n) return;
      if(!window.confirm('Eliminare definitivamente '+n+' partite selezionate?\n\nQuesta operazione non può essere annullata.')) return;
      bulkRequest('delete',{}).then(function(){ selectedIds.clear(); return reloadAfterBulk(); }).catch(function(err){window.alert(err.message);});
    });
    updateBulkUI();

    // ---------------- modal ----------------
    var backdrop = document.getElementById('modalBackdrop');
    var modalTitle = document.getElementById('modalTitle');
    var fId = document.getElementById('fId');
    var fCampionato = document.getElementById('fCampionato');
    var fCasa = document.getElementById('fCasa');
    var fTrasferta = document.getElementById('fTrasferta');
    var fData = document.getElementById('fData');
    var fOra = document.getElementById('fOra');
    var fTipo = document.getElementById('fTipo');
    var fQuota = document.getElementById('fQuota');
    var fEsito = document.getElementById('fEsito');
    var fBot = document.getElementById('fBot');
    var modalErr = document.getElementById('modalErr');
    var deleteBtn = document.getElementById('deleteBtn');

    function pad(n){ return n < 10 ? '0'+n : ''+n; }

    function resetDeleteButton(){
      deleteBtn.dataset.confirmDelete = '0';
      deleteBtn.disabled = false;
      deleteBtn.textContent = 'Elimina';
    }

    function openModal(m){
      modalErr.textContent = '';
      resetDeleteButton();
      if (m){
        modalTitle.textContent = 'Modifica partita';
        fId.value = m.id;
        fCampionato.value = m.campionato || '';
        fCasa.value = m.casa || '';
        fTrasferta.value = m.trasferta || '';
        var d = new Date(Number(m.startAt));
        fData.value = d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate());
        fOra.value = pad(d.getHours()) + ':' + pad(d.getMinutes());
        fTipo.value = m.tipoGiocata || '';
        fQuota.value = m.quotaIngresso || '';
        fEsito.value = m.esitoManuale || '';
        fBot.checked = !!m.botEnabled;
        deleteBtn.style.display = 'inline-block';
      } else {
        modalTitle.textContent = 'Aggiungi partita';
        fId.value = '';
        fCampionato.value = '';
        fCasa.value = '';
        fTrasferta.value = '';
        var now = new Date(Date.now() + 60*60000);
        fData.value = now.getFullYear() + '-' + pad(now.getMonth()+1) + '-' + pad(now.getDate());
        fOra.value = pad(now.getHours()) + ':' + pad(now.getMinutes());
        fTipo.value = '';
        fQuota.value = '';
        fEsito.value = '';
        fBot.checked = true;
        deleteBtn.style.display = 'none';
      }
      backdrop.classList.add('open');
    }

    function closeModal(){
      backdrop.classList.remove('open');
      resetDeleteButton();
    }

    document.getElementById('addBtn').addEventListener('click', function(){ openModal(null); });
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    backdrop.addEventListener('click', function(e){ if (e.target === backdrop) closeModal(); });

    document.getElementById('saveBtn').addEventListener('click', function(){
      var casa = fCasa.value.trim(), trasferta = fTrasferta.value.trim();
      if (!casa || !trasferta){ modalErr.textContent = 'Inserisci entrambe le squadre.'; return; }
      if (!fData.value || !fOra.value){ modalErr.textContent = 'Inserisci data e ora.'; return; }
      var startAt = new Date(fData.value + 'T' + fOra.value).getTime();
      if (isNaN(startAt)){ modalErr.textContent = 'Data/ora non valida.'; return; }

      var payload = {
        campionato: fCampionato.value.trim(),
        casa: casa,
        trasferta: trasferta,
        data: fData.value,
        ora: fOra.value,
        startAt: startAt,
        tipoGiocata: fTipo.value.trim(),
        quotaIngresso: fQuota.value.trim(),
        esitoManuale: fEsito.value,
        botEnabled: fBot.checked
      };

      var id = fId.value;
      var req = id
        ? fetch('/api/matches/' + encodeURIComponent(id), { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) })
        : fetch('/api/matches', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });

      req.then(function(r){
        if (!r.ok) throw new Error('save-failed');
        return r.json();
      }).then(function(){
        closeModal();
        loadMatches();
      }).catch(function(){
        modalErr.textContent = 'Errore nel salvataggio.';
      });
    });

    deleteBtn.addEventListener('click', function(e){
      e.preventDefault();
      e.stopPropagation();
      var id = String(fId.value || '').trim();
      if (!id){
        modalErr.textContent = 'Impossibile eliminare: ID partita mancante.';
        return;
      }

      // Primo click: conferma direttamente nel pulsante, senza popup del browser.
      if (deleteBtn.dataset.confirmDelete !== '1'){
        deleteBtn.dataset.confirmDelete = '1';
        deleteBtn.textContent = 'Conferma elimina';
        modalErr.textContent = 'Premi ancora “Conferma elimina” per cancellare definitivamente la partita.';
        return;
      }

      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Eliminazione…';
      modalErr.textContent = '';

      fetch('/api/matches/' + encodeURIComponent(id), {
        method:'DELETE',
        headers:{'Accept':'application/json'}
      }).then(function(r){
        if (r.ok || r.status === 204) return null;
        return r.text().then(function(t){
          var msg = 'Errore durante l’eliminazione.';
          try { var j = JSON.parse(t); if (j && j.error) msg = j.error; } catch(_e) { if (t) msg = t; }
          throw new Error(msg);
        });
      }).then(function(){
        closeModal();
        return loadMatches();
      }).catch(function(err){
        deleteBtn.disabled = false;
        deleteBtn.dataset.confirmDelete = '0';
        deleteBtn.textContent = 'Elimina';
        modalErr.textContent = err && err.message ? err.message : 'Errore durante l’eliminazione.';
      });
    });

    // ---------------- import elenco (incolla lista partite) ----------------
    // Stesso formato/parser usato nel Taccuino Exchange: righe "[Campionato]" seguite
    // da righe "GG/MM/AAAA HH:MM  Squadra Casa - Squadra Trasferta".
    function toStartAt(dataStr, oraStr){
      var dm = (dataStr||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      var tm = (oraStr||'').match(/^(\d{1,2}):(\d{2})$/);
      if (!dm || !tm) return null;
      var d = new Date(parseInt(dm[3],10), parseInt(dm[2],10)-1, parseInt(dm[1],10), parseInt(tm[1],10), parseInt(tm[2],10), 0, 0);
      return d.getTime();
    }

    function parsePaste(text){
      var lines = text.split('\n');
      var league = '';
      var out = [];
      for (var i=0;i<lines.length;i++){
        var raw = lines[i].replace(/\r$/,'');
        var trimmed = raw.trim();
        if (!trimmed) continue;
        var lm = trimmed.match(/^\[(.+)\]$/);
        if (lm){ league = lm[1].trim(); continue; }
        var parts = raw.split('\t').map(function(s){return s.trim();}).filter(function(s){return s.length && s !== '-';});
        if (parts.length < 2){
          parts = trimmed.split(/\s{2,}/).map(function(s){return s.trim();}).filter(function(s){return s.length && s !== '-';});
        }
        var dateStr, timeStr, matchStr;
        if (parts.length >= 2){
          var dt = parts[0].match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})$/);
          if (dt){ dateStr = dt[1]; timeStr = dt[2]; matchStr = parts[1]; }
        }
        if (!dateStr){
          var full = trimmed.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}:\d{2})\s+(.+)$/);
          if (full){ dateStr = full[1]; timeStr = full[2]; matchStr = full[3]; }
        }
        if (!dateStr || !matchStr) continue;
        matchStr = matchStr.replace(/\s*-\s*$/,'').trim();
        var tm2 = matchStr.match(/^(.+?)\s+-\s+(.+)$/);
        if (!tm2) continue;
        out.push({data:dateStr, ora:timeStr, campionato:league, casa:tm2[1].trim(), trasferta:tm2[2].trim(), tipoGiocata:'', quotaIngresso:''});
      }
      return out;
    }

    var importPending = [];
    var importBackdrop = document.getElementById('importBackdrop');
    var importBox = document.getElementById('importBox');
    var importErr = document.getElementById('importErr');
    var importPreview = document.getElementById('importPreview');

    function openImportModal(){
      importPending = [];
      importBox.value = '';
      importErr.textContent = '';
      importPreview.innerHTML = '';
      importBackdrop.classList.add('open');
    }
    function closeImportModal(){ importBackdrop.classList.remove('open'); }

    function renderImportPreview(){
      if (!importPending.length){ importPreview.innerHTML = ''; return; }
      var html = importPending.map(function(m, idx){
        return '<div class="preview-row">'+
          '<span class="pv-when">'+esc(m.data)+' '+esc(m.ora)+'</span>'+
          '<span><span class="pv-match">'+esc(m.casa)+' - '+esc(m.trasferta)+'</span><br><span class="pv-league">'+esc(m.campionato||'')+'</span></span>'+
          '<button type="button" class="pv-del" data-idx="'+idx+'">✕</button>'+
          '<div class="preview-fields">'+
            '<input class="pv-tipo" data-idx="'+idx+'" placeholder="Strategia / tipo di giocata" value="'+esc(m.tipoGiocata||'')+'">'+
            '<input class="pv-quota" data-idx="'+idx+'" inputmode="decimal" placeholder="Quota consigliata (es. 1.66)" value="'+esc(m.quotaIngresso||'')+'">'+
          '</div>'+
        '</div>';
      }).join('');
      html += '<div class="modal-actions" style="margin-top:10px;">'+
        '<div style="flex:1"></div>'+
        '<button class="btn btn-primary" id="importConfirmBtn">Conferma import ('+importPending.length+' partite)</button>'+
      '</div>';
      importPreview.innerHTML = html;
      Array.prototype.forEach.call(importPreview.querySelectorAll('.pv-tipo'), function(inp){
        inp.addEventListener('input', function(){ importPending[+inp.getAttribute('data-idx')].tipoGiocata = inp.value; });
      });
      Array.prototype.forEach.call(importPreview.querySelectorAll('.pv-quota'), function(inp){
        inp.addEventListener('input', function(){
          var value = inp.value.replace(',', '.').replace(/[^0-9.]/g, '');
          var firstDot = value.indexOf('.');
          if (firstDot !== -1) value = value.slice(0, firstDot + 1) + value.slice(firstDot + 1).replace(/\./g, '');
          inp.value = value;
          importPending[+inp.getAttribute('data-idx')].quotaIngresso = value;
        });
      });
      Array.prototype.forEach.call(importPreview.querySelectorAll('.pv-del'), function(btn){
        btn.addEventListener('click', function(){ importPending.splice(+btn.getAttribute('data-idx'),1); renderImportPreview(); });
      });
      document.getElementById('importConfirmBtn').addEventListener('click', confirmImport);
    }

    function confirmImport(){
      var batch = importPending.slice();
      var chain = Promise.resolve();
      batch.forEach(function(m){
        var startAt = toStartAt(m.data, m.ora);
        if (startAt == null) return;
        chain = chain.then(function(){
          return fetch('/api/matches', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              campionato: m.campionato || '', casa: m.casa, trasferta: m.trasferta,
              data: m.data, ora: m.ora, startAt: startAt,
              tipoGiocata: m.tipoGiocata || '', quotaIngresso: m.quotaIngresso || '', esitoManuale: '', botEnabled: true
            })
          });
        });
      });
      chain.then(function(){
        importPending = [];
        closeImportModal();
        loadMatches();
      }).catch(function(){
        importErr.textContent = 'Errore durante l\'import.';
      });
    }

    document.getElementById('importBtn').addEventListener('click', openImportModal);
    document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
    importBackdrop.addEventListener('click', function(e){ if (e.target === importBackdrop) closeImportModal(); });
    document.getElementById('importParseBtn').addEventListener('click', function(){
      importErr.textContent = '';
      var parsed = parsePaste(importBox.value);
      if (!parsed.length){ importErr.textContent = 'Nessuna partita riconosciuta in questo testo.'; importPreview.innerHTML=''; return; }
      importPending = parsed;
      renderImportPreview();
    });

    loadMatches();
    setInterval(loadMatches, 30000);
  }
})();
