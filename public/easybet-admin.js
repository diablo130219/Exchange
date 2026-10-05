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
  var areaGate = document.getElementById('areaGate');
  var currentAdminArea = '';
  var refreshAdminAreaView = null;
  function normalizeAdminArea(v){ return v === 'classic' ? 'classic' : (v === 'live' ? 'live' : ''); }
  function areaFromUrl(){ try { return normalizeAdminArea(new URLSearchParams(location.search).get('area')); } catch(e){ return ''; } }
  function applyAdminArea(area){
    currentAdminArea = normalizeAdminArea(area) || 'live';
    if(areaGate){ areaGate.classList.remove('open'); areaGate.setAttribute('aria-hidden','true'); }
    var badge=document.getElementById('adminAreaBadge');
    if(badge){ badge.className='admin-area-chip '+currentAdminArea; badge.textContent=currentAdminArea==='classic'?'BETTING CLASSICO':'EXCHANGE LIVE'; }
    var ht=document.getElementById('adminHeroTitle'), hs=document.getElementById('adminHeroSub');
    if(ht) ht.innerHTML=currentAdminArea==='classic'?'Betting classico, <span class="gold">gestito a mano</span>.':'Exchange Live, <span class="gold">gestito a mano</span>.';
    if(hs) hs.textContent=currentAdminArea==='classic'?'Inserisci e gestisci solo le partite pre-match del betting classico. Restano separate dalle strategie Exchange Live.':'Gestisci le partite destinate alle strategie live, al Live Analyzer e all’Exchange.';
    document.querySelectorAll('[data-live-only="1"]').forEach(function(el){ el.style.display=currentAdminArea==='live'?'':'none'; });
    var outcomeFilters=document.getElementById('outcomeFilters');
    if(outcomeFilters) outcomeFilters.style.display=currentAdminArea==='classic'?'none':'';
    if(currentAdminArea==='classic') currentFilter='tutte';
    var importBtnArea=document.getElementById('importBtn');
    if(importBtnArea) importBtnArea.textContent=currentAdminArea==='classic'?'📥 Importa CSV classico':'📋 Importa CSV Exchange';
    try { history.replaceState(null,'',location.pathname+'?area='+currentAdminArea); } catch(e){}
    if(appInited && typeof refreshAdminAreaView === 'function'){ refreshAdminAreaView(); }
  }
  function chooseAdminArea(){
    if(areaGate){ areaGate.classList.add('open'); areaGate.setAttribute('aria-hidden','false'); }
  }
  var areaClassicBtn=document.getElementById('areaClassicBtn'), areaLiveBtn=document.getElementById('areaLiveBtn'), changeAreaBtn=document.getElementById('changeAreaBtn');
  if(areaClassicBtn) areaClassicBtn.addEventListener('click',function(){ applyAdminArea('classic'); initAppOnce(); });
  if(areaLiveBtn) areaLiveBtn.addEventListener('click',function(){ applyAdminArea('live'); initAppOnce(); });
  if(changeAreaBtn) changeAreaBtn.addEventListener('click',function(){ chooseAdminArea(); });

  function showApp(){
    pinGate.style.display = 'none';
    appEl.style.display = 'block';
    var fromUrl=areaFromUrl();
    if(fromUrl){ applyAdminArea(fromUrl); initAppOnce(); }
    else { chooseAdminArea(); }
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
    var ICON_TELEGRAM = '<svg class="tg-svg" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 4.2c.3.2.4.6.3 1L18.8 20c-.1.7-.8 1.1-1.4.8l-4.9-2.4-2.6 2.4c-.3.3-.8.4-1.2.2-.4-.2-.6-.6-.6-1v-4.1L18 7.3 6.1 14.2 2 12.4c-.5-.2-.7-.7-.7-1.2 0-.5.4-.9.9-1l18.2-6c.4-.1.8-.1 1.2 0z"/></svg>';
    function telegramToggleHtml(m, extraClass){
      return '<label class="bot-toggle telegram-toggle '+(extraClass||'')+'" title="Invia nel riepilogo Telegram" aria-label="Invia nel riepilogo Telegram"><input type="checkbox" data-role="bot" data-id="'+esc(m.id)+'"'+(m.botEnabled?' checked':'')+'><span class="tg-logo">'+ICON_TELEGRAM+'</span></label>';
    }

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
      var dd = (!isNaN(d.getTime())) ? d.toLocaleDateString('it-IT', {day:'2-digit', month:'2-digit', year:'numeric'}) : (m.data || '—');
      var oo = (m.ora || (!isNaN(d.getTime()) ? d.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'}) : ''));
      return dd + ' ' + oo;
    }

    function matchesFilter(m){
      var area=(m.bettingArea==='classic')?'classic':'live';
      if(area !== (currentAdminArea||'live')) return false;
      if (currentAdminArea === 'classic') return true;
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
      if (currentAdminArea === 'classic') {
        return '<div class="card classic-card" data-id="'+esc(m.id)+'" data-search="'+esc(searchText)+'">'+
          '<div class="card-top2">'+
            '<div class="league-badge">'+ICON_SHIELD+'<span>'+esc(m.campionato||'—')+'</span></div>'+
            '<div class="kickoff">'+ICON_CLOCK+'<span>'+esc(fmtWhen(m))+'</span></div>'+
          '</div>'+
          '<div class="matchup">'+
            '<div class="side">'+crestImg(m.casa,m.campionato,'lg')+'<div class="side-name">'+esc(m.casa)+'</div><button type="button" class="crest-edit-btn" data-role="crest" data-team="'+esc(m.casa)+'" data-league="'+esc(m.campionato||'')+'">Stemma</button></div>'+
            '<div class="vs-mid">VS</div>'+
            '<div class="side">'+crestImg(m.trasferta,m.campionato,'lg')+'<div class="side-name">'+esc(m.trasferta)+'</div><button type="button" class="crest-edit-btn" data-role="crest" data-team="'+esc(m.trasferta)+'" data-league="'+esc(m.campionato||'')+'">Stemma</button></div>'+
          '</div>'+
          '<div class="stats-row">'+
            '<div class="stat">'+ICON_TARGET+'<div class="stat-text"><span class="stat-label">Giocata</span><span class="stat-value">'+esc(m.tipoGiocata||'—')+'</span></div></div>'+
            (m.quotaIngresso?'<div class="stat">'+ICON_CHART+'<div class="stat-text"><span class="stat-label">Quota</span><span class="stat-value">'+esc(m.quotaIngresso)+'</span></div></div>':'')+
          '</div>'+
          '<div class="card-foot classic-card-foot">'+
            ''+telegramToggleHtml(m,'classic-bot-toggle')+''+
            '<div class="card-actions"><button class="icon-btn" data-role="edit" data-id="'+esc(m.id)+'" title="Modifica">✎</button></div>'+
          '</div>'+
        '</div>';
      }
      return '<div class="'+cls+'" data-id="'+esc(m.id)+'" data-search="'+esc(searchText)+'">'+

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
          '<div class="esito-banner-text"><span class="esito-tag">Esito'+(m.esitoAuto?' · auto':'')+'</span>'+
            '<select class="esito-select-inline" data-id="'+esc(m.id)+'" data-role="esito">'+
              '<option value=""'+(esito===''?' selected':'')+'>In attesa</option>'+
              '<option value="entrata_vinta"'+(esito==='entrata_vinta'?' selected':'')+'>Entrata • Vinta</option>'+
              '<option value="entrata_persa"'+(esito==='entrata_persa'?' selected':'')+'>Entrata • Persa</option>'+
              '<option value="non_entrata"'+(esito==='non_entrata'?' selected':'')+'>Non entrata</option>'+
            '</select>'+
          '</div>'+
        '</div>'+
        '<div class="card-foot">'+
          ''+telegramToggleHtml(m,'exchange-bot-toggle')+''+
          '<div class="card-actions">'+
            (/^entrata_/.test(esito)?'<button class="icon-btn diario-btn'+(m.diarioLinkedAt?' linked':'')+'" data-role="diario" data-id="'+esc(m.id)+'" title="'+(m.diarioLinkedAt?'Nel Diario: '+fmtEuro(m.diarioProfit)+' · clicca per modificare':'Registra nel Diario Exchange')+'">📒</button>':'')+
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

    function monthKeyFromDay(key){ return /^\d{4}-\d{2}/.test(key) ? key.slice(0,7) : 'sconosciuto'; }
    function monthLabelFromKey(key){
      if (!/^\d{4}-\d{2}$/.test(key)) return 'Archivio';
      var p = key.split('-'), d = new Date(Number(p[0]), Number(p[1])-1, 1);
      var t = d.toLocaleDateString('it-IT',{month:'long',year:'numeric'});
      return t.charAt(0).toUpperCase()+t.slice(1);
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

      var months = [];
      groups.forEach(function(g){
        var mk = monthKeyFromDay(g.key), m = months.find(function(x){ return x.key === mk; });
        if(!m){ m={key:mk,label:monthLabelFromKey(mk),days:[]}; months.push(m); }
        m.days.push(g);
      });
      months.sort(function(a,b){return b.key.localeCompare(a.key)});

      var keys = relativeDateKeys();
      var prevOpen = {}, prevMonthOpen = {}, prevSearch = {}, hadSections = false;
      Array.prototype.forEach.call(grid.querySelectorAll('details.date-section'), function(d){
        var inp = d.querySelector('[data-date-search]'); if (!inp) return;
        var k = inp.getAttribute('data-date-search'); hadSections = true;
        prevOpen[k] = d.open; if (inp.value) prevSearch[k] = inp.value;
      });
      Array.prototype.forEach.call(grid.querySelectorAll('details.month-section'),function(d){prevMonthOpen[d.getAttribute('data-month')] = d.open;});
      var scrollY = window.scrollY;

      function renderDay(group, idx){
        var countLabel = group.items.length + ' ' + (group.items.length === 1 ? 'partita' : 'partite');
        var gW=0,gL=0,gN=0,gP=0,gHasP=false; group.items.forEach(function(x){ if(x.esitoManuale==='entrata_vinta')gW++; else if(x.esitoManuale==='entrata_persa')gL++; else if(x.esitoManuale==='non_entrata')gN++; if(x.diarioProfit!=null){gP+=Number(x.diarioProfit)||0;gHasP=true;} });
        var daySummary='';
        if(currentAdminArea !== 'classic'){
          daySummary=(gW+gL+gN)?'<span class="date-summary"><b class="w">'+gW+' V</b><b class="l">'+gL+' P</b><b class="n">'+gN+' NE</b>'+(gW+gL?'<b>'+Math.round(gW/(gW+gL)*100)+'%</b>':'')+(gHasP?'<b class="'+(gP>=0?'w':'l')+'">'+fmtEuro(gP)+'</b>':'')+'</span>':'';
        }
        var shouldOpen = (hadSections && Object.prototype.hasOwnProperty.call(prevOpen, group.key)) ? prevOpen[group.key] : (group.key === keys.today || group.key === keys.tomorrow || (currentDateFilter !== 'tutte' && idx === 0));
        return '<details class="date-section" data-day="'+esc(group.key)+'"'+(shouldOpen?' open':'')+'><summary><div class="date-head"><div><div class="date-title">📅 ' + esc(group.label) + '</div><span class="date-sub">Partite raggruppate per data</span>'+daySummary+'</div><div class="date-tools"><div class="date-search-wrap"><span class="date-search-icon">⌕</span><input class="date-search" type="search" autocomplete="off" data-date-search="'+esc(group.key)+'" placeholder="Cerca squadra, campionato o strategia..."><button type="button" class="date-search-clear" data-date-clear="'+esc(group.key)+'" aria-label="Cancella ricerca">×</button></div><div class="date-count" data-date-count="'+esc(group.key)+'" data-total="'+group.items.length+'">' + esc(countLabel) + '</div></div></div></summary><div class="grid date-grid">' + group.items.map(renderCard).join('') + '<div class="date-search-empty">Nessuna partita trovata per questa ricerca.</div></div></details>';
      }

      var hasPrevMonths=Object.keys(prevMonthOpen).length>0;
      grid.innerHTML = '<div class="month-groups">' + months.map(function(month, mi){
        var all=[]; month.days.forEach(function(d){all=all.concat(d.items)});
        var w=0,l=0,n=0; all.forEach(function(x){if(x.esitoManuale==='entrata_vinta')w++;else if(x.esitoManuale==='entrata_persa')l++;else if(x.esitoManuale==='non_entrata')n++;});
        var played=w+l, open = hasPrevMonths ? !!prevMonthOpen[month.key] : mi===0;
        var monthSummary = '';
        if(currentAdminArea !== 'classic'){ monthSummary = '<span class="month-summary"><b class="w">'+w+' V</b><b class="l">'+l+' P</b><b class="n">'+n+' NE</b>'+(played?'<b>'+Math.round(w/played*100)+'%</b>':'')+'</span>'; }
        return '<details class="month-section" data-month="'+esc(month.key)+'"'+(open?' open':'')+'><summary><div class="month-head"><span class="month-icon">▣</span><div><small>ARCHIVIO MENSILE</small><strong>'+esc(month.label)+'</strong><span>'+month.days.length+' '+(month.days.length===1?'giorno':'giorni')+' · '+all.length+' '+(all.length===1?'partita':'partite')+'</span></div></div>'+monthSummary+'</summary><div class="date-groups">'+month.days.map(renderDay).join('')+'</div></details>';
      }).join('') + '</div>';
      Object.keys(prevSearch).forEach(function(k){
        var inp = grid.querySelector('[data-date-search="'+k+'"]');
        if (inp){ inp.value = prevSearch[k]; filterDateSection(inp); }
      });
      if (hadSections || hasPrevMonths) window.scrollTo(0, scrollY);
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

    // Aggiornamento automatico "gentile": non ridisegna la pagina mentre stai lavorando.
    var lastMatchesSig='', lastUserAction=0;
    ['pointerdown','keydown','wheel','touchstart'].forEach(function(ev){ document.addEventListener(ev,function(){ lastUserAction=Date.now(); },{passive:true,capture:true}); });
    function adminBusy(){
      if (document.querySelector('.modal-backdrop.open, #importBackdrop.open, #crestDialog')) return true;
      if (selectedIds.size>0) return true;
      var a=document.activeElement;
      if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName) && a.type!=='checkbox') return true;
      return Date.now()-lastUserAction < 60000;
    }
    function loadMatches(auto){
      return fetch('/api/state').then(function(r){ return r.json(); }).then(function(s){
        var list=(s.matches || []).slice().sort(function(a,b){ return b.startAt - a.startAt; });
        var sig=JSON.stringify(list);
        if (auto===true && (sig===lastMatchesSig || adminBusy())) return;
        lastMatchesSig=sig;
        matches = list;
        render();
      }).catch(function(){
        document.getElementById('grid').innerHTML = '<div class="empty">Errore nel caricamento.</div>';
      });
    }

    // Cambio area senza refresh pagina: ridisegna subito con i dati già caricati
    // e poi riallinea lo stato dal server. Questa callback è esposta al gate area
    // perché matches/selectedIds/render/loadMatches vivono nello scope di startApp.
    refreshAdminAreaView = function(){
      selectedIds.clear();
      render();
      return loadMatches(false);
    };

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
        if (role === 'esito' && /^entrata_/.test(String(payload.esitoManuale||''))) openDiarioDialog(updated);
      });
    });

    document.getElementById('grid').addEventListener('click', function(e){
      var diarioBtn = e.target.closest('[data-role="diario"]');
      if (diarioBtn){ var dm=matches.find(function(x){return String(x.id)===diarioBtn.getAttribute('data-id')}); if(dm) openDiarioDialog(dm); return; }
      var crestBtn = e.target.closest('[data-role="crest"]');
      if (crestBtn){
        openCrestDialog(crestBtn.getAttribute('data-team')||'', crestBtn.getAttribute('data-league')||'');
        return;
      }
      var btn = e.target.closest('[data-role="edit"]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var m = matches.find(function(x){ return x.id === id; });
      if (m) openModal(m);
    });



    // ---------- Collegamento esito → Diario Exchange ----------
    function fmtEuro(v){ var n=Number(v); if(!isFinite(n)) return '—'; return (n>0?'+':'')+n.toFixed(2).replace('.',',')+' €'; }
    var DIARIO_SYSTEMS=['EXCH O1.5 GOL 25-70','O0.5 HT PRE+LIVE','EXCH LAY X HT','EXCH UNDER 0.5 HT','EXCH FAVORITO HT · PARITÀ','EXCH FAVORITO HT · SOTTO','BET X PRE-MATCH'];
    function diarioSystemFor(tipo){
      var t=String(tipo||'').toLowerCase().replace(',','.');
      if(/1\.?5/.test(t)) return 'EXCH O1.5 GOL 25-70';
      if(/under/.test(t)) return 'EXCH UNDER 0.5 HT';
      if(/banca|lay ?x/.test(t)) return 'EXCH LAY X HT';
      if(/favorit/.test(t)) return 'EXCH FAVORITO HT · PARITÀ';
      if(/0\.?5/.test(t)) return 'O0.5 HT PRE+LIVE';
      if(/\bx\b/.test(t)) return 'BET X PRE-MATCH';
      return DIARIO_SYSTEMS[0];
    }
    function openDiarioDialog(m){
      if(!m) return;
      var old=document.getElementById('diarioDialog'); if(old) old.remove();
      var en=m.diarioEntry||{};
      var win=m.esitoManuale==='entrata_vinta', sys=(en.strategy&&DIARIO_SYSTEMS.indexOf(en.strategy)!==-1)?en.strategy:diarioSystemFor(m.tipoGiocata), side=en.side||(/LAY X|SOTTO/.test(sys)?'Banca':'Punta');
      var q=String(en.oddsIn||m.quotaIngresso||'').replace(',','.');
      var wrap=document.createElement('div'); wrap.id='diarioDialog'; wrap.className='crest-dialog-backdrop';
      wrap.innerHTML='<div class="crest-dialog diario-dialog"><h3>📒 Registra nel Diario Exchange</h3><p>'+esc(m.casa+' - '+m.trasferta)+' · <b>'+(win?'ENTRATA · VINTA':'ENTRATA · PERSA')+'</b></p>'+
        '<div class="diario-grid">'+
          '<label>Sistema<select id="dgSys">'+DIARIO_SYSTEMS.map(function(s){return '<option'+(s===sys?' selected':'')+'>'+esc(s)+'</option>'}).join('')+'</select></label>'+
          '<label>Punta / Banca<select id="dgSide"><option'+(side==='Punta'?' selected':'')+'>Punta</option><option'+(side==='Banca'?' selected':'')+'>Banca</option><option>Trading</option></select></label>'+
          '<label>Quota entrata<input id="dgIn" inputmode="decimal" value="'+esc(q)+'"></label>'+
          '<label>Quota uscita<input id="dgOut" inputmode="decimal" placeholder="facoltativa"></label>'+
          '<label>Stake (€)<input id="dgStake" inputmode="decimal" placeholder="es. 2" value="'+esc(en.stake?String(en.stake):'')+'"></label>'+
          '<label>Profitto netto (€)<input id="dgProfit" inputmode="decimal" placeholder="'+(win?'es. 1,90':'es. -2')+'" value="'+(m.diarioProfit!=null?String(m.diarioProfit).replace('.',','):'')+'"></label>'+
        '</div>'+
        '<div class="crest-dialog-actions"><button type="button" class="btn" data-dg="calc">Calcola profitto (comm. 5%)</button><span></span></div>'+
        '<div class="crest-dialog-actions"><button type="button" class="btn" data-dg="skip">Salta</button><button type="button" class="btn btn-primary" data-dg="save">Registra nel Diario</button></div>'+
        '<div class="crest-dialog-err" id="dgErr"></div></div>';
      document.body.appendChild(wrap);
      function v(id){ return String((wrap.querySelector('#'+id)||{}).value||'').trim().replace(',','.'); }
      wrap.addEventListener('click',function(ev){
        if(ev.target===wrap){ wrap.remove(); return; }
        var b=ev.target.closest('[data-dg]'); if(!b) return;
        var act=b.getAttribute('data-dg'), err=wrap.querySelector('#dgErr');
        if(act==='skip'){ wrap.remove(); return; }
        if(act==='calc'){
          var st=Number(v('dgStake')), qi=Number(v('dgIn')), sd=v('dgSide'), p;
          if(!(st>0)||!(qi>1)){ err.textContent='Servono stake e quota di entrata.'; return; }
          if(sd==='Banca') p= win ? st*0.95 : -st*(qi-1);
          else p= win ? st*(qi-1)*0.95 : -st;
          wrap.querySelector('#dgProfit').value=(Math.round(p*100)/100).toFixed(2).replace('.',','); err.textContent=''; return;
        }
        if(act==='save'){
          var pr=Number(v('dgProfit'));
          if(v('dgProfit')===''||!isFinite(pr)){ err.textContent='Scrivi il profitto netto oppure usa «Calcola profitto».'; return; }
          if(!win && pr>0) pr=-pr;
          err.textContent='Salvataggio…';
          fetch('/api/exchange/link-match',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({matchId:m.id,strategy:v('dgSys'),side:v('dgSide'),oddsIn:v('dgIn'),oddsOut:v('dgOut'),stake:v('dgStake'),minute:en.minute||'',profit:pr})})
            .then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'Errore'); return d;})})
            .then(function(d){ wrap.remove(); loadMatches(); window.alert('Registrata nel Diario: '+(d.period||'')+' · '+String(d.day).split('-').reverse().join('/')+' · sessione '+d.slot); })
            .catch(function(e2){ err.textContent=e2.message||'Errore'; });
        }
      });
    }
    // ---------- stemmi: dialogo (immagine dal computer / link / automatico) ----------
    function crestFileToDataUrl(file){
      return new Promise(function(resolve,reject){
        var u=URL.createObjectURL(file), img=new Image();
        img.onload=function(){
          var S=256, c=document.createElement('canvas'); c.width=S; c.height=S;
          var ctx=c.getContext('2d'), r=Math.min(S/img.width,S/img.height), w=img.width*r, h=img.height*r;
          ctx.drawImage(img,(S-w)/2,(S-h)/2,w,h); URL.revokeObjectURL(u); resolve(c.toDataURL('image/png'));
        };
        img.onerror=function(){ URL.revokeObjectURL(u); reject(new Error('Immagine non leggibile: '+file.name)); };
        img.src=u;
      });
    }
    function clearCrestCacheFor(team){
      var t=String(team||'').toLowerCase();
      Object.keys(crestCache).forEach(function(k){ if(!t || k.indexOf(t)===0) delete crestCache[k]; });
    }
    function saveCrest(team, league, body){
      return fetch('/api/team-crest',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.assign({name:team,campionato:league},body))})
        .then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'Errore'); return d;})})
        .then(function(){ clearCrestCacheFor(team); render(); });
    }
    function openCrestDialog(team, league){
      var old=document.getElementById('crestDialog'); if(old) old.remove();
      var wrap=document.createElement('div'); wrap.id='crestDialog'; wrap.className='crest-dialog-backdrop';
      wrap.innerHTML='<div class="crest-dialog"><h3>Stemma · '+esc(team)+'</h3><p>'+esc(league||'')+'</p>'+
        '<button type="button" class="btn btn-primary" data-cd="file">🖼 Carica immagine dal computer</button>'+
        '<div class="crest-dialog-or">oppure incolla il link dell’immagine</div>'+
        '<div class="crest-dialog-row"><input type="text" id="crestUrlInput" placeholder="https://…/stemma.png"><button type="button" class="btn" data-cd="url">Salva link</button></div>'+
        '<div class="crest-dialog-actions"><button type="button" class="btn" data-cd="auto">↺ Torna alla ricerca automatica</button><button type="button" class="btn" data-cd="close">Chiudi</button></div>'+
        '<div class="crest-dialog-err" id="crestDialogErr"></div><input type="file" id="crestFileInput" accept="image/*" hidden></div>';
      document.body.appendChild(wrap);
      var err=wrap.querySelector('#crestDialogErr'), fileIn=wrap.querySelector('#crestFileInput');
      function done(p){ err.textContent='Salvataggio…'; p.then(function(){ wrap.remove(); }).catch(function(e){ err.textContent=e.message||'Errore salvataggio stemma'; }); }
      wrap.addEventListener('click',function(ev){
        if(ev.target===wrap){ wrap.remove(); return; }
        var b=ev.target.closest('[data-cd]'); if(!b) return;
        var act=b.getAttribute('data-cd');
        if(act==='close') wrap.remove();
        else if(act==='file') fileIn.click();
        else if(act==='auto') done(saveCrest(team,league,{url:'AUTO'}));
        else if(act==='url'){ var v=wrap.querySelector('#crestUrlInput').value.trim(); if(!v){ err.textContent='Incolla prima un link.'; return; } done(saveCrest(team,league,{url:v})); }
      });
      fileIn.addEventListener('change',function(){
        var f=fileIn.files&&fileIn.files[0]; if(!f) return;
        done(crestFileToDataUrl(f).then(function(d){ return saveCrest(team,league,{imageData:d}); }));
      });
    }
    var crestBulkBtn=document.getElementById('crestBulkBtn'), crestBulkFile=document.getElementById('crestBulkFile');
    if(crestBulkBtn&&crestBulkFile){
      crestBulkBtn.addEventListener('click',function(){ crestBulkFile.value=''; crestBulkFile.click(); });
      crestBulkFile.addEventListener('change',function(){
        var files=Array.prototype.slice.call(crestBulkFile.files||[]); if(!files.length) return;
        crestBulkBtn.disabled=true; var label=crestBulkBtn.textContent; crestBulkBtn.textContent='Caricamento stemmi…';
        Promise.all(files.map(function(f){
          var name=f.name.replace(/\.[a-z0-9]+$/i,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
          return crestFileToDataUrl(f).then(function(d){return {name:name,imageData:d};}).catch(function(){return {name:name,imageData:''};});
        })).then(function(items){
          return fetch('/api/team-crests/bulk',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:items})})
            .then(function(r){return r.json().then(function(d){if(!r.ok) throw new Error(d.error||'Errore'); return d;})});
        }).then(function(d){
          clearCrestCacheFor(''); render();
          window.alert('Stemmi salvati: '+d.saved.length+(d.failed.length?'\nNon salvati: '+d.failed.join(', '):''));
        }).catch(function(e){ window.alert(e.message||'Errore caricamento stemmi'); })
          .finally(function(){ crestBulkBtn.disabled=false; crestBulkBtn.textContent=label; });
      });
    }

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
        bettingArea: currentAdminArea || 'live',
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
      var raw=String(dataStr||'').trim();
      var dm = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
      var iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      var tm = String(oraStr||'').match(/^(\d{1,2}):(\d{2})$/);
      if ((!dm && !iso) || !tm) return null;
      var y=dm?parseInt(dm[3],10):parseInt(iso[1],10), mo=dm?parseInt(dm[2],10):parseInt(iso[2],10), da=dm?parseInt(dm[1],10):parseInt(iso[3],10);
      var d = new Date(y, mo-1, da, parseInt(tm[1],10), parseInt(tm[2],10), 0, 0);
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
      if(e.type==='plain')return null;
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

    function parseClassicDate(raw){
      raw=String(raw||'').trim();
      var m=raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if(m) return {iso:m[1]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[3]).padStart(2,'0'), display:String(m[3]).padStart(2,'0')+'/'+String(m[2]).padStart(2,'0')+'/'+m[1]};
      m=raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
      if(m) return {iso:m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'), display:String(m[1]).padStart(2,'0')+'/'+String(m[2]).padStart(2,'0')+'/'+m[3]};
      return null;
    }

    function parseClassicTime(raw){
      raw=String(raw||'').trim();
      var m=raw.match(/^(\d{1,2}):(\d{2})$/);
      if(!m) m=raw.match(/^(\d{1,2})[\.](\d{2})$/);
      if(!m) m=raw.match(/^(\d{2})(\d{2})$/);
      if(!m) return null;
      var h=parseInt(m[1],10), min=parseInt(m[2],10);
      if(h<0||h>23||min<0||min>59) return null;
      return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0');
    }

    function parseClassicDateTime(raw){
      raw=String(raw||'').trim();
      // Formati supportati, tra cui CGMBet: "26/27 04/10/2026 1400"
      var m=raw.match(/(?:^|\s)(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{4})\s+(\d{1,2}:\d{2}|\d{1,2}\.\d{2}|\d{4})(?:\s|$)/);
      if(!m) return null;
      var d=parseClassicDate(m[1]), t=parseClassicTime(m[2]);
      return d&&t ? {date:d,time:t} : null;
    }

    function classicTypeFromFileName(fileName){
      var name=String(fileName||'').trim().replace(/\.csv$/i,'');
      // Il nome del file è il tipo di giocata. Rendo solo i separatori tecnici più leggibili.
      name=name.replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
      return name;
    }

    function parseClassicCsv(text, fileName){
      var rows=csvRows(text);
      if(rows.length<2) return [];
      var headers=rows[0].map(function(h){return String(h||'').replace(/^\uFEFF/,'').trim();});
      var norm=headers.map(normalizeHeader);
      function idx(){for(var a=0;a<arguments.length;a++){var f=norm.indexOf(arguments[a]);if(f>=0)return f;}return -1;}
      var iDate=idx('data','date');
      var iTime=idx('ora','orario','time');
      var iDateTime=idx('data/ora','data ora','dataorario','data e ora','datetime','date/time','date time');
      var iHome=idx('squadra casa','casa','home','team home');
      var iAway=idx('squadra ospite','squadra trasferta','ospite','trasferta','away','team away');
      var iLeague=idx('campionato','lega','league','competizione');
      var iOdds=idx('quota','quota ingresso','odds');
      var iId=idx('matchid','match id','id');
      var tipo=classicTypeFromFileName(fileName);
      var hasSeparateDateTime=iDate>=0&&iTime>=0;
      var hasCombinedDateTime=iDateTime>=0;
      if((!hasSeparateDateTime&&!hasCombinedDateTime)||iHome<0||iAway<0||!tipo) return [];
      var out=[];
      for(var r=1;r<rows.length;r++){
        var vals=rows[r];
        var d=null, t=null;
        if(hasSeparateDateTime){
          d=parseClassicDate(vals[iDate]);
          t=parseClassicTime(vals[iTime]);
        } else {
          var dt=parseClassicDateTime(vals[iDateTime]);
          if(dt){ d=dt.date; t=dt.time; }
        }
        var casa=String(vals[iHome]||'').trim(), trasferta=String(vals[iAway]||'').trim();
        if(!d||!t||!casa||!trasferta) continue;
        var quota=iOdds>=0?String(vals[iOdds]||'').trim().replace(',','.') :'';
        var original={}; headers.forEach(function(h,j){original[h]=vals[j]==null?'':String(vals[j]).trim();});
        original._easybet={type:'classic',tipoGiocataDaFile:tipo,fileName:fileName||''};
        out.push({
          data:d.display, dataIso:d.iso, ora:t,
          campionato:iLeague>=0?String(vals[iLeague]||'').trim():'',
          casa:casa, trasferta:trasferta, tipoGiocata:tipo, quotaIngresso:quota,
          importSource:fileName||'CSV classico', importMatchId:iId>=0?String(vals[iId]||'').trim():'', importData:original
        });
      }
      return out;
    }

    function parseImportCsv(text, fileName){
      if(currentAdminArea==='classic') return parseClassicCsv(text,fileName);
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
      var isO05=iOverHome>=0||iOverAway>=0||iHome1545>=0||iAway1545>=0;
      // Riconoscimento dal nome del file per i CSV senza statistiche (Banca X, Under 0.5 HT, Segno 1 / Favorito HT).
      var fn=String(fileName||'').toLowerCase().replace(/\.csv$/,'').replace(/[_\-.]+/g,' ').replace(/\s+/g,' ');
      var fileType='';
      if (/banca( la)? x|lay x/.test(fn)) fileType='layx';
      else if (/under ?0 ?5|under 05/.test(fn)) fileType='under05ht';
      else if (/segno 1|favorit/.test(fn)) fileType='favht';
      else if (/over ?1 ?5|o1 ?5|25 ?70/.test(fn)) fileType='o15';
      else if (/over ?0 ?5|o0 ?5/.test(fn)) fileType='o05';
      var kind=isO15?'o15':(fileType||(isO05?'o05':'o05'));
      var KINDS={
        o15:{strategy:'Over 1.5 FT',quota:'1.70',stats:true},
        o05:{strategy:IMPORT_STRATEGY,quota:IMPORT_QUOTA,stats:true},
        layx:{strategy:'Banca X HT',quota:'2.10',stats:false},
        under05ht:{strategy:'Under 0.5 HT',quota:'2.95',stats:false},
        favht:{strategy:'Favorito HT',quota:'1.85',stats:false}
      };
      var rowStrategy=KINDS[kind].strategy, rowQuota=KINDS[kind].quota;
      if (kind==='o15') isO15=true;
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
        original._easybet=!KINDS[kind].stats?{type:'plain'}:isO15?{
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
      var ruleBox=document.getElementById('importRule');
      if (!importPending.length){ importPreview.innerHTML = ''; if(ruleBox) ruleBox.innerHTML=currentAdminArea==='classic'?'<span>CSV classico</span><b>—</b><small>Colonne richieste: Data/Ora (oppure Data + Ora), Squadra Casa, Squadra Ospite. Il Tipo Giocata viene preso dal nome del file CSV. Facoltative: Campionato, Quota.</small>':'<span>Strategia</span><b>—</b><span>Ingresso consigliato</span><b>—</b><small>Scegli un file CSV: strategia e quota vengono impostate in base al tipo di file.</small>'; return; }
      var byStrat={};importPending.forEach(function(x){var k=String(x.tipoGiocata||'').toUpperCase()+(x.quotaIngresso?' · '+x.quotaIngresso:'');byStrat[k]=(byStrat[k]||0)+1});var stratKeys=Object.keys(byStrat);var first=importPending[0], isO15=String(first.tipoGiocata||'').toLowerCase().indexOf('1.5')!==-1;
      if(currentAdminArea==='classic'){
        if(ruleBox) ruleBox.innerHTML='<span>BETTING CLASSICO</span><b>'+importPending.length+' partite</b><span>Tipo giocata</span><b>' + esc(String(first.tipoGiocata||'').toUpperCase()) + '</b><span>Campi</span><b>Data/Ora · Casa · Ospite</b><small>Il tipo di giocata viene assegnato dal nome del CSV; se presente, ogni riga mantiene la propria quota.</small>';
      } else if (ruleBox && stratKeys.length>1) ruleBox.innerHTML='<span>Strategie</span><b>'+stratKeys.map(function(k){return esc(k)+' ('+byStrat[k]+')'}).join(' · ')+'</b><small>Più file insieme: ogni partita prende strategia e quota del proprio file.</small>'; else if (ruleBox) ruleBox.innerHTML='<span>Strategia</span><b>'+esc(String(first.tipoGiocata||'').toUpperCase())+'</b><span>Ingresso minimo</span><b>'+esc(first.quotaIngresso||'')+'</b><small>'+({'over 1.5 ft':'File EXCH O1.5 GOL 25-70: ingresso sullo 0-0 tra 20’ e 30’, uscita al primo gol o al 71’.','banca x ht':'File EXCH LAY X HT: all’intervallo sullo 0-0 o 1-1 banca X solo a quota ≤ 2,10 e tieni fino al 90’.','under 0.5 ht':'File EXCH UNDER 0.5 HT: pre-match solo a quota ≥ 2,95 in exchange (≥ 2,85 bookmaker).','favorito ht':'File EXCH FAVORITO HT: all’intervallo in parità punta 1 ≥ 1,75, favorito sotto banca 2 ≤ 2,50.'}[String(first.tipoGiocata||'').toLowerCase()]||'File O0.5 HT PRE+LIVE: ingresso live sullo 0-0 dal 15’. Le quote presenti nel CSV vengono ignorate.')+'</small>';
      function isDup(m){var st=toStartAt(m.data,m.ora);return matches.some(function(x){return Number(x.startAt)===Number(st)&&String(x.tipoGiocata||'').trim().toLowerCase()===String(m.tipoGiocata||'').trim().toLowerCase()&&String(x.casa||'').trim().toLowerCase()===String(m.casa||'').trim().toLowerCase()&&String(x.trasferta||'').trim().toLowerCase()===String(m.trasferta||'').trim().toLowerCase();});}
      var dupCount=importPending.filter(isDup).length;
      var html = '<div class="csv-import-summary"><b>'+importPending.length+' partite riconosciute</b>'+(currentAdminArea==='classic'?'<span>Betting classico</span>':(stratKeys.length>1?'<span>Strategie: '+stratKeys.map(function(k){return esc(k)+' ('+byStrat[k]+')'}).join(' · ')+'</span>':'<span>Strategia: '+esc(String(importPending[0].tipoGiocata||'').toUpperCase())+'</span><span>Quota ingresso: '+esc(importPending[0].quotaIngresso||'')+'</span>'))+(dupCount?'<span>'+dupCount+' già presenti: verranno saltate</span>':'')+'</div>';
      html += importPending.map(function(m, idx){
        return '<div class="preview-row">'+
          '<span class="pv-when">'+esc(m.data)+' '+esc(m.ora)+(isDup(m)?'<br><b style="color:#b5452f">GIÀ PRESENTE · verrà saltata</b>':'')+'</span>'+
          '<span><span class="pv-match">'+esc(m.casa)+' - '+esc(m.trasferta)+'</span><br><span class="pv-league">'+esc(m.campionato||'')+'</span></span>'+
          '<button type="button" class="pv-del" data-idx="'+idx+'">✕</button>'+
          (function(){var t=ebTrendFromImport(m.importData);if(!t)return '';return '<div class="preview-trend">'+t.main.concat(t.sub||[]).map(function(x){return '<span>'+esc(x[0])+' <b>'+pctLabel(x[1])+'</b></span>'}).join('')+'</div>';})()+
          '<div class="preview-fields fixed"><span>'+esc(String(m.tipoGiocata||'').toUpperCase())+'</span><b>'+(m.quotaIngresso?esc(m.quotaIngresso):'—')+'</b></div>'+
        '</div>';
      }).join('');
      html += '<div class="modal-actions" style="margin-top:10px;"><div style="flex:1"></div><button class="btn btn-primary" id="importConfirmBtn">Importa '+(importPending.length-dupCount)+' partite</button></div>';
      importPreview.innerHTML = html;
      Array.prototype.forEach.call(importPreview.querySelectorAll('.pv-del'), function(btn){
        btn.addEventListener('click', function(){ importPending.splice(+btn.getAttribute('data-idx'),1); renderImportPreview(); });
      });
      document.getElementById('importConfirmBtn').addEventListener('click', confirmImport);
    }

    function openCsvPicker(){
      var mt=document.getElementById('importModalTitle'), ih=document.getElementById('importHint'), rb=document.getElementById('importRule');
      if(currentAdminArea==='classic'){
        if(mt) mt.textContent='Importa CSV · Betting classico';
        if(ih) ih.innerHTML='Il <b>Tipo Giocata</b> viene preso automaticamente dal <b>nome del file CSV</b> (es. <b>OVER 2.5.csv</b> → OVER 2.5). Colonne obbligatorie: <b>Data/Ora</b> (oppure <b>Data</b> + <b>Ora</b>), <b>Squadra Casa</b>, <b>Squadra Ospite</b>. Facoltative: <b>Campionato</b> e <b>Quota</b>.';
        if(rb) rb.innerHTML='<span>CSV classico</span><b>pronto</b><small>Il nome del file diventa il Tipo Giocata per tutte le righe di quel CSV.</small>';
      }else{
        if(mt) mt.textContent='Importa CSV · Exchange Live';
        if(ih) ih.innerHTML='Formati Exchange riconosciuti automaticamente: <b>Over 0.5 HT</b>, <b>Over 1.5 25-70</b>, Banca X HT, Under 0.5 HT e Favorito HT.';
        if(rb) rb.innerHTML='<span>Strategia</span><b>—</b><span>Ingresso consigliato</span><b>—</b><small>Scegli un file CSV: strategia e quota vengono impostate in base al tipo di file.</small>';
      }
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
          return Number(x.startAt)===Number(startAt) && sameText(x.casa,m.casa) && sameText(x.trasferta,m.trasferta) && sameText(x.tipoGiocata,m.tipoGiocata);
        });
        if (duplicate){ skipped++; return; }
        chain = chain.then(function(){
          return fetch('/api/matches', {
            method: 'POST',
            headers: {'Content-Type':'application/json'},
            body: JSON.stringify({
              campionato:m.campionato || '', casa:m.casa, trasferta:m.trasferta,
              data:(currentAdminArea==='classic' && m.dataIso)?m.dataIso:m.data, ora:m.ora, startAt:startAt,
              tipoGiocata:m.tipoGiocata||(currentAdminArea==='classic'?'':IMPORT_STRATEGY), bettingArea: currentAdminArea || 'live', quotaIngresso:m.quotaIngresso||(currentAdminArea==='classic'?'':IMPORT_QUOTA),
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
      var files=Array.prototype.slice.call(importCsvFile.files||[]);
      if (!files.length) return;
      importErr.textContent='';
      importPreview.innerHTML='';
      importFileName.textContent=files.map(function(f){return f.name}).join(', ');
      Promise.all(files.map(function(file){
        return new Promise(function(resolve){
          var reader=new FileReader();
          reader.onload=function(){ resolve({name:file.name, rows:parseImportCsv(reader.result,file.name)}); };
          reader.onerror=function(){ resolve({name:file.name, rows:[], error:true}); };
          reader.readAsText(file,'UTF-8');
        });
      })).then(function(results){
        var all=[], bad=[];
        results.forEach(function(r){ if(!r.rows.length) bad.push(r.name); all=all.concat(r.rows); });
        // stessa partita + stessa strategia presente in due file: tienila una volta sola
        var seen={};
        all=all.filter(function(m){var k=[m.data,m.ora,String(m.casa).toLowerCase(),String(m.trasferta).toLowerCase(),String(m.tipoGiocata).toLowerCase()].join('|');if(seen[k])return false;seen[k]=1;return true;});
        importPending=all;
        importBackdrop.classList.add('open');
        if (bad.length) importErr.textContent=currentAdminArea==='classic'?'File non riconosciuti: '+bad.join(', ')+'. Nel Betting classico servono Data/Ora (oppure Data + Ora), Squadra Casa e Squadra Ospite; il Tipo Giocata viene preso dal nome del CSV.':'File non riconosciuti: '+bad.join(', ')+'. Servono almeno le colonne Campionato, Data/Ora, Squadra Casa e Squadra Ospite.';
        renderImportPreview();
      });
    });

    loadMatches();
    setInterval(function(){ loadMatches(true); }, 30000);
  }
})();
