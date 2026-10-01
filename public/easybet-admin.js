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
          pinBtn.disabled = true;
          pinInput.disabled = true;
          if(!x.body.pinOk){
            pinSub.textContent = 'Sicurezza non configurata: ADMIN_PIN non valido';
            pinError.textContent = 'Su Render imposta ADMIN_PIN con almeno 6 caratteri.';
          }else if(!x.body.secretOk){
            pinSub.textContent = 'Sicurezza non configurata: manca il secret di sessione';
            pinError.textContent = 'Su Render imposta ADMIN_SESSION_SECRET con almeno 32 caratteri casuali e ridistribuisci.';
          }else{
            pinSub.textContent = 'Sicurezza Admin non configurata';
            pinError.textContent = 'Controlla le variabili ambiente su Render.';
          }
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
  function downloadAdminFile(url, fallbackName, button){
    if(button){ button.disabled = true; button.classList.add('is-loading'); }
    return fetch(url,{credentials:'same-origin',cache:'no-store'})
      .then(function(r){
        if(!r.ok){
          return r.json().catch(function(){return {};}).then(function(b){throw new Error(b.error||('Errore HTTP '+r.status));});
        }
        var cd=String(r.headers.get('content-disposition')||'');
        var m=cd.match(/filename="([^"]+)"/i);
        var name=m&&m[1]?m[1]:fallbackName;
        return r.blob().then(function(blob){return {blob:blob,name:name};});
      })
      .then(function(x){
        var u=URL.createObjectURL(x.blob);
        var a=document.createElement('a');
        a.href=u;a.download=x.name;document.body.appendChild(a);a.click();a.remove();
        setTimeout(function(){URL.revokeObjectURL(u)},1000);
      })
      .catch(function(err){window.alert(err.message||'Impossibile scaricare il file.');})
      .finally(function(){if(button){button.disabled=false;button.classList.remove('is-loading');}});
  }

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
        ebTrendHtml(ebTrendFromImport(m&&m.importData),'')+
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
    var backupBtn=document.getElementById('backupBtn');
    if(backupBtn) backupBtn.addEventListener('click',function(){
      downloadAdminFile('/api/admin/backup','easybet-backup.json',backupBtn);
    });
    var exportCsvBtn=document.getElementById('exportCsvBtn');
    if(exportCsvBtn) exportCsvBtn.addEventListener('click',function(){
      downloadAdminFile('/api/admin/export/matches.csv','easybet-partite.csv',exportCsvBtn);
    });

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

    // ---------------- import elenco da CSV (STEP 43) ----------------
    // L'import amministrativo usa direttamente il file CSV: niente più copia/incolla.
    // Per i file di scouting OVER 0.5 HT la quota del CSV (O1.5 FT) viene volutamente ignorata.
    var IMPORT_STRATEGY = 'Over 0.5 HT';
    var IMPORT_QUOTA = '1.60';

    function toStartAt(dataStr, oraStr){
      var dm = (dataStr||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      var tm = (oraStr||'').match(/^(\d{1,2}):(\d{2})$/);
      if (!dm || !tm) return null;
      var d = new Date(parseInt(dm[3],10), parseInt(dm[2],10)-1, parseInt(dm[1],10), parseInt(tm[1],10), parseInt(tm[2],10), 0, 0);
      return d.getTime();
    }

    function csvRows(text){
      text = String(text || '').replace(/^\uFEFF/, '');
      var first = (text.split(/\r?\n/,1)[0] || '');
      var delimiter = (first.split(';').length > first.split(',').length) ? ';' : ',';
      var rows=[], row=[], cell='', quoted=false;
      for (var i=0;i<text.length;i++){
        var ch=text[i];
        if (quoted){
          if (ch==='"' && text[i+1]==='"'){ cell+='"'; i++; }
          else if (ch==='"'){ quoted=false; }
          else { cell+=ch; }
        } else {
          if (ch==='"') quoted=true;
          else if (ch===delimiter){ row.push(cell); cell=''; }
          else if (ch==='\n'){ row.push(cell.replace(/\r$/,'')); rows.push(row); row=[]; cell=''; }
          else cell+=ch;
        }
      }
      if (cell.length || row.length){ row.push(cell.replace(/\r$/,'')); rows.push(row); }
      return rows.filter(function(r){ return r.some(function(v){ return String(v||'').trim()!==''; }); });
    }

    function normalizeHeader(v){
      return String(v || '').replace(/^\uFEFF/,'').trim().toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
        .replace(/[^a-z0-9]+/g,' ' ).trim();
    }

    function parsePct(v){
      var raw=String(v==null?'':v).trim().replace('%','').replace(',','.');
      var n=parseFloat(raw);
      return isFinite(n)?Math.max(0,Math.min(100,n)):null;
    }
    function pctLabel(v){
      var n=(typeof v==='number')?v:parsePct(v);
      if (n==null) return '—';
      var rounded=Math.round(n*10)/10;
      return String(rounded).replace('.',',')+'%';
    }
    function ebTrendFromImport(d){
      if(!d||typeof d!=='object')return null;
      var e=d._easybet||{};
      function num(v){if(v==null||v==='')return null;var n=parseFloat(String(v).replace('%','').replace(',','.'));return isFinite(n)?n:null}
      function nk(k){return String(k||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()}
      function find(names){var ks=Object.keys(d);for(var i=0;i<ks.length;i++){if(ks[i]==='_easybet')continue;var k=nk(ks[i]);for(var j=0;j<names.length;j++)if(k===names[j])return num(d[ks[i]])}return null}
      function avg(a,b){var v=[a,b].filter(function(x){return x!=null});return v.length?v.reduce(function(x,y){return x+y},0)/v.length:null}
      var h25=e.home2570Pct!=null?num(e.home2570Pct):find(['home gol 25 70']),a25=e.away2570Pct!=null?num(e.away2570Pct):find(['osp gol 25 70','ospite gol 25 70']);
      if(e.type==='o15_2570'||h25!=null||a25!=null){
        var h00=e.home00at70Pct!=null?num(e.home00at70Pct):find(['home 0 0 al 70']),a00=e.away00at70Pct!=null?num(e.away00at70Pct):find(['osp 0 0 al 70','ospite 0 0 al 70']);
        return {title:'GOL 25–70 · EXCH O1.5',main:[['Casa',h25],['Trasferta',a25],['Media',avg(h25,a25),'media']],sub:[['0-0 al 70’ casa',h00],['0-0 al 70’ trasf.',a00]]};
      }
      var h=num(e.over05HomePct),a=num(e.over05AwayPct),h15=num(e.home1545Pct),a15=num(e.away1545Pct);
      if(h!=null||a!=null||h15!=null||a15!=null)return {title:'PRESA ULTIME 5',main:[['Casa',h],['Trasferta',a],['Media',avg(h,a),'media']],sub:[['Gol 15–45 casa',h15],['Gol 15–45 trasf.',a15]]};
      var gen=Object.keys(d).filter(function(k){return /^\{.*\}$/.test(String(k).trim())&&num(d[k])!=null});
      if(!gen.length)return null;
      var items=gen.map(function(k){return [String(k).trim().replace(/^\{|\}$/g,''),num(d[k])]});
      return {title:'STATISTICHE CSV',main:items.slice(0,3),sub:items.slice(3,6)};
    }
    function ebTrendHtml(t,extraClass){
      if(!t)return '';
      function lab(v){if(v==null)return '—';var r=Math.round(v*10)/10;return String(r).replace('.',',')+'%'}
      function esc2(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
      function spans(list){return list.map(function(x){return '<span'+(x[2]?' class="'+x[2]+'"':'')+'>'+esc2(x[0])+' <b>'+lab(x[1])+'</b></span>'}).join('')}
      return '<div class="csv-trend-card'+(extraClass?' '+extraClass:'')+'"><div class="csv-trend-title">'+esc2(t.title)+'</div><div class="csv-trend-main">'+spans(t.main)+'</div>'+(t.sub&&t.sub.length?'<div class="csv-trend-sub">'+spans(t.sub)+'</div>':'')+'</div>';
    }
    
    function importTrend(m){
      var d=m&&m.importData;
      if(!d||typeof d!=='object') return null;
      var e=d._easybet||{};
      var home=e.over05HomePct, away=e.over05AwayPct, h1545=e.home1545Pct, a1545=e.away1545Pct;
      if(home==null && away==null && h1545==null && a1545==null) return null;
      var vals=[home,away].filter(function(x){return typeof x==='number'&&isFinite(x);});
      var avg=vals.length?vals.reduce(function(a,b){return a+b;},0)/vals.length:null;
      return {home:home,away:away,h1545:h1545,a1545:a1545,avg:avg};
    }

    function parseDateOra(raw){
      raw=String(raw||'').trim();
      // Esempio: "25/26 02/10/2026 0130". La prima parte è la stagione.
      var m=raw.match(/(?:^|\s)(\d{2}\/\d{2}\/\d{4})\s+(\d{2})(\d{2})(?:\s|$)/);
      if (!m) m=raw.match(/(?:^|\s)(\d{2}\/\d{2}\/\d{4})\s+(\d{1,2}):(\d{2})(?:\s|$)/);
      if (!m) return null;
      return {data:m[1], ora:String(m[2]).padStart(2,'0')+':'+m[3]};
    }

    function parseImportCsv(text, fileName){
      var rows=csvRows(text);
      if (rows.length < 2) return [];
      var headers=rows[0].map(function(h){ return String(h||'').replace(/^\uFEFF/,'').trim(); });
      var norm=headers.map(normalizeHeader);
      function idx(){
        for (var a=0;a<arguments.length;a++){
          var wanted=arguments[a];
          var found=norm.indexOf(wanted);
          if (found>=0) return found;
        }
        return -1;
      }
      var iId=idx('matchid','match id');
      var iLeague=idx('campionato');
      var iDate=idx('data ora','dataora','data');
      var iHome=idx('squadra casa','casa','home');
      var iAway=idx('squadra ospite','ospite','away');
      var iOverHome=idx('over 0 5 casa');
      var iOverAway=idx('over 0 5 trasf','over 0 5 trasferta');
      var iHome1545=idx('home gol 15 445','home gol 15 45');
      var iAway1545=idx('osp gol 15 45','ospite gol 15 45','away gol 15 45');
      var iH2570=idx('home gol 25 70'), iA2570=idx('osp gol 25 70','ospite gol 25 70');
      var iH00=idx('home 0 0 al 70'), iA00=idx('osp 0 0 al 70','ospite 0 0 al 70');
      var isO15=iH2570>=0||iA2570>=0;
      var rowStrategy=isO15?'Over 1.5 FT':IMPORT_STRATEGY, rowQuota=isO15?'1.70':IMPORT_QUOTA;
      if (iLeague<0 || iDate<0 || iHome<0 || iAway<0) return [];
      var out=[];
      for (var r=1;r<rows.length;r++){
        var vals=rows[r];
        var dt=parseDateOra(vals[iDate]);
        var casa=String(vals[iHome]||'').trim(), trasferta=String(vals[iAway]||'').trim();
        if (!dt || !casa || !trasferta) continue;
        var original={};
        headers.forEach(function(h,j){
          var nh=normalizeHeader(h);
          // Le colonne quota/O1.5 FT non vengono importate né conservate: per EasyBet l'ingresso minimo è sempre 1.60 (regola O0.5 HT PRE+LIVE).
          if (nh.indexOf('o1 5 sopra')!==-1 || nh.indexOf('quota')!==-1 || nh.indexOf('odds')!==-1) return;
          original[h]=vals[j] == null ? '' : String(vals[j]).trim();
        });
        // Schema definitivo OVER 0.5 HT: salviamo anche una forma normalizzata delle percentuali
        // così le card non dipendono dagli spazi o dalla punteggiatura dei titoli CSV.
        original._easybet=isO15?{
          type:'o15_2570',
          home2570Pct:iH2570>=0?parsePct(vals[iH2570]):null,
          away2570Pct:iA2570>=0?parsePct(vals[iA2570]):null,
          home00at70Pct:iH00>=0?parsePct(vals[iH00]):null,
          away00at70Pct:iA00>=0?parsePct(vals[iA00]):null
        }:{
          type:'o05ht',
          over05HomePct:iOverHome>=0?parsePct(vals[iOverHome]):null,
          over05AwayPct:iOverAway>=0?parsePct(vals[iOverAway]):null,
          home1545Pct:iHome1545>=0?parsePct(vals[iHome1545]):null,
          away1545Pct:iAway1545>=0?parsePct(vals[iAway1545]):null
        };
        out.push({
          data:dt.data, ora:dt.ora,
          campionato:String(vals[iLeague]||'').trim(),
          casa:casa, trasferta:trasferta,
          tipoGiocata:rowStrategy,
          quotaIngresso:rowQuota,
          importSource:fileName || 'CSV',
          importMatchId:iId>=0 ? String(vals[iId]||'').trim() : '',
          importData:original
        });
      }
      return out;
    }

    var importPending = [];
    var importBackdrop = document.getElementById('importBackdrop');
    var importCsvFile = document.getElementById('importCsvFile');
    var importChooseBtn = document.getElementById('importChooseBtn');
    var importFileName = document.getElementById('importFileName');
    var importErr = document.getElementById('importErr');
    var importPreview = document.getElementById('importPreview');

    function closeImportModal(){ importBackdrop.classList.remove('open'); }

    function renderImportPreview(){
      if (!importPending.length){ importPreview.innerHTML = ''; return; }
      var html = '<div class="csv-import-summary"><b>'+importPending.length+' partite riconosciute</b><span>Strategia: '+esc(String(importPending[0].tipoGiocata||'').toUpperCase())+'</span><span>Quota ingresso: '+esc(importPending[0].quotaIngresso||'')+'</span></div>';
      html += importPending.map(function(m, idx){
        return '<div class="preview-row">'+
          '<span class="pv-when">'+esc(m.data)+' '+esc(m.ora)+'</span>'+
          '<span><span class="pv-match">'+esc(m.casa)+' - '+esc(m.trasferta)+'</span><br><span class="pv-league">'+esc(m.campionato||'')+'</span></span>'+
          '<button type="button" class="pv-del" data-idx="'+idx+'">✕</button>'+
          (function(){var t=ebTrendFromImport(m.importData);if(!t)return '';return '<div class="preview-trend">'+t.main.concat(t.sub||[]).map(function(x){return '<span>'+esc(x[0])+' <b>'+pctLabel(x[1])+'</b></span>'}).join('')+'</div>';})()+
          '<div class="preview-fields fixed"><span>'+esc(String(m.tipoGiocata||'').toUpperCase())+'</span><b>'+esc(m.quotaIngresso||'')+'</b></div>'+
        '</div>';
      }).join('');
      html += '<div class="modal-actions" style="margin-top:10px;"><div style="flex:1"></div><button class="btn btn-primary" id="importConfirmBtn">Importa '+importPending.length+' partite</button></div>';
      importPreview.innerHTML = html;
      Array.prototype.forEach.call(importPreview.querySelectorAll('.pv-del'), function(btn){
        btn.addEventListener('click', function(){ importPending.splice(+btn.getAttribute('data-idx'),1); renderImportPreview(); });
      });
      document.getElementById('importConfirmBtn').addEventListener('click', confirmImport);
    }

    function openCsvPicker(){
      importCsvFile.value='';
      importCsvFile.click();
    }

    function confirmImport(){
      var batch = importPending.slice();
      if (!batch.length) return;
      var btn=document.getElementById('importConfirmBtn');
      if (btn){btn.disabled=true;btn.textContent='Importazione…';}
      var chain = Promise.resolve();
      var done=0, skipped=0;
      function sameText(a,b){return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase();}
      batch.forEach(function(m){
        var startAt = toStartAt(m.data, m.ora);
        if (startAt == null) return;
        var duplicate = matches.some(function(x){
          return Number(x.startAt)===Number(startAt) && sameText(x.casa,m.casa) && sameText(x.trasferta,m.trasferta);
        });
        if (duplicate){ skipped++; return; }
        chain = chain.then(function(){
          return fetch('/api/matches', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              campionato:m.campionato || '', casa:m.casa, trasferta:m.trasferta,
              data:m.data, ora:m.ora, startAt:startAt,
              tipoGiocata:m.tipoGiocata||IMPORT_STRATEGY, quotaIngresso:m.quotaIngresso||IMPORT_QUOTA,
              esitoManuale:'', botEnabled:true,
              importSource:m.importSource || 'CSV', importMatchId:m.importMatchId || '', importData:m.importData || null
            })
          }).then(function(r){ if(!r.ok) return r.text().then(function(t){throw new Error(t||'Errore import');}); done++; });
        });
      });
      chain.then(function(){
        importPending=[];
        closeImportModal();
        loadMatches();
      }).catch(function(err){
        importErr.textContent='Importazione interrotta dopo '+done+' partite. '+(err&&err.message?err.message:'');
        if (btn){btn.disabled=false;btn.textContent='Riprova import';}
      });
    }

    document.getElementById('importBtn').addEventListener('click', openCsvPicker);
    importChooseBtn.addEventListener('click', openCsvPicker);
    document.getElementById('importCancelBtn').addEventListener('click', closeImportModal);
    importBackdrop.addEventListener('click', function(e){ if (e.target === importBackdrop) closeImportModal(); });
    importCsvFile.addEventListener('change', function(){
      var file=importCsvFile.files && importCsvFile.files[0];
      if (!file) return;
      importErr.textContent='';
      importPreview.innerHTML='';
      importFileName.textContent=file.name;
      var reader=new FileReader();
      reader.onload=function(){
        var parsed=parseImportCsv(reader.result,file.name);
        if (!parsed.length){
          importPending=[];
          importErr.textContent='CSV non riconosciuto. Servono almeno le colonne Campionato, Data/Ora, Squadra Casa e Squadra Ospite.';
          importBackdrop.classList.add('open');
          return;
        }
        importPending=parsed;
        importBackdrop.classList.add('open');
        renderImportPreview();
      };
      reader.onerror=function(){ importErr.textContent='Impossibile leggere il file CSV.'; importBackdrop.classList.add('open'); };
      reader.readAsText(file,'UTF-8');
    });

    loadMatches();
    setInterval(loadMatches, 30000);
  }
})();
