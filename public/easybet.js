(function(){
  var themeToggle=document.getElementById('themeToggle');
  var savedTheme=localStorage.getItem('easybet-theme');
  var initialTheme=savedTheme==='light'||savedTheme==='dark'?savedTheme:'dark';
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme',theme);document.body.setAttribute('data-theme',theme);
    if(themeToggle){
      var light=theme==='light';
      themeToggle.textContent=light?'🌙':'☀️';
      themeToggle.setAttribute('aria-label',light?'Attiva modalità scura':'Attiva modalità chiara');
      themeToggle.title=light?'Modalità scura':'Modalità chiara';
    }
  }
  applyTheme(initialTheme);
  if(themeToggle){themeToggle.addEventListener('click',function(){var next=document.documentElement.getAttribute('data-theme')==='light'?'dark':'light';localStorage.setItem('easybet-theme',next);applyTheme(next)})}

  var mobileMenuBtn=document.getElementById('mobileMenuBtn');var mobileNav=document.getElementById('mobileNav');if(mobileMenuBtn&&mobileNav){mobileMenuBtn.addEventListener('click',function(){var isOpen=mobileNav.classList.toggle('open');mobileMenuBtn.setAttribute('aria-expanded',isOpen?'true':'false');mobileMenuBtn.textContent=isOpen?'✕':'☰'});mobileNav.addEventListener('click',function(e){var a=e.target.closest('a');if(a){mobileNav.classList.remove('open');mobileMenuBtn.setAttribute('aria-expanded','false');mobileMenuBtn.textContent='☰'}})}
  var ESITO_LABEL={entrata_vinta:'Entrati • Vinta',entrata_persa:'Entrati • Persa',non_entrata:'Non entrati'};var ESITO_ICON={entrata_vinta:'🏆',entrata_persa:'✖',non_entrata:'−'};
  var crestCache={},matches=[],currentFilter='tutte',currentView='home',performanceStats=null,performanceStatsLoading=false,statsPeriod='30d',statsSort={strategy:{key:'total',dir:'desc'},league:{key:'total',dir:'desc'}},statsDetailFilter=null;
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function escAttr(s){return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  var currentPronosticiStrategy=null;
  var liveSearchQuery='';
  function strategyKey(raw){
    var s=String(raw||'').trim().toUpperCase();
    if(/OVER\s*1[\.,]?5/.test(s)) return 'over15';
    if(/OVER\s*0[\.,]?5\s*HT/.test(s)||/OVER\s*0[\.,]?5\s*1T/.test(s)) return 'over05';
    if(/BANCA\s*(LA\s*)?X|LAY\s*X/.test(s)) return 'banca';
    if(/UNDER\s*0[\.,]?5/.test(s)) return 'under05';
    if(/FAVORITO/.test(s)) return 'favht';
    if(/SEGNA\s*LA\s*FAVORITA/.test(s)||/FAVORITA/.test(s)) return 'favorita';
    return s.toLowerCase().replace(/[^a-z0-9]+/g,'-')||'custom';
  }
  function strategyIcon(key){
    var map={
      over15:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 5.7l2.1 1.55-.8 2.55h-2.6l-.8-2.55L12 5.7zm-4.85 3.3l2.5.14.8 2.45-2.1 1.55-2.05-1.45.85-2.69zm9.7 0l2.65.67.85 2.02-2.05 1.45-2.1-1.55.8-2.45zm-6.75 5.05h3.8l1.18 3.52L12 19.65l-3.08-2.01 1.18-3.52zm5.02-.06l2.1 1.55-.78 2.41-2.46.17-.82-2.56 1.96-1.57zm-6.26 0l1.96 1.57-.82 2.56-2.46-.17-.78-2.41 2.1-1.55z" fill="currentColor" opacity=".94"/></svg>',
      over05:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M12 7.1v4.7l3 1.85" fill="none" stroke="currentColor" stroke-width="2.05" stroke-linecap="round" stroke-linejoin="round"/><path d="M7.2 4.9l1.3 1.3M16.8 4.9l-1.3 1.3" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M6.8 18.2h10.4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>',
      banca:'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.6" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.25" fill="currentColor" opacity=".92"/></svg>',
      favorita:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.2 17.8h11.6l-1-6.2-2.8 2.15-2-4.1-2 4.1-2.8-2.15-1 6.2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"/><path d="M8.3 19.2h7.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
      custom:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="3.2" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M8 8h8M8 12h8M8 16h5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'
    };
    if(key==='under05')return map.over05||map.custom;
    if(key==='favht')return map.favorita||map.custom;
    return map[key]||map.custom;
  }
  function strategyMeta(raw){
    var name=String(raw||'Da definire').trim().toUpperCase();
    var key=strategyKey(raw);
    var map={
      over15:{name:'OVER 1.5 FT',desc:'Almeno 2 gol nella partita.'},
      over05:{name:'OVER 0.5 HT',desc:'Almeno 1 gol nel primo tempo.'},
      banca:{name:'BANCA X HT',desc:'All’intervallo sullo 0-0 o 1-1, banca la X fino a quota 2,10.',quotaLabel:'Quota max'},
      under05:{name:'UNDER 0.5 HT',desc:'Nessun gol nel primo tempo, pre-match da quota 2,95.',quotaLabel:'Quota min'},
      favht:{name:'FAVORITO HT',desc:'Favorito in casa all’intervallo: in parità punta 1, sotto banca 2.',quotaLabel:'Quota min'},
      favorita:{name:'SEGNA LA FAVORITA',desc:'La favorita deve trovare il gol.'}
    };
    var base=map[key]||{name:name,desc:'Pronostici raggruppati per questa strategia.'};
    return {key:key,name:base.name,desc:base.desc,quotaLabel:base.quotaLabel||'Quota media',icon:strategyIcon(key)};
  }
  function summarizeByStrategy(list){
    var groups={};
    list.forEach(function(m){
      var meta=strategyMeta(m.tipoGiocata), key=meta.key;
      if(!groups[key]) groups[key]={meta:meta,matches:[]};
      groups[key].matches.push(m);
    });
    return Object.keys(groups).map(function(k){
      var g=groups[k];
      g.matches.sort(function(a,b){return Number(a.startAt)-Number(b.startAt)});
      var quotas=g.matches.map(function(m){return parseFloat(String(m.quotaIngresso).replace(',','.'))}).filter(function(n){return !isNaN(n)});
      g.next=g.matches[0]||null;
      g.count=g.matches.length;
      g.avgQuota=quotas.length?(quotas.reduce(function(a,b){return a+b},0)/quotas.length):null;
      return g;
    }).sort(function(a,b){return Number(a.next&&a.next.startAt||0)-Number(b.next&&b.next.startAt||0)});
  }
  function renderPronosticiSummary(list,grid){
    grid.classList.remove('pronostici-detail-mode');
    grid.style.display='block';grid.style.width='100%';
    grid.classList.add('pronostici-summary-mode');
    var groups=summarizeByStrategy(list);
    var html='<div class="pronostici-summary-grid">'+groups.map(function(g){
      var preview=g.matches.slice(0,3).map(function(m){return '<div class="pstrategy-row"><b>'+esc((m.casa||'')+' - '+(m.trasferta||''))+'</b><time>'+esc(fmtTime(m))+'</time></div>'}).join('');
      var more=g.count>3?'<div class="pstrategy-more">+'+(g.count-3)+' altre partite</div>':'';
      var nextTime=g.next?fmtTime(g.next):'—';
      var avg=g.avgQuota!=null?String((Math.round(g.avgQuota*100)/100).toFixed(2)).replace('.',','):'—';
      return '<article class="pstrategy-card"><div class="pstrategy-head"><div class="pstrategy-titlebox"><div class="pstrategy-icon">'+g.meta.icon+'</div><div><h3>'+esc(g.meta.name)+'</h3><p>'+esc(g.meta.desc)+'</p></div></div><span class="pstrategy-badge">'+g.count+' '+(g.count===1?'partita':'partite')+'</span></div><div class="pstrategy-list">'+preview+more+'</div><div class="pstrategy-foot"><div class="pstrategy-metric"><span>Prossima partita</span><strong>'+esc(nextTime)+'</strong></div><div class="pstrategy-metric"><span>'+esc(g.meta.quotaLabel)+'</span><strong>'+esc(avg)+'</strong></div></div><button class="pstrategy-btn js-open-strategy" data-strategy="'+escAttr(g.meta.key)+'">VEDI '+g.count+' '+(g.count===1?'PARTITA':'PARTITE')+' →</button></article>';
    }).join('')+'</div>';
    grid.innerHTML=html;
  }
  function renderPronosticiStrategyDetail(list,grid){
    grid.style.display='grid';grid.style.width='100%';
    var groups=summarizeByStrategy(list),group=groups.find(function(g){return g.meta.key===currentPronosticiStrategy});
    if(!group){currentPronosticiStrategy=null;renderPronosticiSummary(list,grid);return}
    grid.classList.remove('pronostici-summary-mode');
    grid.classList.add('pronostici-detail-mode');
    var top='<div class="pronostici-detail-top"><div class="left"><div class="pstrategy-icon">'+group.meta.icon+'</div><div><h3>'+esc(group.meta.name)+'</h3><p>'+esc(group.meta.desc)+'</p></div></div><div class="meta"><span class="meta-badge">'+group.count+' '+(group.count===1?'partita':'partite')+'</span><button class="pronostici-back js-back-pronostici">← Torna alle strategie</button></div></div>';
    grid.innerHTML=top+group.matches.map(renderMatchCard).join('');
  }
  function normTeamKey(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ')}
  var CREST_ALIASES={
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
  function crestQueries(name){var raw=String(name||'').trim();var key=normTeamKey(raw);var out=[raw].concat(CREST_ALIASES[key]||[]);var stripped=raw.replace(/\b(FC|AFC|CF|SC|SK|FK|AC|AS|SSC|SV|TSV|NK|JK|IFK|BK|IF)\b/gi,' ').replace(/\s+/g,' ').trim();if(stripped&&normTeamKey(stripped)!==key)out.push(stripped);if(raw&&!/\bFC\b/i.test(raw))out.push(raw+' FC');return out.filter(Boolean).filter(function(v,i,a){return a.indexOf(v)===i})}
  function initials(name){var p=String(name||'').trim().split(/\s+/);return (((p[0]||'')[0]||'?')+((p[1]||'')[0]||'')).toUpperCase()}
  function crestImg(name,campionato){var id='crest-'+Math.random().toString(36).slice(2);setTimeout(function(){loadCrest(name,campionato,id)},0);return '<span class="crest-wrap"><span class="crest placeholder" id="'+id+'">'+esc(initials(name))+'</span></span>'}
  function loadCrest(name,campionato,id){if(!String(name||'').trim())return;var key=normTeamKey(name)+'|'+normTeamKey(campionato||'');if(crestCache[key]!==undefined){applyCrest(id,crestCache[key]);return}var queries=crestQueries(name);(function tryNext(idx){if(idx>=queries.length){crestCache[key]=null;return}var q=queries[idx];var url='/api/team-crest?name='+encodeURIComponent(q)+(campionato?'&country='+encodeURIComponent(campionato):'');fetch(url).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&d.url){crestCache[key]=d.url;applyCrest(id,d.url)}else{tryNext(idx+1)}}).catch(function(){tryNext(idx+1)})})(0)}
  function applyCrest(id,url){var el=document.getElementById(id);if(!el||!url)return;var cls=el.className;var text=el.textContent;var img=document.createElement('img');img.className='crest';img.src=url;img.alt='';img.onerror=function(){var ph=document.createElement('span');ph.className=cls;ph.id=id;ph.textContent=text;img.replaceWith(ph)};el.replaceWith(img)}
  function dt(v){var d=new Date(Number(v));return isNaN(d.getTime())?null:d}
  function fmtDate(m){if(m.data)return m.data;var d=dt(m.startAt);return d?d.toLocaleDateString('it-IT'):'—'}
  function fmtTime(m){if(m.ora)return m.ora;var d=dt(m.startAt);return d?d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'—'}
  function dayKey(m){var d=dt(m.startAt);if(!d)return 'senza-data';return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function localDayKey(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function dateLabelFromKey(key){if(key==='senza-data')return 'Data non disponibile';var parts=key.split('-'),d=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));return d.toLocaleDateString('it-IT',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})}
  function shortDateLabelFromKey(key){if(key==='senza-data')return 'Data non disponibile';var parts=key.split('-'),d=new Date(Number(parts[0]),Number(parts[1])-1,Number(parts[2]));return d.toLocaleDateString('it-IT',{day:'numeric',month:'long',year:'numeric'})}
  function relativeDateLabel(key){var now=new Date(),today=localDayKey(now),yd=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1),yesterday=localDayKey(yd);if(key===today)return 'Oggi';if(key===yesterday)return 'Ieri';return dateLabelFromKey(key)}
  function isFinished(m){return !!String(m.esitoManuale||'').trim()}
  function isUpcoming(m){return !isFinished(m) && Number(m.startAt)>Date.now()}
  function isLive(m){return !isFinished(m) && Number(m.startAt)<=Date.now()}
  function matchesView(m){
    if(currentView==='pronostici') return isUpcoming(m);
    if(currentView==='live') return isLive(m);
    if(currentView==='statistiche'||currentView==='strategie'||currentView==='consigli'||currentView==='exchange'||currentView==='masaniello') return false;
    return isFinished(m);
  }
  function matchesOutcomeFilter(m){return (currentFilter==='tutte'||(m.esitoManuale||'')===currentFilter)&&(!currentStrategyFilter||strategyKey(m.tipoGiocata)===currentStrategyFilter)}
  var currentStrategyFilter='';
  function renderStrategyPills(){
    var host=document.getElementById('strategyPills');
    if(!host){var tb=document.getElementById('toolbar');if(!tb)return;host=document.createElement('div');host.id='strategyPills';host.className='pills strategy-pills';tb.appendChild(host);
      host.addEventListener('click',function(e){var b=e.target.closest('[data-s]');if(!b)return;currentStrategyFilter=b.getAttribute('data-s');render()});}
    if(currentView!=='home'){host.style.display='none';return}
    var seen={},keys=[];matches.filter(isFinished).forEach(function(m){var k=strategyKey(m.tipoGiocata);if(!seen[k]){seen[k]=strategyMeta(m.tipoGiocata);keys.push(k)}});
    if(currentStrategyFilter&&!seen[currentStrategyFilter])currentStrategyFilter='';
    if(keys.length<2){host.style.display='none';host.innerHTML='';return}
    host.style.display='';
    var html='<button type="button" class="pill'+(currentStrategyFilter?'':' active')+'" data-s="">Tutte le strategie</button>'+keys.map(function(k){return '<button type="button" class="pill'+(currentStrategyFilter===k?' active':'')+'" data-s="'+escAttr(k)+'">'+esc(seen[k].name)+'</button>'}).join('');
    if(host.innerHTML!==html)host.innerHTML=html;
  }
  function updateViewUI(){
    var title=document.getElementById('sectionTitle'),sub=document.getElementById('sectionSubtitle'),toolbar=document.getElementById('toolbar'),liveSearchBar=document.getElementById('liveSearchBar');
    document.body.classList.toggle('exchange-fullscreen',currentView==='exchange');
    document.body.classList.toggle('masaniello-fullscreen',currentView==='masaniello');
    if(liveSearchBar) liveSearchBar.style.display=currentView==='live'?'flex':'none';
    document.querySelectorAll('[data-view]').forEach(function(a){a.classList.toggle('active',a.getAttribute('data-view')===currentView)});
    if(currentView==='pronostici'){
      title.textContent='PRONOSTICI';
      sub.textContent='TUTTE LE PARTITE PROGRAMMATE PRIMA DEL CALCIO D’INIZIO';
      toolbar.style.display='none';
    }else if(currentView==='live'){
      title.textContent='LIVE';
      sub.textContent='PARTITE INIZIATE E ANCORA SENZA ESITO FINALE';
      toolbar.style.display='none';
    }else if(currentView==='statistiche'){
      title.textContent='STATISTICHE';
      sub.textContent='ANDAMENTO COMPLESSIVO DEI PRONOSTICI E PERCENTUALI DI ESITO';
      toolbar.style.display='none';
    }else if(currentView==='strategie'){
      title.textContent='STRATEGIE';
      sub.textContent='REGOLE OPERATIVE, SOGLIE LIVE E CRITERI DI SELEZIONE';
      toolbar.style.display='none';
    }else if(currentView==='consigli'){
      title.textContent='CONSIGLI';
      sub.textContent='LETTURA DEL LIVE, DISCIPLINA, BANKROLL E REGOLE PRATICHE';
      toolbar.style.display='none';
    }else if(currentView==='exchange'){
      title.textContent='DIARIO EXCHANGE';
      sub.textContent='CASSA, SESSIONI, OPERAZIONI, DISCIPLINA E PERFORMANCE';
      toolbar.style.display='none';
    }else if(currentView==='masaniello'){
      title.textContent='MASANIELLO';
      sub.textContent='GESTIONE CASSA, STAKE, CICLI, PIANO, SIMULAZIONI E STATISTICHE';
      toolbar.style.display='none';
    }else{
      title.textContent='PARTITE TERMINATE';
      sub.textContent='RISULTATI E ESITI DELLE PARTITE CONCLUSE';
      toolbar.style.display='flex';
    }
  }
  function pct(n,d){return d?Math.round((n/d)*1000)/10:0}
  function statsData(){
    var done=matches.filter(isFinished),w=0,l=0,s=0;
    done.forEach(function(m){if(m.esitoManuale==='entrata_vinta')w++;else if(m.esitoManuale==='entrata_persa')l++;else if(m.esitoManuale==='non_entrata')s++});
    var total=w+l+s,entered=w+l;
    return {done:done,total:total,w:w,l:l,s:s,winPct:pct(w,total),lossPct:pct(l,total),skipPct:pct(s,total),hitRate:pct(w,entered)};
  }
  function trendSeries(){
    var list=matches.filter(isFinished).slice().sort(function(a,b){return Number(a.startAt)-Number(b.startAt)}),w=0,l=0,out=[];
    list.forEach(function(m){if(m.esitoManuale==='entrata_vinta')w++;else if(m.esitoManuale==='entrata_persa')l++;else return;var d=dt(m.startAt);out.push({label:d?d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'}):'',v:pct(w,w+l)})});
    return out;
  }
  function renderTrend(series){
    if(!series.length)return '<div class="stats-empty">Non ci sono ancora ingressi conclusi sufficienti per mostrare l’andamento.</div>';
    var W=620,H=210,pad=18,min=0,max=100,pts=[];
    series.forEach(function(x,i){var px=series.length===1?W/2:pad+(W-pad*2)*(i/(series.length-1));var py=pad+(H-pad*2)*(1-(x.v-min)/(max-min));pts.push([px,py])});
    var line=pts.map(function(p,i){return (i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)}).join(' ');
    var area=line+' L '+pts[pts.length-1][0].toFixed(1)+' '+(H-pad)+' L '+pts[0][0].toFixed(1)+' '+(H-pad)+' Z';
    var circles=pts.map(function(p,i){
      var x=series[i]||{},tip=(x.label||'')+' • Win rate '+Number(x.v||0).toFixed(1).replace('.',',')+'%'+
        (x.entered!=null?' • '+x.entered+' ingressi':'')+
        (x.wins!=null?' • '+x.wins+' vinte':'')+
        (x.losses!=null?' • '+x.losses+' perse':'');
      return '<g class="trend-point-group" tabindex="0" data-trend-tip="'+escAttr(tip)+'">'+
        '<circle class="trend-point-hit" cx="'+p[0]+'" cy="'+p[1]+'" r="12"/>'+
        '<circle class="trend-point" cx="'+p[0]+'" cy="'+p[1]+'" r="4"/>'+
        '<title>'+esc(tip)+'</title></g>';
    }).join('');
    var labels=series.length>1?'<div class="trend-labels"><span>'+esc(series[0].label)+'</span><span>'+esc(series[Math.floor(series.length/2)].label)+'</span><span>'+esc(series[series.length-1].label)+'</span></div>':'';
    return '<div class="trend-wrap"><svg class="trend-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f3d271" stop-opacity=".28"/><stop offset="100%" stop-color="#f3d271" stop-opacity="0"/></linearGradient></defs><line class="trend-grid" x1="18" x2="602" y1="18" y2="18"/><line class="trend-grid" x1="18" x2="602" y1="105" y2="105"/><line class="trend-grid" x1="18" x2="602" y1="192" y2="192"/><path class="trend-area" d="'+area+'"/><path class="trend-line" d="'+line+'"/>'+circles+'</svg><div class="trend-tooltip" id="trendTooltip" role="tooltip"></div>'+labels+'</div>';
  }
  function performanceClass(v){v=Number(v)||0;return v>=70?'good':v>=55?'warn':'bad'}
  function fmtQuota(v){return v==null?'—':Number(v).toFixed(2).replace('.',',')}
  function statsOutcomeLabel(v){return v==='entrata_vinta'?'PRESA':v==='entrata_persa'?'PERDITA':v==='non_entrata'?'NON ENTRATA':'—'}
  function statsOutcomeClass(v){return v==='entrata_vinta'?'win':v==='entrata_persa'?'loss':v==='non_entrata'?'skip':''}
  function statsPeriodButtons(){
    var opts=[['7d','7 giorni'],['30d','30 giorni'],['season','Stagione'],['all','Tutto']];
    return '<div class="stats-toolbar"><div><h3>Statistiche performance</h3><p>Dati reali calcolati dagli esiti salvati. Filtra il periodo e confronta strategie e campionati.</p></div><div class="stats-period-filter">'+opts.map(function(o){return '<button type="button" class="stats-period-btn '+(statsPeriod===o[0]?'active':'')+'" data-stats-period="'+o[0]+'">'+o[1]+'</button>'}).join('')+'</div></div>';
  }
  function statsSortValue(r,key){var v=key==='label'?String(r.label||'').toLowerCase():Number(r[key]||0);return v}
  function sortedPerformanceRows(rows,type){
    var cfg=statsSort[type]||{key:'total',dir:'desc'},a=(Array.isArray(rows)?rows:[]).slice();
    a.sort(function(x,y){var xv=statsSortValue(x,cfg.key),yv=statsSortValue(y,cfg.key),n=(xv<yv?-1:xv>yv?1:0);return cfg.dir==='asc'?n:-n});
    return a;
  }
  function statsSortArrow(type,key){var c=statsSort[type]||{};return c.key===key?(c.dir==='asc'?' ↑':' ↓'):''}
  function performanceTable(title,sub,rows,type){
    rows=sortedPerformanceRows(rows,type);
    if(!rows.length)return '<div class="stats-tablebox"><div class="stats-table-head"><div><div class="chart-title">'+esc(title)+'</div><div class="chart-sub">'+esc(sub)+'</div></div></div><div class="stats-empty compact">Nessun dato disponibile nel periodo selezionato.</div></div>';
    var heads=[['label','Voce'],['total','Tot.'],['entered','Entrati'],['wins','V'],['losses','P'],['skipped','Non entr.'],['entryRate','Ingresso %'],['winRate','Win rate'],['avgQuota','Quota media']];
    return '<div class="stats-tablebox"><div class="stats-table-head"><div><div class="chart-title">'+esc(title)+'</div><div class="chart-sub">'+esc(sub)+'</div></div><span class="stats-click-hint">Clicca una riga per vedere le partite</span></div><div class="stats-tablewrap"><table class="stats-table"><thead><tr>'+heads.map(function(h){return '<th><button type="button" data-stats-sort="'+type+'" data-stats-key="'+h[0]+'">'+h[1]+statsSortArrow(type,h[0])+'</button></th>'}).join('')+'</tr></thead><tbody>'+rows.slice(0,40).map(function(r){return '<tr class="stats-drill-row" data-stats-drill="'+type+'" data-stats-label="'+escAttr(r.label)+'"><td title="'+escAttr(r.label)+'">'+esc(r.label)+'</td><td>'+Number(r.total||0)+'</td><td>'+Number(r.entered||0)+'</td><td>'+Number(r.wins||0)+'</td><td>'+Number(r.losses||0)+'</td><td>'+Number(r.skipped||0)+'</td><td>'+Number(r.entryRate||0)+'%</td><td class="'+performanceClass(r.winRate)+'">'+Number(r.winRate||0)+'%</td><td>'+fmtQuota(r.avgQuota)+'</td></tr>'}).join('')+'</tbody></table></div></div>';
  }
  var BACKTEST_TARGETS={over15:{t:78.9,n:'OVER 1.5 FT'},over05:{t:66.0,n:'OVER 0.5 HT'},banca:{t:57.0,n:'BANCA LA X HT'},under05:{t:36.8,n:'UNDER 0.5 HT'},favht:{t:57.3,n:'FAVORITO HT'}};
  function backtestCompareHtml(){
    var rows=(performanceStats&&performanceStats.byStrategy)||[],out=[];
    rows.forEach(function(r){var k=strategyKey(r.label),bt=BACKTEST_TARGETS[k];if(!bt)return;
      var ent=Number(r.entered)||((Number(r.wins)||0)+(Number(r.losses)||0)),wr=ent?(Number(r.wins)||0)/ent*100:null,diff=wr==null?null:wr-bt.t;
      var cls=wr==null?'grey':diff>=-1?'green':diff>-3?'yellow':'red';
      var lbl={green:'In linea',yellow:'Attenzione',red:'Sotto target',grey:'Nessun ingresso'}[cls];
      out.push('<tr><td><b>'+esc(bt.n)+'</b></td><td class="num">'+ent+'</td><td class="num">'+(wr==null?'—':wr.toFixed(1).replace('.',',')+'%')+'</td><td class="num">'+bt.t.toFixed(1).replace('.',',')+'%</td><td class="num">'+(diff==null?'—':(diff>0?'+':'')+diff.toFixed(1).replace('.',','))+'</td><td><span class="bt-light bt-'+cls+'"><i></i>'+lbl+(ent&&ent<30?' · campione piccolo':'')+'</span></td></tr>');
    });
    if(!out.length)return '';
    return '<div class="stats-tablebox backtest-box"><div class="stats-table-head"><div><div class="chart-title">Strategie vs backtest</div><div class="chart-sub">Win rate reale degli ingressi confrontato con il target del backtest. Verde: entro 1 punto · Giallo: entro 3 punti · Rosso: oltre 3 punti sotto.</div></div></div><div class="stats-tablewrap"><table class="stats-table"><thead><tr><th>Strategia</th><th>Ingressi</th><th>Win reale</th><th>Target</th><th>Scarto</th><th>Stato</th></tr></thead><tbody>'+out.join('')+'</tbody></table></div><div class="stats-note">Sotto i 30 ingressi lo scarto è poco significativo: valuta il semaforo solo con un campione più ampio.</div></div>';
  }
  function statsDetailHtml(){
    if(!statsDetailFilter||!performanceStats)return '';
    var d=Array.isArray(performanceStats.details)?performanceStats.details:[],type=statsDetailFilter.type,label=statsDetailFilter.label;
    d=d.filter(function(x){return type==='strategy'?String(x.strategy||'')===label:String(x.campionato||'Senza campionato')===label});
    return '<div class="stats-detail-panel"><div class="stats-detail-head"><div><small>'+(type==='strategy'?'STRATEGIA':'CAMPIONATO')+'</small><h3>'+esc(label)+'</h3><p>'+d.length+' partite nel periodo selezionato</p></div><button type="button" class="stats-detail-close" data-stats-detail-close>×</button></div><div class="stats-detail-list">'+(d.length?d.map(function(x){var dt=x.startAt?new Date(x.startAt):null;return '<div class="stats-detail-match"><div><b>'+esc((x.casa||'Casa')+' – '+(x.trasferta||'Ospite'))+'</b><span>'+esc(x.campionato||'Senza campionato')+' · '+(dt?dt.toLocaleDateString('it-IT'):'—')+'</span></div><div class="stats-detail-meta"><span class="stats-detail-outcome '+statsOutcomeClass(x.outcome)+'">'+statsOutcomeLabel(x.outcome)+'</span><strong>'+fmtQuota(x.quota)+'</strong></div></div>'}).join(''):'<div class="stats-empty compact">Nessuna partita.</div>')+'</div></div>';
  }
  function loadPerformanceStats(force){
    if(performanceStatsLoading)return;
    if(!force&&performanceStats&&performanceStats.selected&&performanceStats.selected.key===statsPeriod)return;
    performanceStatsLoading=true;
    fetch('/api/performance-stats?period='+encodeURIComponent(statsPeriod)+'&ts='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){performanceStats=d;performanceStatsLoading=false;if(currentView==='statistiche')renderStats()}).catch(function(e){console.warn('EasyBet performance stats:',e);performanceStatsLoading=false;if(currentView==='statistiche')renderStats()});
  }

  function scoreSampleLabel(v){return v==='robusto'?'campione robusto':v==='medio'?'campione medio':'campione piccolo'}
  function scoreValidationHtml(){
    var sv=performanceStats&&performanceStats.scoreValidation;
    if(!sv||!Array.isArray(sv.buckets))return '';
    var buckets=sv.buckets,has=buckets.some(function(x){return Number(x.total||0)>0});
    if(!has)return '<div class="score-validation-panel"><div class="score-validation-head"><div><small>VALIDAZIONE SCORE</small><h3>Score EasyBet vs risultati reali</h3><p>Servono segnali conclusi con score registrato per iniziare la calibrazione.</p></div></div><div class="stats-empty compact">Nessun campione disponibile nel periodo selezionato.</div></div>';
    var maxEntered=Math.max.apply(null,buckets.map(function(x){return Number(x.entered||0)}).concat([1]));
    return '<div class="score-validation-panel">'+
      '<div class="score-validation-head"><div><small>VALIDAZIONE SCORE 0–100</small><h3>Lo score più alto sta davvero performando meglio?</h3><p>Confronto sui primi segnali VERDI registrati e successivamente conclusi. Il win rate usa solo ingressi effettivi.</p></div><div class="score-validation-total"><b>'+Number(sv.totalEntered||0)+'</b><span>ingressi con score</span></div></div>'+
      '<div class="score-buckets">'+buckets.map(function(x){var wr=Number(x.winRate||0),entered=Number(x.entered||0),w=Number(x.wins||0),l=Number(x.losses||0),skip=Number(x.skipped||0),bar=Math.max(4,Math.round(entered/maxEntered*100));return '<button type="button" class="score-bucket '+performanceClass(wr)+'" data-score-bucket="'+escAttr(x.label)+'"><div class="score-bucket-top"><span>SCORE '+esc(x.label)+'</span><em>'+scoreSampleLabel(x.sample)+'</em></div><strong>'+wr+'%</strong><small>win rate · '+w+'V / '+l+'P</small><div class="score-bucket-bar"><i style="width:'+bar+'%"></i></div><div class="score-bucket-foot"><span>'+entered+' ingressi</span><span>'+skip+' non entrati</span></div></button>'}).join('')+'</div>'+
      '<div class="score-validation-note"><b>Come leggerlo:</b> lo Score EasyBet misura quanto bene il live soddisfa i criteri della strategia, non è una probabilità di vincita. Questa sezione serve a verificare sui tuoi dati se fasce di score più alte corrispondono davvero a risultati migliori. I campioni piccoli vanno interpretati con cautela.</div>'+
      scoreDetailHtml()+
    '</div>';
  }
  function scoreDetailHtml(){
    if(!scoreDetailFilter||!performanceStats||!performanceStats.scoreValidation)return '';
    var d=performanceStats.scoreValidation.details||[],bucket=scoreDetailFilter;
    d=d.filter(function(x){return String(x.bucket||'')===bucket});
    return '<div class="score-detail"><div class="score-detail-head"><div><small>FASCIA SCORE</small><h4>'+esc(bucket)+'</h4><p>'+d.length+' segnali conclusi nel periodo</p></div><button type="button" data-score-detail-close>×</button></div><div class="score-detail-list">'+(d.length?d.map(function(x){var dt=x.startAt?new Date(x.startAt):null;return '<div class="score-detail-row"><div><b>'+esc((x.casa||'Casa')+' – '+(x.trasferta||'Ospite'))+'</b><span>'+esc(x.strategy||'')+' · '+esc(x.campionato||'')+' · '+(dt?dt.toLocaleDateString('it-IT'):'—')+'</span></div><div><strong>'+Number(x.score||0)+'/100</strong><span class="stats-detail-outcome '+statsOutcomeClass(x.outcome)+'">'+statsOutcomeLabel(x.outcome)+'</span></div></div>'}).join(''):'<div class="stats-empty compact">Nessuna partita.</div>')+'</div></div>';
  }


  function minuteValidationHtml(){
    var mv=performanceStats&&performanceStats.minuteValidation;
    if(!mv||!Array.isArray(mv.buckets))return '';
    var buckets=mv.buckets,has=buckets.some(function(x){return Number(x.total||0)>0});
    if(!has)return '<div class="minute-validation-panel"><div class="minute-validation-head"><div><small>MINUTO DEL SEGNALE</small><h3>Quando entrano i segnali migliori?</h3><p>Servono snapshot conclusi con minuto registrato per iniziare l’analisi.</p></div></div><div class="stats-empty compact">Nessun campione disponibile nel periodo selezionato.</div></div>';
    var maxEntered=Math.max.apply(null,buckets.map(function(x){return Number(x.entered||0)}).concat([1]));
    return '<div class="minute-validation-panel">'+
      '<div class="minute-validation-head"><div><small>STORICO PER MINUTO DI INGRESSO</small><h3>Quale finestra sta performando meglio?</h3><p>Analisi del primo VERDE ufficiale della strategia pre-match, raggruppato per minuto.</p></div><div class="minute-validation-total"><b>'+Number(mv.totalEntered||0)+'</b><span>ingressi con minuto</span></div></div>'+
      '<div class="minute-buckets">'+buckets.map(function(x){var wr=Number(x.winRate||0),entered=Number(x.entered||0),w=Number(x.wins||0),l=Number(x.losses||0),skip=Number(x.skipped||0),bar=Math.max(4,Math.round(entered/maxEntered*100));return '<button type="button" class="minute-bucket '+performanceClass(wr)+'" data-minute-bucket="'+escAttr(x.label)+'"><div class="minute-bucket-top"><span>'+esc(x.label)+"'"+'</span><em>'+scoreSampleLabel(x.sample)+'</em></div><strong>'+wr+'%</strong><small>win rate · '+w+'V / '+l+'P</small><div class="minute-bucket-bar"><i style="width:'+bar+'%"></i></div><div class="minute-bucket-foot"><span>'+entered+' ingressi</span><span>'+skip+' non entrati</span></div></button>'}).join('')+'</div>'+
      '<div class="minute-validation-note"><b>Come leggerlo:</b> questa vista non cambia le finestre operative delle strategie. Serve a capire, sul tuo storico reale, se i segnali nati in certe fasce di minuto stanno rendendo meglio di altri. Il campione piccolo va interpretato con cautela.</div>'+
      minuteDetailHtml()+
    '</div>';
  }
  function minuteDetailHtml(){
    if(!minuteDetailFilter||!performanceStats||!performanceStats.minuteValidation)return '';
    var d=performanceStats.minuteValidation.details||[],bucket=minuteDetailFilter;
    d=d.filter(function(x){return String(x.bucket||'')===bucket});
    return '<div class="minute-detail"><div class="minute-detail-head"><div><small>FASCIA MINUTO</small><h4>'+esc(bucket)+"'"+'</h4><p>'+d.length+' segnali conclusi nel periodo</p></div><button type="button" data-minute-detail-close>×</button></div><div class="minute-detail-list">'+(d.length?d.map(function(x){var dt=x.startAt?new Date(x.startAt):null;return '<div class="minute-detail-row"><div><b>'+esc((x.casa||'Casa')+' – '+(x.trasferta||'Ospite'))+'</b><span>'+esc(x.strategy||'')+' · '+esc(x.campionato||'')+' · '+(dt?dt.toLocaleDateString('it-IT'):'—')+'</span></div><div><strong>'+Number(x.minute||0)+"'"+(x.score==null?'':' · '+Number(x.score)+'/100')+'</strong><span class="stats-detail-outcome '+statsOutcomeClass(x.outcome)+'">'+statsOutcomeLabel(x.outcome)+'</span></div></div>'}).join(''):'<div class="stats-empty compact">Nessuna partita.</div>')+'</div></div>';
  }

  function renderStats(){
    var dash=document.getElementById('statsDashboard'),grid=document.getElementById('grid');grid.classList.remove('home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');grid.classList.add('view-hidden');grid.style.display='none';dash.classList.add('show');
    if(!performanceStats||!performanceStats.selected||performanceStats.selected.key!==statsPeriod){dash.innerHTML=statsPeriodButtons()+'<div class="stats-loading">Caricamento statistiche…</div>';loadPerformanceStats(false);return}
    var p=performanceStats.selected.overall||{},total=Number(p.total||0),w=Number(p.wins||0),l=Number(p.losses||0),sk=Number(p.skipped||0),entered=Number(p.entered||0),winRate=Number(p.winRate||0),entryRate=Number(p.entryRate||0),skipRate=Number(p.skipRate||0);
    dash.style.setProperty('--winPct',(total?Math.round(w/total*1000)/10:0)+'%');dash.style.setProperty('--lossPct',(total?Math.round(l/total*1000)/10:0)+'%');
    var content=statsPeriodButtons()+'<div class="stats-period-caption"><span>Periodo selezionato</span><b>'+esc(performanceStats.selected.label||'')+'</b><em>Aggiornato automaticamente dal database</em></div>';
    if(!total){dash.innerHTML=content+'<div class="stats-empty">Nessun pronostico concluso nel periodo selezionato.</div>';return}
    content+='<div class="stat-box win"><div class="stat-label">Presa</div><div class="stat-value num">'+w+'</div><div class="stat-foot">'+(total?Math.round(w/total*1000)/10:0)+'% dei conclusi</div></div>'+ 
      '<div class="stat-box loss"><div class="stat-label">Perdita</div><div class="stat-value num">'+l+'</div><div class="stat-foot">'+(total?Math.round(l/total*1000)/10:0)+'% dei conclusi</div></div>'+ 
      '<div class="stat-box skip"><div class="stat-label">Non entrati</div><div class="stat-value num">'+sk+'</div><div class="stat-foot">'+skipRate+'% dei conclusi</div></div>'+ 
      '<div class="stat-box rate"><div class="stat-label">Win rate ingressi</div><div class="stat-value num">'+winRate+'%</div><div class="stat-foot">'+w+' vinte su '+entered+' ingressi · '+entryRate+'% ingresso</div></div>'+ 
      '<div class="chart-box"><div class="chart-title">Distribuzione esiti</div><div class="chart-sub">Presa, perdita e non entrati nel periodo selezionato.</div><div class="donut-wrap"><div class="donut"><div class="donut-center"><div><strong class="num">'+total+'</strong><span>conclusi</span></div></div></div><div class="chart-legend"><div class="chart-legend-row"><span><i class="dot g"></i>Presa</span><b class="num">'+(total?Math.round(w/total*1000)/10:0)+'%</b></div><div class="chart-legend-row"><span><i class="dot r"></i>Perdita</span><b class="num">'+(total?Math.round(l/total*1000)/10:0)+'%</b></div><div class="chart-legend-row"><span><i class="dot y"></i>Non entrati</span><b class="num">'+skipRate+'%</b></div></div></div></div>'+ 
      '<div class="chart-box"><div class="chart-title">Andamento win rate</div><div class="chart-sub">Evoluzione giornaliera cumulativa sugli ingressi del periodo.</div>'+renderTrend((performanceStats.daily||[]).map(function(x){return {label:x.label,v:Number(x.winRate||0),entered:Number(x.entered||0),wins:Number(x.wins||0),losses:Number(x.losses||0)}}))+'</div>'+ 
      scoreValidationHtml()+
      minuteValidationHtml()+
      backtestCompareHtml()+
      performanceTable('Rendimento per strategia','Ordina le colonne oppure apri una strategia per vedere le partite che compongono il dato.',performanceStats.byStrategy,'strategy')+
      performanceTable('Rendimento per campionato','Confronto per competizione nel periodo selezionato.',performanceStats.byLeague,'league')+
      '<div class="stats-note">Il win rate considera solo gli ingressi effettivi (vinte + perse). “Non entrati” resta separato, così puoi distinguere la qualità del segnale dalla frequenza con cui la strategia raggiunge le condizioni operative.</div>'+statsDetailHtml();
    dash.innerHTML=content;
  }
  function statsUiClick(e){
    var p=e.target.closest('[data-stats-period]');if(p){statsPeriod=p.getAttribute('data-stats-period')||'30d';statsDetailFilter=null;scoreDetailFilter=null;minuteDetailFilter=null;performanceStats=null;renderStats();return}
    var so=e.target.closest('[data-stats-sort]');if(so){var type=so.getAttribute('data-stats-sort'),key=so.getAttribute('data-stats-key'),cfg=statsSort[type]||{key:'total',dir:'desc'};statsSort[type]={key:key,dir:cfg.key===key&&cfg.dir==='desc'?'asc':'desc'};renderStats();return}
    var dr=e.target.closest('[data-stats-drill]');if(dr){statsDetailFilter={type:dr.getAttribute('data-stats-drill'),label:dr.getAttribute('data-stats-label')||''};renderStats();setTimeout(function(){var el=document.querySelector('.stats-detail-panel');if(el)el.scrollIntoView({behavior:'smooth',block:'start'})},20);return}
    if(e.target.closest('[data-stats-detail-close]')){statsDetailFilter=null;renderStats();return}
    var sb=e.target.closest('[data-score-bucket]');if(sb){scoreDetailFilter=sb.getAttribute('data-score-bucket')||null;renderStats();setTimeout(function(){var el=document.querySelector('.score-detail');if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},20);return}
    if(e.target.closest('[data-score-detail-close]')){scoreDetailFilter=null;renderStats();return}
    var mb=e.target.closest('[data-minute-bucket]');if(mb){minuteDetailFilter=mb.getAttribute('data-minute-bucket')||null;renderStats();setTimeout(function(){var el=document.querySelector('.minute-detail');if(el)el.scrollIntoView({behavior:'smooth',block:'center'})},20);return}
    if(e.target.closest('[data-minute-detail-close]')){minuteDetailFilter=null;renderStats()}
  }

  function showTrendTooltip(target,ev){
    var tip=document.getElementById('trendTooltip');if(!tip||!target)return;
    tip.textContent=target.getAttribute('data-trend-tip')||'';
    tip.classList.add('show');
    var wrap=tip.closest('.trend-wrap'),wr=wrap.getBoundingClientRect();
    var x=(ev&&ev.clientX!=null?ev.clientX:wr.left+wr.width/2)-wr.left;
    var y=(ev&&ev.clientY!=null?ev.clientY:wr.top+wr.height/2)-wr.top;
    tip.style.left=Math.max(12,Math.min(wr.width-12,x))+'px';
    tip.style.top=Math.max(28,Math.min(wr.height-6,y-12))+'px';
  }
  function hideTrendTooltip(){var tip=document.getElementById('trendTooltip');if(tip)tip.classList.remove('show')}
  document.addEventListener('pointerover',function(e){var t=e.target.closest&&e.target.closest('.trend-point-group');if(t)showTrendTooltip(t,e)});
  document.addEventListener('pointermove',function(e){var t=e.target.closest&&e.target.closest('.trend-point-group');if(t)showTrendTooltip(t,e)});
  document.addEventListener('pointerout',function(e){var t=e.target.closest&&e.target.closest('.trend-point-group');if(t&&!e.relatedTarget?.closest?.('.trend-point-group'))hideTrendTooltip()});
  document.addEventListener('focusin',function(e){var t=e.target.closest&&e.target.closest('.trend-point-group');if(t)showTrendTooltip(t)});
  document.addEventListener('focusout',function(e){var t=e.target.closest&&e.target.closest('.trend-point-group');if(t)hideTrendTooltip()});
  document.addEventListener('click',function(e){var t=e.target.closest&&e.target.closest('.trend-point-group');if(t){e.preventDefault();showTrendTooltip(t,e)}});

  document.addEventListener('click',statsUiClick);

  function renderStrategies(){
    var dash=document.getElementById('statsDashboard'),grid=document.getElementById('grid'),board=document.getElementById('strategiesBoard');
    dash.classList.remove('show');dash.innerHTML='';grid.classList.remove('home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');grid.classList.add('view-hidden');grid.style.display='none';board.classList.add('show');
    board.innerHTML=''+
      '<div class="strategies-intro"><b>Come leggere queste strategie:</b> le soglie non sono segnali automatici né garanzie di risultato. Servono come filtro operativo per decidere se una partita merita attenzione. Più il tempo passa, più i dati live devono essere forti e coerenti con il tipo di ingresso.</div>'+ 
      strategyCard({tag:'LIVE • 1° TEMPO',window:'15\'–30\'',title:'Over 0.5 HT live',intro:'Strategia pensata per cercare almeno un gol prima dell’intervallo. L’obiettivo non è inseguire una singola statistica, ma individuare una combinazione convincente di pressione, qualità delle occasioni e attività recente.',rule:'20\'–28\', 0-0, quota circa 1,70, xG ≥ 0,50, almeno 2 tiri in porta complessivi e pressione reale → candidato all’ingresso.',metrics:[['xG totale','≥ 0,45–0,60; meglio > 0,70'],['Tiri in porta','Almeno 2 complessivi'],['Tiri totali','6–8 o più'],['Grandi occasioni','Almeno 1, oppure più conclusioni in area'],['Tocchi in area','Circa 12–15+ complessivi'],['Quota operativa','Circa 1,65–1,80']],green:'xG ≥ 0,65, 2+ SOT, 1+ big chance e pressione recente forte: scenario interessante.',yellow:'xG 0,35–0,60, 1 SOT, poche conclusioni davvero pericolose: meglio attendere conferma.',red:'xG < 0,30, 0 SOT, appena 3–4 tiri totali e partita piatta: niente ingresso, anche se la quota è arrivata.',notes:['Il momentum deve essere recente: una fase intensa avvenuta dieci minuti prima vale poco se il match si è spento.','La stessa statistica ha valore diverso in base al minuto: xG 0,50 al 18\' è più interessante dello stesso 0,50 al 34\'.','Più ci si avvicina all’intervallo, più servono numeri forti e occasioni concrete, non semplice possesso.'],footer:'Obiettivo operativo: cercare un primo tempo ancora vivo, con produzione offensiva già visibile e una quota coerente con il rischio residuo.'})+
      strategyCard({tag:'LIVE • FULL TIME',window:'20\'–60\'',title:'Over 1.5 FT live',intro:'Strategia più elastica dell’Over 0.5 HT perché dispone di un orizzonte temporale più lungo. Si cerca una partita che stia producendo abbastanza da rendere plausibile almeno un altro gol entro il 90\'.',rule:'20’–45’ soglie normali; 46’–55’ xG ≥ 1,30 + 4 SOT + pressione reale; 56’–60’ solo scenario molto forte.',metrics:[['xG totale','≥ 0,70–1,00'],['Tiri in porta','Almeno 3 complessivi'],['Tiri totali','8–10 o più'],['Grandi occasioni','1–2'],['Tocchi in area','Idealmente 15–20+ complessivi'],['Quota operativa','Riferimento circa 1,66 o superiore']],green:'xG ≥ 1,00, 3+ SOT, almeno 1 big chance e partita aperta: buon candidato O1.5 FT.',yellow:'xG 0,55–0,90, 1–2 SOT, match vivo solo a tratti: meglio aspettare.',red:'xG < 0,50, 0–1 SOT, poche conclusioni in area e ritmo basso: no bet anche con quota invitante.',notes:['Può avere senso entrare più tardi se la quota cresce, purché il live mostri un aumento reale della pressione.','Sul 0-0 a fine primo tempo la partita va rivalutata da zero: non basta che la quota sia alta.','Punteggi come 1-0 o 0-1 restano interessanti se chi deve inseguire continua a produrre e il match non si è chiuso tatticamente.'],footer:'Obiettivo operativo: privilegiare partite che continuano a creare volume e occasioni, evitando di farsi attirare da una quota alta in un match spento.'})+
      strategyCard({tag:'LAY • INTERVALLO',window:'HT',title:'Banca la X all’intervallo',intro:'Qui non basta una partita “viva”: serve soprattutto un pareggio instabile. La lettura deve suggerire che lo 0-0 o l’1-1 non rappresentano bene quanto visto in campo e che una delle due squadre, o entrambe, possano rompere l’equilibrio.',rule:'HT 0-0 o 1-1 + xG ≥ 1,30 + 3 SOT + almeno 2 big chance + quota Lay circa 1,90–2,20 → candidato serio.',metrics:[['Punteggio','0-0 oppure 1-1 all’HT'],['xG totale','≥ 1,20–1,50; meglio > 1,70'],['Tiri in porta','3–4 o più'],['Grandi occasioni','Almeno 2'],['Squilibrio','Una squadra superiore o entrambe molto offensive'],['Quota Lay X','Indicativamente 1,90–2,20']],green:'xG ≥ 1,50, 4+ SOT, 2+ big chance e ritmo alto: pareggio potenzialmente instabile.',yellow:'xG 0,90–1,40, 2–3 SOT, occasioni presenti ma match equilibrato: attendere.',red:'xG < 0,80, 0–1 SOT, poche occasioni e squadre apparentemente comode sul pari: niente Lay X.',notes:['Conta più la combinazione xG + big chances + tiri in porta + squilibrio che il possesso palla.','Un 1-1 con xG 1,80 e 5 SOT è qualitativamente molto diverso da un 1-1 con xG 0,60.','Se la quota Lay è molto più alta della fascia testata, il rischio finanziario cresce e il rapporto rischio/rendimento va rivalutato.'],footer:'Obiettivo operativo: individuare pareggi fragili, non semplicemente partite con tanti attacchi. Il dato chiave è quanto il risultato di parità sembri “sotto pressione”.'})+
      strategyCard({tag:'LIVE • FAVORITA',window:'18\'–30\'',title:'Segna la favorita',intro:'Strategia selettiva: non basta che il match sia aperto. Deve essere la favorita a creare il grosso della pericolosità, mantenendo il punteggio in equilibrio ma mostrando un dominio offensivo reale e recente.',rule:'20\'–25\', pari, quota circa 1,90, favorita con xG ≥ 0,50, almeno 2 SOT, 1 big chance e dominio netto → candidato serio.',metrics:[['Situazione','Favorita ancora sul pari, idealmente 0-0'],['Quota live','Circa 1,80–2,05; riferimento ~1,90'],['xG favorita','≥ 0,45–0,60'],['Tiri in porta','Almeno 2 della favorita'],['Tiri totali','5–7 della favorita'],['Tocchi in area','Circa 8–12+ della favorita']],green:'xG favorita ≥ 0,60, 2+ SOT, 1+ big chance e dominio territoriale concreto: buon ingresso.',yellow:'xG 0,30–0,55, 1 SOT, possesso alto ma poche occasioni pulite: aspettare.',red:'xG < 0,30, 0 SOT, tanti passaggi ma nessuna vera occasione: niente ingresso anche con quota in zona.',notes:['Il confronto con l’avversaria è decisivo: 0,65–0,08 di xG è molto più forte di 0,65–0,55.','Il momentum recente deve essere chiaramente dalla parte della favorita.','Se la favorita segna, l’evento cercato dalla strategia si è verificato: l’uscita immediata/green può essere trattata come regola separata e confrontata nel tempo con la tenuta fino al 90\'.'],footer:'Obiettivo operativo: entrare solo quando la favorita non sta semplicemente “tenendo palla”, ma sta creando occasioni migliori, più frequenti e territorialmente più profonde dell’avversaria.'});
  }
  function strategyCard(o){
    var metrics=o.metrics.map(function(m){return '<div class="metric-chip"><span>'+esc(m[0])+'</span><b>'+esc(m[1])+'</b></div>'}).join('');
    var notes=o.notes.map(function(n){return '<li>'+esc(n)+'</li>'}).join('');
    return '<article class="strategy-card"><div class="strategy-top"><span class="strategy-badge">'+esc(o.tag)+'</span><span class="strategy-window">'+esc(o.window)+'</span></div><h3>'+esc(o.title)+'</h3><p class="strategy-intro">'+esc(o.intro)+'</p><div class="strategy-rule"><small>Regola operativa</small><strong>'+esc(o.rule)+'</strong></div><div class="strategy-metrics">'+metrics+'</div><div class="traffic-grid"><div class="traffic-row green"><div class="traffic-label">Verde</div><div class="traffic-copy">'+esc(o.green)+'</div></div><div class="traffic-row yellow"><div class="traffic-label">Giallo</div><div class="traffic-copy">'+esc(o.yellow)+'</div></div><div class="traffic-row red"><div class="traffic-label">Rosso</div><div class="traffic-copy">'+esc(o.red)+'</div></div></div><div class="strategy-notes"><h4>Come interpretarla</h4><ul>'+notes+'</ul></div><div class="strategy-footer">'+esc(o.footer)+'</div></article>';
  }


  function renderAdvice(){
    var dash=document.getElementById('statsDashboard'),grid=document.getElementById('grid'),board=document.getElementById('strategiesBoard'),advice=document.getElementById('adviceBoard');
    dash.classList.remove('show');dash.innerHTML='';board.classList.remove('show');board.innerHTML='';grid.classList.remove('home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');grid.classList.add('view-hidden');grid.style.display='none';advice.classList.add('show');
    advice.innerHTML=
      '<div class="advice-hero"><div><h3>Leggere il live prima di entrare</h3><p>Questa sezione raccoglie principi pratici per usare le strategie EasyBet con più disciplina. L’obiettivo non è trovare una singola statistica “magica”, ma riconoscere quando quota, ritmo e dati raccontano la stessa partita.</p></div><div class="advice-score"><span>DATI + CONTESTO</span><span>DISCIPLINA</span><span>NESSUN INGRESSO FORZATO</span></div></div>'+
      adviceCard('💰','Gestione bankroll','Il capitale va trattato come una risorsa finita. Una sequenza negativa non deve cambiare improvvisamente la dimensione delle giocate.',['Usa una quota di capitale coerente e ripetibile per ingresso.','Evita di aumentare lo stake per recuperare una perdita.','Valuta i risultati su una serie di ingressi, non sul singolo match.'],'gold')+
      adviceCard('⛔','Quando non entrare','La quota giusta, da sola, non è una ragione sufficiente per entrare. Se il live non conferma la strategia, l’ingresso va saltato.',['Partita piatta o ritmo calato negli ultimi minuti.','Possesso sterile senza tiri in porta o occasioni pulite.','Statistiche minime raggiunte solo grazie a una fase vecchia del match.'],'red')+
      adviceCard('📊','Come leggere il live','xG, tiri, big chances e tocchi in area vanno letti insieme. Una singola metrica può essere fuorviante.',['xG: qualità complessiva delle occasioni create.','SOT: quante conclusioni hanno realmente impegnato la porta.','Big chances e tocchi in area: profondità e qualità della pressione.'],'green')+
      adviceCard('🧠','Disciplina d’ingresso','Meglio perdere un’opportunità che forzare un’operazione debole. Se manca una condizione chiave, il mercato può essere semplicemente lasciato andare.',['Non trasformare un “quasi verde” in un verde per desiderio di entrare.','Più passa il tempo, più le statistiche devono essere forti.','La quota deve compensare il rischio, non nasconderlo.'],'gold')+
      adviceCard('⚽','Come leggere uno 0-0','Non tutti gli 0-0 sono uguali. Alcuni sono ricchi di occasioni e instabili, altri mostrano squadre incapaci di produrre pericolo.',['0-0 vivo: xG in crescita, SOT, big chances e area occupata.','0-0 morto: possesso orizzontale, pochi tiri, ritmo basso.',"Il minuto conta: gli stessi dati hanno peso diverso al 18' e al 38'."],'')+
      adviceCard('⚖️','Come leggere un 1-1','È particolarmente utile per il Banca X: bisogna capire se il pari è naturale oppure fragile rispetto a quanto visto.',['Controlla lo squilibrio tra le due squadre.','Un xG totale alto con occasioni pulite rende il pari più instabile.','Se entrambe sembrano accontentarsi, il Lay X perde qualità.'],'')+
      adviceCard('⭐','Valutare la favorita','Nel mercato “segna la favorita” conta il confronto con l’avversaria, non solo il volume assoluto.',['xG favorita nettamente superiore all’avversaria.','SOT, big chances e tocchi in area concentrati sulla favorita.','Momentum recente realmente dalla sua parte, non semplice possesso.'],'wide')+
      adviceCard('📈','Quota e qualità del match','Una quota più alta può migliorare il rapporto rischio/rendimento, ma non trasforma un match debole in un buon ingresso.',['Prima viene la qualità del live, poi la quota.','Una quota bassa non giustifica statistiche incomplete.','Una quota alta richiede comunque un motivo concreto per aspettarsi l’evento.'],'wide')+
      '<div class="five-rules"><h3>5 regole EasyBet</h3><div class="rules-grid"><div class="rule-item"><b>01</b><span>Non entrare solo perché la quota è arrivata.</span></div><div class="rule-item"><b>02</b><span>Le statistiche devono raccontare tutte la stessa partita.</span></div><div class="rule-item"><b>03</b><span>Più passa il tempo, più serve qualità nei dati.</span></div><div class="rule-item"><b>04</b><span>Meglio saltare un ingresso che forzarne uno.</span></div><div class="rule-item"><b>05</b><span>Valuta una strategia sul lungo periodo, non sul singolo risultato.</span></div></div></div>'+
      '<div class="semaforo"><div class="signal green"><strong>● Verde — condizioni coerenti</strong><p>Più indicatori importanti concordano: produzione offensiva, pressione recente, quota e situazione di punteggio.</p></div><div class="signal yellow"><strong>● Giallo — manca conferma</strong><p>La partita ha segnali interessanti, ma uno o più dati decisivi sono ancora deboli. Aspettare può migliorare la decisione.</p></div><div class="signal red"><strong>● Rosso — niente ingresso</strong><p>Ritmo basso, numeri insufficienti o contesto sfavorevole. La quota non deve diventare una scusa per entrare.</p></div></div>'+
      '<div class="responsible"><b>Nota:</b> questi contenuti descrivono un metodo di lettura e registrazione delle strategie, non garantiscono risultati. Usa un budget dedicato, limiti definiti e non inseguire le perdite.</div>';
  }
  function adviceCard(icon,title,copy,items,extra){
    return '<article class="advice-card '+(extra||'')+'"><div class="advice-icon">'+icon+'</div><h3>'+esc(title)+'</h3><p>'+esc(copy)+'</p><ul>'+items.map(function(x){return '<li>'+esc(x)+'</li>'}).join('')+'</ul></article>';
  }

  function lifecycleTime(ts){if(!ts)return '';var d=new Date(Number(ts));return isNaN(d.getTime())?'':d.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}
  function lifecycleInfo(m){
    var now=Date.now(),started=Number(m.startAt||0)>0&&now>=Number(m.startAt),pre=true,live=!!m.liveStartedAt||started,signal=!!m.signalFirstAt||m.liveAlertSent||String(m.liveLastLevel||'').toLowerCase()==='verde',outcome=!!String(m.esitoManuale||'').trim();
    var current=outcome?'outcome':signal?'signal':live?'live':'prematch';
    return {prematch:pre,live:live,signal:signal,outcome:outcome,current:current};
  }
  function lifecycleStrip(m){
    var x=lifecycleInfo(m),score=m.signalFirstScore!=null?(' '+m.signalFirstScore+'/100'):'',steps=[
      ['prematch','PRE-MATCH',m.createdAt?lifecycleTime(m.createdAt):'pronta'],
      ['live','LIVE',m.liveStartedAt?lifecycleTime(m.liveStartedAt):(x.live?'attiva':'—')],
      ['signal','SEGNALE',m.signalFirstAt?lifecycleTime(m.signalFirstAt)+score:(x.signal?'registrato':'—')],
      ['outcome','ESITO',m.outcomeSetAt?lifecycleTime(m.outcomeSetAt):(x.outcome?'registrato':'—')]
    ];
    return '<div class="lifecycle-strip" aria-label="Percorso partita">'+steps.map(function(s){var done=!!x[s[0]],cur=x.current===s[0];return '<div class="lifecycle-step '+s[0]+(done?' done':'')+(cur?' current':'')+'"><b>'+s[1]+'</b><small>'+esc(s[2])+'</small></div>'}).join('')+'</div>';
  }
  function laTgToast(t,b){try{laToast(t,b)}catch(e){}}
  function laTgStatusToast(st){var map={sent:['📨 Inviato su Telegram','Il segnale è stato mandato al bot.'],already:['Telegram già inviato','Per questa partita il messaggio era già partito (uno solo per partita).'],bot_off:['Telegram NON inviato','La partita ha «su Telegram» disattivato nell’admin.'],not_configured:['Telegram NON inviato','Il bot non è configurato sul server (TELEGRAM_BOT_TOKEN).'],no_subscribers:['Telegram: nessun iscritto','Il bot non ha iscritti: scrivi /start al bot.'],error:['Telegram: errore','Invio non riuscito, riprova o controlla i log di Render.']};var x=map[st];if(x)laTgToast(x[0],x[1])}
  function markLifecycle(m,event,extra){if(!m||!m.id)return Promise.resolve(null);var body=Object.assign({event:event},extra||{});return fetch('/api/matches/'+encodeURIComponent(m.id)+'/lifecycle',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(body)}).then(function(r){if(!r.ok){if(event==='signal'&&(r.status===401||r.status===403))laTgToast('Telegram NON inviato','Per inviare i segnali su Telegram devi aver fatto l’accesso admin (PIN) su questo browser.');return null}return r.json()}).then(function(u){if(u&&event==='signal'&&u.telegramStatus)laTgStatusToast(u.telegramStatus);return u}).then(function(updated){if(!updated)return null;var idx=matches.findIndex(function(x){return String(x.id)===String(updated.id)});if(idx>=0)matches[idx]=Object.assign({},matches[idx],updated);render();return updated}).catch(function(){return null})}
  function laSignalSnapshotPayload(parsed,minute,score){function pair(v){return Array.isArray(v)?[v[0]==null?null:Number(v[0]),v[1]==null?null:Number(v[1])]:[null,null]}return{minute:Number.isFinite(Number(minute))?Number(minute):null,score:String(score||''),xg:pair(parsed.xg),sot:pair(parsed.sot),shots:pair(parsed.shots),chances:pair(parsed.big),boxshots:pair(parsed.boxshots),touches:pair(parsed.touches)}}
  function wasMarketExcluded(m){var lv=String(m.liveLastLevel||'').toLowerCase(),sum=laNorm(String(m.liveLastSummary||''));return lv.indexOf('ingiocabile')!==-1||sum.indexOf('mercato escluso')!==-1||sum.indexOf('gol segnato prima della finestra')!==-1}
  function finishedSignalSummary(m){
    var hasSignal=!!m.signalFirstAt;
    if(!hasSignal&&wasMarketExcluded(m))return '<div class="finished-signal-note market-excluded"><span>!</span><div><b>Mercato escluso prima dell’ingresso</b><small>Il gol è arrivato prima della finestra operativa della strategia pre-match.</small></div></div>';
    if(!hasSignal)return '<div class="finished-signal-note no-signal"><span>○</span><div><b>Nessun segnale registrato</b><small>La strategia pre-match non ha prodotto un VERDE ufficiale.</small></div></div>';
    var sc=m.signalFirstScore!=null?Math.round(Number(m.signalFirstScore))+'/100':'VERDE';
    return '<div class="finished-signal-note has-signal"><span>●</span><div><b>Segnale registrato · '+esc(sc)+'</b><small>Primo VERDE della strategia pre-match memorizzato.</small></div></div>';
  }
  function finishedOutcomeLabel(m,e){
    if(e==='non_entrata'&&wasMarketExcluded(m))return 'NON ENTRATA · GOL PRE-FINESTRA';
    if(e==='non_entrata')return m.signalFirstAt?'NON ENTRATA · SEGNALE AVUTO':'NON ENTRATA · NESSUN SEGNALE';
    return ESITO_LABEL[e]||'In attesa';
  }
  function csvPctLabel(v){var n=Number(v);if(!isFinite(n))return '—';var r=Math.round(n*10)/10;return String(r).replace('.',',')+'%'}
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
  
  function csvTrendHtml(m){return ebTrendHtml(ebTrendFromImport(m&&m.importData),'public')}
  function renderMatchCard(m){
      var e=m.esitoManuale||'',status=e?e:'attesa',camp=esc(m.campionato||'Campionato'),q=esc(m.quotaIngresso||'—'),str=esc(m.tipoGiocata||'Da definire');
      var icon,label,isFinishedCard=currentView==='home';
      if(e){icon=ESITO_ICON[e];label=isFinishedCard?finishedOutcomeLabel(m,e):ESITO_LABEL[e]}
      else if(currentView==='live'){icon='●';label='Live'}
      else{icon='⏱';label='Da iniziare'}
      var analyzerBtn=currentView==='live'?'<button type="button" class="live-analyze-btn js-live-analyze" data-match-key="'+esc(liveAnalyzerMatchKey(m))+'">⚡ ANALIZZA LIVE</button>':'';
      var snapshotBtn=(m.signalFirstAt&&m.id)?'<button type="button" class="finished-snapshot-btn js-signal-snapshot" data-match-id="'+escAttr(m.id)+'">◎ PERCHÉ VERDE?</button>':'<div class="finished-snapshot-placeholder">NESSUNO SNAPSHOT</div>';
      var finishedExtra=isFinishedCard?finishedSignalSummary(m)+'<div class="finished-action-row">'+snapshotBtn+'</div>':'';
      return '<article class="card'+(isFinishedCard?' finished-card':'')+(currentView==='live'&&m.liveExcludedAt?' is-excluded':'')+(m.signalFirstAt?' has-signal':' no-signal')+(e?' esito-'+e:'')+'"><div class="card-head"><div class="league"><small>Campionato</small>'+camp+'</div><div class="time"><small>Ora</small><strong class="num">'+esc(fmtTime(m))+'</strong></div></div><div class="date num">'+esc(fmtDate(m))+(currentView==='live'?'<span class="live-icons">'+liveBellHtml(m)+liveExcludedHtml(m)+'</span>':'')+'</div><div class="matchup"><div class="team"><div class="role">Casa</div>'+crestImg(m.casa,m.campionato)+'<div class="team-name">'+esc(m.casa||'Squadra casa')+'</div></div><div class="vs">VS</div><div class="team"><div class="role">Trasferta</div>'+crestImg(m.trasferta,m.campionato)+'<div class="team-name">'+esc(m.trasferta||'Squadra trasferta')+'</div></div></div><div class="info-grid"><div class="info"><label>Quota ingresso</label><strong class="num">'+q+'</strong></div><div class="info strategy"><label>Strategia</label><strong>'+str+'</strong></div></div>'+csvTrendHtml(m)+lifecycleStrip(m)+finishedExtra+'<div class="status '+status+'"><span class="status-icon">'+icon+'</span><span class="status-copy"><small>'+ (e?(m.esitoAuto?'Esito · auto':'Esito'):'Stato') +'</small><strong>'+esc(label)+'</strong></span></div>'+analyzerBtn+'</article>'
    }
  function archiveCounts(items){var c={w:0,l:0,n:0,o:0};items.forEach(function(m){var e=m.esitoManuale||'';if(e==='entrata_vinta')c.w++;else if(e==='entrata_persa')c.l++;else if(e==='non_entrata')c.n++;else c.o++});return c}
  function archiveTone(items){var c=archiveCounts(items);if(!(c.w+c.l))return 'tone-none';var r=c.w/(c.w+c.l);return r>=0.6?'tone-good':r>=0.45?'tone-mid':'tone-bad'}
  function archiveCal(k){if(!/^\d{4}-\d{2}-\d{2}$/.test(k))return '<span class="arch-cal"><b>?</b></span>';var p=k.split('-'),d=new Date(+p[0],+p[1]-1,+p[2]);var wd=d.toLocaleDateString('it-IT',{weekday:'short'}).replace('.','').slice(0,3),mo=d.toLocaleDateString('it-IT',{month:'short'}).replace('.','').slice(0,3);return '<span class="arch-cal" aria-hidden="true"><small>'+esc(wd)+'</small><b>'+d.getDate()+'</b><em>'+esc(mo)+'</em></span>'}
  function archiveBar(items){var c=archiveCounts(items),t=items.length||1;function seg(cls,n){return n?'<i class="'+cls+'" style="flex:'+n+'"></i>':''}return '<span class="arch-bar" aria-hidden="true">'+seg('w',c.w)+seg('l',c.l)+seg('n',c.n)+seg('o',c.o)+'</span>'}
  function daySummaryHtml(items){
    var w=0,l=0,n=0;items.forEach(function(m){var e=m.esitoManuale||'';if(e==='entrata_vinta')w++;else if(e==='entrata_persa')l++;else if(e==='non_entrata')n++});
    if(!(w+l+n))return '';
    return '<span class="day-summary"><b class="w">'+w+' V</b><b class="l">'+l+' P</b><b class="n">'+n+' NE</b>'+(w+l?'<b class="r">'+Math.round(w/(w+l)*100)+'%</b>':'')+'</span>';
  }

  // ---------- Campanella segnale nella card Live ----------
  function liveBellState(m){
    var key=liveAnalyzerMatchKey(m),st=(typeof liveAnalyzerState!=='undefined'&&liveAnalyzerState&&liveAnalyzerState[key])||{},local=st.alerted&&Object.keys(st.alerted).length;
    var lvl=String(m.liveLastLevel||'').toLowerCase();
    if(local||lvl==='verde'||lvl==='green')return 'green';
    if(m.signalFirstAt)return 'was';
    return 'idle';
  }
  function liveExcludedHtml(m){var on=!!m.liveExcludedAt,t=on?'Partita esclusa: '+(m.liveExcludedReason||''):'Partita ancora valida per la strategia';return '<button type="button" class="live-excl'+(on?' on':'')+' js-live-bell" data-match-key="'+escAttr(liveAnalyzerMatchKey(m))+'" title="'+escAttr(t)+'" aria-label="'+escAttr(t)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M7 12h10" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg></button>'}
  function liveBellHtml(m){var s=liveBellState(m),t=s==='green'?'Segnale VERDE: clicca per la giocata':s==='was'?'Segnale verde registrato: clicca per i dettagli':'Nessun segnale ancora: clicca per la regola';return '<button type="button" class="live-bell bell-'+s+' js-live-bell" data-match-key="'+escAttr(liveAnalyzerMatchKey(m))+'" title="'+escAttr(t)+'" aria-label="'+escAttr(t)+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a6 6 0 0 0-6 6v3.6l-1.6 3A1 1 0 0 0 5.3 17h13.4a1 1 0 0 0 .9-1.4l-1.6-3V9a6 6 0 0 0-6-6z" fill="currentColor"/><path d="M9.5 18.5a2.5 2.5 0 0 0 5 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>'}
  function liveBetPlan(m){
    var R=(window.EasyBetLiveStrategies||{}).RULES||{},k=strategyKey(m.tipoGiocata),f=function(v,d){return v==null?d:Number(v).toFixed(2).replace('.',',')};
    var o15=R.over15ft||{},o05=R.over05ht||{},lx=R.layx||{},fh=R.favht||{},u=R.under05ht||{};
    var plans={
      over15:{bet:'PUNTA Over 1.5 FT',entry:'Sullo 0-0 tra il '+((o15.window||{}).from||20)+'’ e il '+((o15.window||{}).to||30)+'’, quota ≥ '+f((o15.base||{}).quotaMin,'1,70')+'.',exit:'Al primo gol chiudi in verde (cash-out), altrimenti esci al '+(o15.exitMinute||71)+'’.',sys:'EXCH O1.5 GOL 25-70'},
      over05:{bet:'PUNTA Over 0.5 HT',entry:'Sullo 0-0 tra il '+((o05.window||{}).from||15)+'’ e il '+((o05.window||{}).to||32)+'’, quota '+f((o05.base||{}).quotaMin,'1,60')+'–'+f((o05.base||{}).quotaMax,'2,10')+'.',exit:'Vinta al primo gol del primo tempo, persa all’intervallo sullo 0-0.',sys:'O0.5 HT PRE+LIVE'},
      banca:{bet:'BANCA la X',entry:'Solo all’intervallo sullo 0-0 o 1-1, quota Lay X ≤ '+f(lx.quotaMax,'2,10')+'.',exit:'Tieni fino al 90’.',sys:'EXCH LAY X HT'},
      under05:{bet:'PUNTA Under 0.5 HT',entry:'Pre-match a quota ≥ '+f(u.quotaMin,'2,95')+'.',exit:'Tieni fino all’intervallo: vinta se il primo tempo finisce 0-0.',sys:'EXCH UNDER 0.5 HT'},
      favht:{bet:'Favorito HT · PUNTA 1 oppure BANCA 2',entry:'All’intervallo: in parità punta 1 a quota ≥ '+f(fh.drawBackMin,'1,85')+'; favorito sotto banca 2 a quota ≤ '+f(fh.trailLayMax,'2,10')+' (o punta 1 ≥ '+f(fh.trailBackMin,'3,90')+').',exit:'Una sola giocata, tieni fino al 90’.',sys:'EXCH FAVORITO HT'},
      favorita:{bet:'PUNTA la favorita',entry:'Quando la favorita domina i dati live.',exit:'Gestisci in base al risultato.',sys:'Segna la favorita'}
    };
    return plans[k]||{bet:String(m.tipoGiocata||'Giocata'),entry:'Vedi la regola della strategia.',exit:'—',sys:String(m.tipoGiocata||'')};
  }
  function openLiveBell(m){
    var old=document.getElementById('liveBellPop');if(old)old.remove();
    var s=liveBellState(m),p=liveBetPlan(m),key=liveAnalyzerMatchKey(m),st=liveAnalyzerState[key]||{};
    var q=String(m.quotaIngresso||'').replace('.',',');
    var when=m.signalFirstAt?new Date(Number(m.signalFirstAt)).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'';
    var greens=Object.keys(st.alerted||{});
    var status=m.liveExcludedAt?'<div class="lb-status excl">⛔ PARTITA ESCLUSA · '+esc(m.liveExcludedReason||'nessun ingresso possibile')+'</div>':s==='green'?'<div class="lb-status green">🟢 SEGNALE VERDE · VALUTA L’INGRESSO ORA</div>':s==='was'?'<div class="lb-status was">✓ Segnale verde registrato'+(when?' alle '+esc(when):'')+'</div>':'<div class="lb-status idle">Nessun segnale verde per ora</div>';
    var extra=(m.liveLastSummary?'<div class="lb-row"><small>Ultima lettura</small><span>'+esc(m.liveLastSummary)+'</span></div>':'')+(greens.length?'<div class="lb-row"><small>Verde nel Live Analyzer</small><span>'+esc(greens.join(', '))+'</span></div>':'')+(st.minute?'<div class="lb-row"><small>Ultimo dato</small><span>'+esc(String(st.minute))+(String(st.minute).toUpperCase()==='HT'?'':'’')+' · '+esc(st.score||'—')+'</span></div>':'');
    var w=document.createElement('div');w.id='liveBellPop';w.className='live-bell-backdrop';
    w.innerHTML='<div class="live-bell-box" role="dialog" aria-label="Giocata"><button type="button" class="lb-close" aria-label="Chiudi">×</button><small class="lb-kicker">'+esc(m.campionato||'')+'</small><h4>'+esc((m.casa||'')+' – '+(m.trasferta||''))+'</h4>'+status+'<div class="lb-bet"><small>GIOCATA</small><b>'+esc(p.bet)+'</b>'+(q?'<span>Quota pre-match '+esc(q)+'</span>':'')+'</div><div class="lb-row"><small>Quando entrare</small><span>'+esc(p.entry)+'</span></div><div class="lb-row"><small>Quando uscire</small><span>'+esc(p.exit)+'</span></div><div class="lb-row"><small>Sistema</small><span>'+esc(p.sys)+'</span></div>'+extra+'<div class="lb-actions"><button type="button" class="lb-open">⚡ Apri Live Analyzer</button></div></div>';
    document.body.appendChild(w);
    w.addEventListener('click',function(ev){if(ev.target===w||ev.target.closest('.lb-close')){w.remove();return}if(ev.target.closest('.lb-open')){w.remove();openLiveAnalyzer(m)}});
  }
  document.addEventListener('click',function(e){var b=e.target.closest('.js-live-bell');if(!b)return;e.preventDefault();e.stopPropagation();var key=b.getAttribute('data-match-key');var m=matches.find(function(x){return liveAnalyzerMatchKey(x)===key});if(m)openLiveBell(m)});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){var p=document.getElementById('liveBellPop');if(p)p.remove()}});

  // ---------- Contatore richieste GoalDir (Home e Live) ----------
  var gdUsageData=null;
  function gdUsageHtml(){
    var u=gdUsageData;if(!u)return '';
    if(!u.configured)return '<div class="gd-usage off"><b>API live</b><span>GoalDir non configurata</span></div>';
    var used=Number(u.used)||0,lim=Number(u.limit)||7500,rem=Number(u.remaining);if(!isFinite(rem))rem=Math.max(0,lim-used);
    var pct=Math.max(0,Math.min(100,Math.round(rem/lim*100))),cls=pct>40?'ok':pct>15?'warn':'low';
    var reset=u.resetAt?new Date(Number(u.resetAt)).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'';
    var fmtN=function(n){return Number(n).toLocaleString('it-IT')};
    var sc=u.autoscan||{},st=sc.paused?'⏸ '+sc.paused:(sc.enabled?'Scanner automatico attivo ogni '+Math.round(sc.everySeconds||60)+' secondi':'Scanner automatico spento');
    return '<div class="gd-usage '+cls+'" title="'+escAttr(st+(u.remainingFromApi?' · residuo letto da GoalDir':' · residuo calcolato dal sito'))+'"><div class="gd-top"><b>API live GoalDir · oggi</b><span><strong>'+fmtN(rem)+'</strong> / '+fmtN(lim)+' rimaste</span></div><div class="gd-bar"><i style="width:'+pct+'%"></i></div><div class="gd-sub">'+fmtN(used)+' usate oggi'+(reset?' · si azzera alle '+reset:'')+(sc.paused?' · <em>scanner in pausa</em>':'')+'</div></div>';
  }
  function gdPaintUsage(){
    var head=document.querySelector('.section-head');if(!head)return;var el=document.getElementById('gdUsage');
    if(!el){el=document.createElement('div');el.id='gdUsage';var note=document.getElementById('refreshNote');head.insertBefore(el,note||null)}
    var show=currentView==='home'||currentView==='live';el.style.display=show?'':'none';if(show){var h=gdUsageHtml();if(el.innerHTML!==h)el.innerHTML=h}
    var la=document.getElementById('laGdUsage');if(!la){var st=document.getElementById('laAutoStatus');if(st){la=document.createElement('div');la.id='laGdUsage';st.parentNode.appendChild(la)}}if(la)la.innerHTML=gdUsageHtml();
  }
  function gdLoadUsage(){fetch('/api/goaldir/usage?ts='+Date.now(),{cache:'no-store'}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d){gdUsageData=d;gdPaintUsage()}}).catch(function(){})}
  gdLoadUsage();setInterval(gdLoadUsage,60000);
  function renderFinishedByDate(list,grid){
    var groups={};
    list.slice().sort(function(a,b){return Number(b.startAt)-Number(a.startAt)}).forEach(function(m){var k=dayKey(m);(groups[k]||(groups[k]=[])).push(m)});
    var now=new Date(),today=localDayKey(now),yd=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1),yesterday=localDayKey(yd);
    var html='';
    [today,yesterday].forEach(function(k){
      if(!groups[k])return;
      html+='<section class="history-section recent"><div class="history-section-head"><div class="history-section-badge">'+relativeDateLabel(k)+'</div><div class="history-section-line"></div>'+daySummaryHtml(groups[k])+'<div class="history-section-date">'+esc(shortDateLabelFromKey(k))+'</div></div><div class="date-group-grid">'+groups[k].map(renderMatchCard).join('')+'</div></section>';
      delete groups[k];
    });
    var prevOpen={};Array.prototype.forEach.call(grid.querySelectorAll('details.history-archive[data-day]'),function(d){if(d.open)prevOpen[d.getAttribute('data-day')]=1});
    var keepScroll=window.scrollY;
    var archiveKeys=Object.keys(groups).sort().reverse();
    if(archiveKeys.length)html+='<div class="archive-tiles">';
    archiveKeys.forEach(function(k){
      var count=groups[k].length;
      html+='<details class="date-group archive history-archive" data-day="'+esc(k)+'"'+(prevOpen[k]?' open':'')+'><summary class="'+archiveTone(groups[k])+'">'+archiveCal(k)+'<span class="archive-main"><span class="archive-copy"><small>Archivio · '+esc(k.slice(0,4))+'</small><strong>'+esc(dateLabelFromKey(k).replace(/\s\d{4}$/,''))+'</strong>'+daySummaryHtml(groups[k])+'</span></span><span class="archive-meta"><b>'+count+'</b><span>'+(count===1?'partita':'partite')+'</span></span><span class="archive-story">OGNI PARTITA<br>UNA STORIA</span>'+archiveBar(groups[k])+'</summary><div class="date-group-grid">'+groups[k].map(renderMatchCard).join('')+'</div></details>';
    });
    if(archiveKeys.length)html+='</div>';
    grid.classList.add('home-history');
    grid.innerHTML=html||'<div class="empty">Nessuna partita terminata disponibile.</div>';
    if(Object.keys(prevOpen).length)window.scrollTo(0,keepScroll);
  }
  function livePriorityLevel(m){
    var raw=String(m.liveLastLevel||'').trim().toLowerCase();
    // Se abbiamo uno stato live corrente, questo ha la precedenza.
    if(raw){
      if(raw.indexOf('ingiocabile')!==-1||raw.indexOf('esclus')!==-1)return 'excluded';
      if(raw.indexOf('chiusa')!==-1)return 'closed';
      if(raw.indexOf('verde')!==-1||raw==='green')return 'green';
      if(raw.indexOf('giall')!==-1||raw.indexOf('attendi')!==-1||raw==='yellow')return 'yellow';
      if(raw.indexOf('rosso')!==-1||raw==='red')return 'neutral';
    }
    // Fallback robusto: se il primo VERDE è già stato registrato nella timeline,
    // la dashboard non deve continuare a mostrare "DA CONTROLLARE".
    var first=String(m.signalFirstLevel||'').trim().toLowerCase();
    if(m.signalFirstAt&&(first===''||first.indexOf('verde')!==-1||first==='green'))return 'green';
    return 'neutral';
  }
  function livePriorityFresh(m){
    var ts=Number(m.liveLastUpdated||0);return ts>0&&(Date.now()-ts)<=12*60*1000;
  }
  function livePriorityAge(m){
    var ts=Number(m.liveLastUpdated||0);
    var fromSignal=false;
    if(!ts&&m.signalFirstAt){ts=Number(m.signalFirstAt||0);fromSignal=true}
    if(!ts)return 'nessuna lettura recente';
    var min=Math.max(0,Math.round((Date.now()-ts)/60000));
    if(fromSignal){
      if(min<1)return 'segnale registrato ora';
      if(min===1)return 'segnale registrato 1 min fa';
      return 'segnale registrato '+min+' min fa';
    }
    if(min<1)return 'aggiornato ora';if(min===1)return 'aggiornato 1 min fa';return 'aggiornato '+min+' min fa';
  }
  function priorityScore(m){
    var level=livePriorityLevel(m),score=level==='green'?300:level==='yellow'?200:level==='excluded'||level==='closed'?20:100;
    if(livePriorityFresh(m))score+=35;
    var elapsed=Math.max(0,(Date.now()-Number(m.startAt||0))/60000);
    if(elapsed>=15&&elapsed<=65)score+=25;
    if(elapsed>65&&elapsed<=82)score+=10;
    return score;
  }
  function renderLivePriorityDashboard(){
    var el=document.getElementById('livePriorityDashboard');if(!el)return;
    if(currentView!=='live'){el.classList.remove('show');el.innerHTML='';return}
    var live=matches.filter(isLive),now=Date.now();
    var green=live.filter(function(m){return livePriorityLevel(m)==='green'});
    var yellow=live.filter(function(m){return livePriorityLevel(m)==='yellow'});
    var upcoming30=matches.filter(function(m){var d=Number(m.startAt)-now;return isUpcoming(m)&&d>0&&d<=30*60*1000});
    var priorities=live.slice().sort(function(a,b){var d=priorityScore(b)-priorityScore(a);return d||Number(a.startAt)-Number(b.startAt)}).slice(0,6);
    var list=priorities.map(function(m,i){var lv=livePriorityLevel(m),label=lv==='green'?'VERDE':lv==='yellow'?'QUASI PRONTO':lv==='excluded'?'ESCLUSA':lv==='closed'?'CHIUSA':'DA CONTROLLARE',sub=[m.campionato||'Campionato',laPrettyStrategy?laPrettyStrategy(m.tipoGiocata||m.liveStrategy||''):String(m.tipoGiocata||'') ,livePriorityAge(m)].filter(Boolean).join(' • ');return '<button type="button" class="live-priority-item js-priority-open" data-match-key="'+escAttr(liveAnalyzerMatchKey(m))+'"><span class="live-priority-rank">'+String(i+1).padStart(2,'0')+'</span><span class="live-priority-copy"><b>'+esc((m.casa||'')+' – '+(m.trasferta||''))+'</b><span>'+esc(sub)+'</span></span><span class="live-priority-state '+lv+'">'+label+'</span></button>'}).join('');
    el.innerHTML='<div class="live-priority-shell"><div class="live-priority-head"><div><h3>⚡ Cosa devo guardare adesso</h3><p>EasyBet mette in cima le partite LIVE più interessanti in base all’ultimo stato disponibile.</p></div><div class="live-priority-updated">'+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'</div></div><div class="live-priority-kpis"><div class="live-priority-kpi gold"><small>LIVE ORA</small><strong>'+live.length+'</strong></div><div class="live-priority-kpi green"><small>SEGNALI VERDI</small><strong>'+green.length+'</strong></div><div class="live-priority-kpi yellow"><small>QUASI PRONTI</small><strong>'+yellow.length+'</strong></div><div class="live-priority-kpi blue"><small>ENTRO 30 MIN</small><strong>'+upcoming30.length+'</strong></div></div>'+(list?'<div class="live-priority-list">'+list+'</div>':'<div class="live-priority-empty">Nessuna partita LIVE da prioritizzare in questo momento.</div>')+'</div>';
    el.classList.add('show');
  }

  function render(){
    updateViewUI();try{gdPaintUsage()}catch(e){}
    renderLivePriorityDashboard();
    var grid=document.getElementById('grid'),dash=document.getElementById('statsDashboard'),board=document.getElementById('strategiesBoard'),advice=document.getElementById('adviceBoard'),exchangeBoard=document.getElementById('exchangeBoard'),masanielloBoard=document.getElementById('masanielloBoard');
    if(exchangeBoard&&currentView!=='exchange')exchangeBoard.classList.remove('show');
    if(masanielloBoard&&currentView!=='masaniello')masanielloBoard.classList.remove('show');
    board.classList.remove('show');board.innerHTML='';advice.classList.remove('show');advice.innerHTML='';
    if(currentView==='statistiche'){renderStats();return}
    if(currentView==='strategie'){renderStrategies();return}
    if(currentView==='consigli'){renderAdvice();return}
    if(currentView==='exchange'){
      dash.classList.remove('show');dash.innerHTML='';
      /* STEP41: quando si arriva dalla Home, rimuove le classi layout dello storico prima di nascondere la griglia.
         #grid.home-history usa display:flex!important e altrimenti può prevalere su view-hidden. */
      grid.classList.remove('home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');
      grid.classList.add('view-hidden');grid.style.display='none';
      var ex=document.getElementById('exchangeBoard');if(ex){ex.classList.add('show');}
      if(window.EasyBetExchange&&window.EasyBetExchange.render)window.EasyBetExchange.render();
      return;
    }
    if(currentView==='masaniello'){
      dash.classList.remove('show');dash.innerHTML='';
      grid.classList.remove('home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');
      grid.classList.add('view-hidden');grid.style.display='none';
      var mb=document.getElementById('masanielloBoard');if(mb){mb.classList.add('show');}
      if(window.EasyBetMasaniello&&window.EasyBetMasaniello.render)window.EasyBetMasaniello.render();
      return;
    }
    var exb=document.getElementById('exchangeBoard');if(exb)exb.classList.remove('show');
    var mb2=document.getElementById('masanielloBoard');if(mb2)mb2.classList.remove('show');
    dash.classList.remove('show');dash.innerHTML='';grid.classList.remove('view-hidden','home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');grid.style.display='grid';
    renderStrategyPills();gdPaintUsage();
    var list=matches.filter(matchesView).filter(function(m){return currentView==='home'?matchesOutcomeFilter(m):true});
    if(currentView==='live' && liveSearchQuery){var q=liveSearchQuery.toLowerCase();list=list.filter(function(m){return [m.casa,m.trasferta,m.campionato,m.tipoGiocata,m.quotaIngresso].join(' ').toLowerCase().indexOf(q)!==-1;});}
    if(currentView==='live'){var cnt=document.getElementById('liveSearchCount');if(cnt)cnt.textContent=list.length+' '+(list.length===1?'partita':'partite');}
    if(!list.length){
      var empty=currentView==='pronostici'?'Nessun pronostico programmato.':currentView==='live'?(liveSearchQuery?'Nessuna partita LIVE corrisponde alla ricerca.':'Nessuna partita live in questo momento.'):'Nessuna partita terminata disponibile.';
      grid.innerHTML='<div class="empty">'+empty+'</div>';return;
    }
    if(currentView==='home'){renderFinishedByDate(list,grid);return}
    if(currentView==='pronostici'){if(currentPronosticiStrategy){renderPronosticiStrategyDetail(list,grid)}else{renderPronosticiSummary(list,grid)}return}
    if(currentView==='live'){grid.classList.add('live-mode')}
    grid.innerHTML=list.map(renderMatchCard).join('')
  }
  document.addEventListener('click',function(e){var b=e.target.closest('.js-priority-open');if(!b)return;var key=b.getAttribute('data-match-key');var m=matches.find(function(x){return liveAnalyzerMatchKey(x)===key});if(m)openLiveAnalyzer(m)});
  var loadInProgress=false,hasLoadedOnce=false,loadWatchdog=null;
  function normalizeMatchesPayload(s){
    if(Array.isArray(s)) return s;
    if(s && Array.isArray(s.matches)) return s.matches;
    return [];
  }
  function publicLoadError(message){
    var note=document.getElementById('refreshNote'),grid=document.getElementById('grid');
    loadInProgress=false;
    if(note) note.textContent=hasLoadedOnce?'ultimo aggiornamento mantenuto':'errore aggiornamento';
    if(grid&&!hasLoadedOnce) grid.innerHTML='<div class="empty">'+esc(message||'Impossibile caricare le partite. Riprovo automaticamente.')+'</div>';
  }
  var publicLastSig='',publicLastAction=0;
  ['pointerdown','keydown','wheel','touchstart'].forEach(function(ev){document.addEventListener(ev,function(){publicLastAction=Date.now()},{passive:true,capture:true})});
  // Archivio Home: aprendo un giorno si chiude quello aperto prima.
  document.addEventListener('toggle',function(e){var d=e.target;if(!d||!d.matches||!d.matches('#grid details.history-archive')||!d.open)return;Array.prototype.forEach.call(document.querySelectorAll('#grid details.history-archive[open]'),function(o){if(o!==d)o.open=false})},true);
  function applyPublicState(s){
    if(loadWatchdog){clearTimeout(loadWatchdog);loadWatchdog=null}
    var incoming=normalizeMatchesPayload(s);
    var sorted=incoming.slice().sort(function(a,b){return Number(a.startAt)-Number(b.startAt)});
    var sig='';try{sig=JSON.stringify(sorted)}catch(_){sig=String(Math.random())}
    var unchanged=hasLoadedOnce&&sig===publicLastSig;
    // In Home non ridisegnare mentre la stai usando (clic/scroll nell'ultimo minuto): riprova al prossimo giro.
    var busyHome=hasLoadedOnce&&currentView==='home'&&(Date.now()-publicLastAction<60000);
    hasLoadedOnce=true;
    loadInProgress=false;
    if(unchanged||busyHome){var n0=document.getElementById('refreshNote');if(n0)n0.textContent='aggiornato alle '+new Date().toLocaleTimeString('it-IT');return}
    publicLastSig=sig;
    matches=sorted;
    render();
    if(currentView==='statistiche')loadPerformanceStats(true);
    var note=document.getElementById('refreshNote');
    if(note) note.textContent='aggiornato alle '+new Date().toLocaleTimeString('it-IT');
  }
  function load(){
    if(loadInProgress)return;
    loadInProgress=true;
    var note=document.getElementById('refreshNote');
    if(note)note.textContent=hasLoadedOnce?'aggiornamento…':'caricamento…';

    /* Usa ESATTAMENTE lo stesso endpoint e lo stesso metodo dell'area admin,
       che e' la fonte dati gia' verificata per l'elenco partite. */
    var settled=false;
    loadWatchdog=setTimeout(function(){
      if(settled)return;
      /* Se per qualunque motivo /api/state tarda, prova il feed partite diretto. */
      fetch('/api/matches?ts='+Date.now(),{cache:'no-store'})
        .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
        .then(function(s){if(settled)return;settled=true;applyPublicState(s)})
        .catch(function(){if(settled)return;settled=true;publicLoadError('Impossibile aggiornare i dati pubblici in questo momento.')});
    },6000);

    fetch('/api/state?ts='+Date.now(),{cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
      .then(function(s){if(settled)return;settled=true;applyPublicState(s)})
      .catch(function(err){
        console.warn('EasyBet /api/state:',err);
        if(settled)return;
        fetch('/api/matches?ts='+Date.now(),{cache:'no-store'})
          .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
          .then(function(s){if(settled)return;settled=true;applyPublicState(s)})
          .catch(function(){if(settled)return;settled=true;publicLoadError('Impossibile aggiornare i dati pubblici in questo momento.')});
      });
  }
  function setView(view,scroll){
    currentView=view||'home';currentFilter='tutte';if(currentView!=='pronostici')currentPronosticiStrategy=null;
    document.querySelectorAll('#pills .pill').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-f')==='tutte')});
    render();
    if(currentView==='statistiche')loadPerformanceStats(true);
    if(currentView==='exchange'&&window.EasyBetExchange&&window.EasyBetExchange.render)window.EasyBetExchange.render();
    if(currentView==='masaniello'&&window.EasyBetMasaniello&&window.EasyBetMasaniello.render)window.EasyBetMasaniello.render();
    if(scroll) document.getElementById('partite').scrollIntoView({behavior:'smooth',block:'start'});
  }
  document.querySelectorAll('[data-view]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var v=a.getAttribute('data-view');if(!v)return;history.replaceState(null,'','#'+v);setView(v,true);if(mobileNav){mobileNav.classList.remove('open')}if(mobileMenuBtn){mobileMenuBtn.setAttribute('aria-expanded','false');mobileMenuBtn.textContent='☰'}})});
  document.getElementById('pills').addEventListener('click',function(e){var b=e.target.closest('.pill');if(!b)return;currentFilter=b.getAttribute('data-f');document.querySelectorAll('#pills .pill').forEach(function(p){p.classList.remove('active')});b.classList.add('active');render()});
  var liveSearchInput=document.getElementById('liveSearchInput');if(liveSearchInput){liveSearchInput.addEventListener('input',function(){liveSearchQuery=String(this.value||'').trim();render()});}
  document.getElementById('grid').addEventListener('click',function(e){var openBtn=e.target.closest('.js-open-strategy');if(openBtn){currentPronosticiStrategy=openBtn.getAttribute('data-strategy')||null;render();return}var backBtn=e.target.closest('.js-back-pronostici');if(backBtn){currentPronosticiStrategy=null;render()}});
  document.getElementById('grid').addEventListener('click',function(e){var b=e.target.closest('.js-live-analyze');if(!b)return;var key=b.getAttribute('data-match-key');var m=matches.find(function(x){return liveAnalyzerMatchKey(x)===key});if(m)openLiveAnalyzer(m)});
  document.getElementById('grid').addEventListener('click',function(e){var b=e.target.closest('.js-signal-snapshot');if(!b)return;openSignalSnapshot(b.getAttribute('data-match-id'))});

  /* ===== Snapshot del primo segnale verde ===== */
  function ssFmtNum(v,d){if(v==null||!Number.isFinite(Number(v)))return 'N/D';var n=Number(v);return d==null?String(n):n.toFixed(d)}
  function ssPair(v,d){v=Array.isArray(v)?v:[null,null];return '<div class="ss-pair"><span><small>CASA</small><b>'+ssFmtNum(v[0],d)+'</b></span><span><small>OSPITE</small><b>'+ssFmtNum(v[1],d)+'</b></span></div>'}
  function ssOutcome(m){var e=String(m&&m.esitoManuale||'');if(e==='entrata_vinta')return ['VINTA','win'];if(e==='entrata_persa')return ['PERSA','loss'];if(e==='non_entrata')return ['NON ENTRATA','skip'];return ['IN ATTESA','pending']}
  function ssFinalScore(m){var a=m&&m.finalScoreHome,b=m&&m.finalScoreAway;if(a!=null&&b!=null)return a+'-'+b;return '—'}
  function closeSignalSnapshot(){var ov=document.getElementById('signalSnapshotOverlay');if(!ov)return;ov.classList.remove('open');ov.setAttribute('aria-hidden','true')}
  function openSignalSnapshot(matchId){
    var ov=document.getElementById('signalSnapshotOverlay'),body=document.getElementById('signalSnapshotBody'),sub=document.getElementById('signalSnapshotSubtitle');
    if(!ov||!body)return;
    var m=matches.find(function(x){return String(x.id)===String(matchId)});
    ov.classList.add('open');ov.setAttribute('aria-hidden','false');
    document.body.classList.add('snapshot-open');
    sub.textContent=m?((m.casa||'Casa')+' – '+(m.trasferta||'Ospite')):'Partita';
    body.innerHTML='<div class="ss-loading">Caricamento snapshot…</div>';
    fetch('/api/matches/'+encodeURIComponent(matchId)+'/signal-snapshots?ts='+Date.now(),{cache:'no-store'})
      .then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()})
      .then(function(list){
        list=Array.isArray(list)?list:[];
        var snap=list[0]||null;
        if(!snap){body.innerHTML='<div class="ss-empty"><b>Nessuno snapshot disponibile.</b><span>Il segnale storico esiste, ma per questa partita non è stato salvato il dettaglio statistico del momento verde.</span></div>';return}
        var out=ssOutcome(m),when=snap.createdAt?new Date(snap.createdAt):null;
        var score=(snap.scoreHome!=null&&snap.scoreAway!=null)?(snap.scoreHome+'-'+snap.scoreAway):'N/D';
        var strategy=snap.strategy||((m&&m.tipoGiocata)||'Strategia');
        var score100=snap.score100==null?'N/D':Math.round(Number(snap.score100))+'/100';
        var cards=[
          ['xG',ssPair(snap.xg,2)],
          ['Tiri in porta',ssPair(snap.sot,0)],
          ['Tiri totali',ssPair(snap.shots,0)],
          ['Big chances',ssPair(snap.chances,0)],
          ['Tiri in area',ssPair(snap.boxshots,0)],
          ['Tocchi area',ssPair(snap.touches,0)]
        ];
        body.innerHTML=
          '<div class="ss-hero">'+
            '<div><small>STRATEGIA UFFICIALE</small><h4>'+esc(strategy)+'</h4><p>'+esc(snap.summary||'Condizioni live soddisfatte secondo la strategia pre-match.')+'</p></div>'+
            '<div class="ss-score"><small>SCORE EASYBET</small><strong>'+esc(score100)+'</strong><span>VERDE</span></div>'+
          '</div>'+
          '<div class="ss-context">'+
            '<div><small>MINUTO</small><b>'+(snap.minute==null?'N/D':Math.round(Number(snap.minute))+"'")+'</b></div>'+
            '<div><small>RISULTATO AL SEGNALE</small><b>'+esc(score)+'</b></div>'+
            '<div><small>ORA SNAPSHOT</small><b>'+(when?when.toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}):'—')+'</b></div>'+
            '<div><small>FONTE</small><b>'+esc(String(snap.source||'').toUpperCase()||'—')+'</b></div>'+
          '</div>'+
          '<div class="ss-section-title"><span>DATI AL MOMENTO DEL VERDE</span><em>fotografia congelata: non cambia con i dati successivi</em></div>'+
          '<div class="ss-metrics">'+cards.map(function(c){return '<div class="ss-metric"><div class="ss-metric-label">'+esc(c[0])+'</div>'+c[1]+'</div>'}).join('')+'</div>'+
          '<div class="ss-result">'+
            '<div><small>ESITO FINALE</small><strong class="'+out[1]+'">'+out[0]+'</strong></div>'+
            '<div><small>RISULTATO FINALE</small><strong>'+ssFinalScore(m)+'</strong></div>'+
            '<div><small>QUOTA INGRESSO</small><strong>'+esc((m&&m.quotaIngresso)||'—')+'</strong></div>'+
            '<div><small>SEGNALE REGISTRATO</small><strong>'+(m&&m.signalFirstAt?new Date(Number(m.signalFirstAt)).toLocaleString('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}):'—')+'</strong></div>'+
          '</div>';
      })
      .catch(function(){body.innerHTML='<div class="ss-empty"><b>Impossibile caricare lo snapshot.</b><span>Riprova tra qualche secondo.</span></div>'});
  }
  document.addEventListener('click',function(e){if(e.target.closest('#signalSnapshotClose')){e.preventDefault();closeSignalSnapshot();document.body.classList.remove('snapshot-open');return}var ov=document.getElementById('signalSnapshotOverlay');if(ov&&e.target===ov){closeSignalSnapshot();document.body.classList.remove('snapshot-open')}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeSignalSnapshot();document.body.classList.remove('snapshot-open')}});

  /* ===== Live Analyzer integrato ===== */
  var LIVE_ANALYZER_STORAGE_KEY='easybet-live-analyzer-state-v1';
  function laLoadStoredStates(){try{var raw=localStorage.getItem(LIVE_ANALYZER_STORAGE_KEY);var obj=raw?JSON.parse(raw):{};return obj&&typeof obj==='object'?obj:{}}catch(e){return {}}}
  function laSaveStoredStates(){try{localStorage.setItem(LIVE_ANALYZER_STORAGE_KEY,JSON.stringify(liveAnalyzerState))}catch(e){}}
  var liveAnalyzerState=laLoadStoredStates(),liveAnalyzerCurrentKey=null;
  function liveAnalyzerMatchKey(m){return String(m.id!=null?m.id:[m.startAt,m.casa,m.trasferta].join('|'))}
  function laNorm(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
  function laNum(s){if(s==null)return null;var mm=String(s).replace(',','.').match(/-?\d+(?:\.\d+)?/);return mm?Number(mm[0]):null}
  function laLines(txt){return String(txt||'').split(/\r?\n/).map(function(x){return x.trim()}).filter(Boolean)}
  function laPair(lines,aliases,exclude){var aa=aliases.map(laNorm),xx=(exclude||[]).map(laNorm);function val(s){if(s==null)return {seen:false,v:null};var t=String(s).trim();if(!t)return {seen:false,v:null};if(/^n\/?d$/i.test(t)||/^nd$/i.test(t)||t==='-')return {seen:true,v:null};var n=laNum(t);return n===null?{seen:false,v:null}:{seen:true,v:n}}for(var i=0;i<lines.length;i++){var nl=laNorm(lines[i]);if(xx.some(function(x){return nl.indexOf(x)!==-1}))continue;if(aa.some(function(a){return nl.indexOf(a)!==-1})){var b=val(lines[i-1]),a=val(lines[i+1]);if(b.seen||a.seen)return [b.v,a.v];var before=null,after=null;for(var j=i-1;j>=Math.max(0,i-2);j--){var vb=val(lines[j]);if(vb.seen){before=vb.v;break}}for(var k=i+1;k<=Math.min(lines.length-1,i+2);k++){var va=val(lines[k]);if(va.seen){after=va.v;break}}return [before,after]}}return [null,null]}
  function laParse(txt){var l=laLines(txt),m={},defs={xg:['goal previsti (xg)','expected goals','xg'],xgot:['xg sui tiri in porta','xgot'],possession:['possesso palla','possesso'],shots:['tiri totali'],sot:['tiri in porta'],big:['grandi occasioni','big chances'],corners:['calci d’angolo','calci d\'angolo','calci dangolo'],boxshots:['tiri dall\'area di rigore','tiri dall’area di rigore','tiri in area'],touches:['palloni toccati nell\'area avversaria','palloni toccati nell’area avversaria','tocchi nell\'area avversaria','tocchi in area'],xa:['assist previsti (xa)','assist previsti','xa'],saves:['parate'],blocked:['tiri fermati','tiri bloccati'],off:['tiri fuori'],offsides:['fuorigioco']};Object.keys(defs).forEach(function(k){if(k==='xg'){m[k]=laPair(l,defs[k],['xg sui tiri in porta','xgot','xgot affrontati','expected goals on target']);}else if(k==='xgot'){m[k]=laPair(l,defs[k],['xgot affrontati','xgot faced','expected goals on target faced']);}else if(k==='sot'){m[k]=laPair(l,defs[k],['xg sui tiri in porta','xgot','xgot affrontati','expected goals on target']);}else{m[k]=laPair(l,defs[k]);}});function sanePair(p,min,max){return (p||[null,null]).map(function(v){return v==null||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max?null:Number(v)})}m.xg=sanePair(m.xg,0,15);m.xgot=sanePair(m.xgot,0,15);m.xa=sanePair(m.xa,0,15);m.possession=sanePair(m.possession,0,100);return m}
  function laSum(p){return p&&p[0]!=null&&p[1]!=null?p[0]+p[1]:null}function laDiff(p){return p&&p[0]!=null&&p[1]!=null?p[0]-p[1]:null}function laR(v){return v==null?null:Math.round((v+Number.EPSILON)*100)/100}function laFmt(p,s){s=s||'';return p&&p[0]!=null&&p[1]!=null?laR(p[0])+s+' – '+laR(p[1])+s:'N/D'}
  function laSig(name,state,reason,why,criteria){return{name:name,state:state,reason:reason,why:why,criteria:criteria||[]}}
  function laAnalyzeStats(m,min,sc,favSel,homeName,awayName,odds){
    var engine=window.EasyBetLiveStrategies;
    if(!engine||typeof engine.analyzeAll!=='function'){
      return [laSig('Over 0.5 HT','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Over 1.5 FT','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Banca X','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Segna favorita','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Favorito HT','DATI','Motore strategie non disponibile.','Ricarica la pagina.')];
    }
    var goalState=(liveAnalyzerCurrentKey&&liveAnalyzerState[liveAnalyzerCurrentKey])||{};
    return engine.analyzeAll(m,{
      minute:min,score:sc,favorite:favSel,homeName:homeName,awayName:awayName,odds:odds||{},
      earlyGoalBefore25:!!goalState.earlyGoalBefore25,
      firstGoalKnown:goalState.firstGoalObservedMinute!=null&&Number.isFinite(Number(goalState.firstGoalObservedMinute))
    });
  }
  function laSignalCoverage(x){var cc=(x.criteria||[]),total=cc.length,ok=cc.filter(function(c){return c[1]}).length,pct=total?Math.round(ok/total*100):null,label='';if(x.state==='VERDE')label='Conferma live';else if(x.state==='ATTENDI FORTE')label='Vicino all’ingresso';else if(x.state==='RIVALUTA GOL')label='Rivalutazione post-gol';else if(x.state==='ATTESA QUOTA')label='Dati ok • attesa quota';else if(x.state==='INGIOCABILE')label='Evento già avvenuto';else if(x.state==='NO BET')label='Filtro non superato';else if(x.state==='VALUTA A HT'||x.state==='ATTENDI HT')label='Valutazione a HT';else if(x.state==='CHIUSA')label='Mercato già chiuso';else if(x.state==='NON ATTIVA')label='Strategia non attiva';else label='Valutazione live';return {ok:ok,total:total,pct:pct,label:label}}

  function laClass(s){return s==='VERDE'?'green':(s==='NO BET'||s==='INGIOCABILE')?'red':(s==='ATTENDI'||s==='ATTENDI FORTE'||s==='RIVALUTA GOL'||s==='ATTENDI HT'||s==='VALUTA A HT'||s==='ATTESA QUOTA')?'yellow':'blue'}


  function laSetMode(mode){var a=document.getElementById('laModeAuto'),m=document.getElementById('laModeManual');if(a)a.classList.toggle('active',mode==='auto');if(m)m.classList.toggle('active',mode==='manual');if(liveAnalyzerCurrentKey){var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{};st.sourceMode=mode;st.updatedAt=Date.now();liveAnalyzerState[liveAnalyzerCurrentKey]=st;laSaveStoredStates()}}
  function laPersistStateFromForm(){if(!liveAnalyzerCurrentKey)return;var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},fg=document.getElementById('laFirstGoal'),odds={ht:(document.getElementById('laOddHT')||{}).value||'',ft:(document.getElementById('laOddFT')||{}).value||'',lay:(document.getElementById('laOddLay')||{}).value||'',fav:(document.getElementById('laOddFav')||{}).value||'',away:(document.getElementById('laOddAway')||{}).value||''};st.minute=(document.getElementById('laMinute')||{}).value||'';st.score=(document.getElementById('laScore')||{}).value||'';st.favorite=(document.getElementById('laFavorite')||{}).value||'none';st.raw=(document.getElementById('laRaw')||{}).value||'';st.odds=odds;if(fg&&String(fg.value||'').trim()!==''){var n=Number(String(fg.value).replace(/[^0-9.]/g,''));if(Number.isFinite(n)){st.firstGoalObservedMinute=n;st.earlyGoalBefore25=n<25}}else{st.firstGoalObservedMinute=null;st.earlyGoalBefore25=false}st.updatedAt=Date.now();liveAnalyzerState[liveAnalyzerCurrentKey]=st;laSaveStoredStates()}
  function laScorePairText(v){var m=String(v||'').match(/(\d+)\s*[-:]\s*(\d+)/);return m?[Number(m[1]),Number(m[2])]:[null,null]}
  function laManualPayload(parsed){function pair(v){return Array.isArray(v)?[v[0]==null?null:Number(v[0]),v[1]==null?null:Number(v[1])]:[null,null]}var sc=laScorePairText((document.getElementById('laScore')||{}).value),xg=pair(parsed.xg),sot=pair(parsed.sot),big=pair(parsed.big),shots=pair(parsed.shots),box=pair(parsed.boxshots),touch=pair(parsed.touches);return{casa:(document.getElementById('laHome')||{}).value||'',trasferta:(document.getElementById('laAway')||{}).value||'',minute:Number((document.getElementById('laMinute')||{}).value)||null,scoreHome:sc[0],scoreAway:sc[1],xgHome:xg[0],xgAway:xg[1],sotHome:sot[0],sotAway:sot[1],chancesHome:big[0],chancesAway:big[1],shotsHome:shots[0],shotsAway:shots[1],boxshotsHome:box[0],boxshotsAway:box[1],touchesHome:touch[0],touchesAway:touch[1]}}
  function laSyncManualSignal(parsed){var payload=laManualPayload(parsed);if(!payload.casa||!payload.trasferta)return Promise.resolve(null);return fetch('/api/live-stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.ok?r.json():null}).then(function(d){if(d&&d.level){var now=Date.now(),st=liveAnalyzerState[liveAnalyzerCurrentKey]||{};st.serverLevel=d.level;st.serverScore=d.score100;st.serverSummary=d.summary||'';st.updatedAt=now;liveAnalyzerState[liveAnalyzerCurrentKey]=st;laSaveStoredStates();
      // Aggiorna subito la card/dashboard senza aspettare il prossimo refresh API.
      var idx=matches.findIndex(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});
      if(idx>=0){
        matches[idx]=Object.assign({},matches[idx],{liveLastLevel:d.level,liveLastScore:d.score100,liveLastSummary:d.summary||'',liveLastUpdated:now});
        if(String(d.level||'').toLowerCase()==='verde'&&!matches[idx].signalFirstAt){
          matches[idx].signalFirstAt=now;matches[idx].signalFirstLevel='verde';matches[idx].signalFirstScore=d.score100;
        }
      }
      render();
      // Riallinea poi i dati col database; un secondo refresh copre anche eventuali latenze DB/rete.
      setTimeout(load,350);setTimeout(load,1200)
    }return d}).catch(function(){return null})}
  function laMiniIcon(label){var map={'xG':'↗','xGOT':'◎','Possesso':'◔','Tiri':'▥','Tiri in porta':'◉','Big chances':'★','Corner':'⚑','Tiri in area':'▣','Tocchi area':'☝','xA':'↗','Tiri bloccati':'▦','Parate':'◒'};return map[label]||'•'}

  function laPrettyStrategy(name){var s=String(name||'').trim();if(!s)return '';return s.replace(/0\.5HT/ig,'0.5 HT').replace(/1\.5FT/ig,'1.5 FT').replace(/\s+/g,' ')}
  function laDisplayState(x){if(x.state==='RIVALUTA GOL')return 'RIVALUTA POST-GOL';if(x.state==='INGIOCABILE'){var er=laNorm(x.reason+' '+x.why);if(x.name==='Over 0.5 HT'&&er.indexOf('prima della finestra')!==-1)return 'GOL PRE-FINESTRA';return 'NON GIOCABILE'}if(x.state==='CHIUSA'){var cr=laNorm(x.reason+' '+x.why);if(x.name==='Over 0.5 HT'&&cr.indexOf('gol')!==-1)return 'GOL GIÀ SEGNATO';return 'CHIUSA'}if(x.state!=='NO BET')return x.state;var r=laNorm(x.reason+' '+x.why);if(r.indexOf('finestra operativa superata')!==-1||r.indexOf('tempo residuo ridotto')!==-1)return 'NO BET';return 'NO BET ORA'}
  function laMetricPairMarkup(label,val){var raw=String(val||'N/D'),m=raw.match(/(-?\d+(?:\.\d+)?%?)\s*[–-]\s*(-?\d+(?:\.\d+)?%?)/),isNA=raw.trim()==='N/D',a='N/D',b='N/D',ah=0,aw=0;if(m){a=m[1];b=m[2];var na=Math.abs(parseFloat(a)),nb=Math.abs(parseFloat(b)),tot=na+nb;if(tot>0){ah=Math.round(na/tot*100);aw=100-ah}else{ah=50;aw=50}}return '<div class="la-mini '+(isNA?'is-na':'')+'"><span class="la-mini-ico">'+esc(laMiniIcon(label))+'</span><span class="la-mini-label">'+esc(label)+'</span><div class="la-mini-pair"><div class="la-mini-side"><small>CASA</small><b>'+esc(a)+'</b></div><div class="la-mini-side"><small>OSPITE</small><b>'+esc(b)+'</b></div></div><div class="la-mini-bar dual"><i class="home" style="width:'+ah+'%"></i><i class="away" style="width:'+aw+'%"></i></div></div>'}
  function laStrategySignalName(name){var t=laNorm(name).replace(/\./g,'');if(!t)return '';if(t.indexOf('under')!==-1)return 'Under 0.5 HT';if(t.indexOf('favorito')!==-1)return 'Favorito HT';if(t.indexOf('lay x')!==-1)return 'Banca X';if(t.indexOf('25-70')!==-1||t.indexOf('o1 5')!==-1)return 'Over 1.5 FT';if(t.indexOf('o0 5')!==-1)return 'Over 0.5 HT';if(t.indexOf('over 0 5')!==-1||t.indexOf('over 05')!==-1||t.indexOf('over 0,5')!==-1){if(t.indexOf('ht')!==-1||t.indexOf('1 tempo')!==-1||t.indexOf('primo tempo')!==-1)return 'Over 0.5 HT'}if(t.indexOf('over 1 5')!==-1||t.indexOf('over 15')!==-1||t.indexOf('over 1,5')!==-1){if(t.indexOf('ft')!==-1||t.indexOf('full time')!==-1||t.indexOf('finale')!==-1)return 'Over 1.5 FT'}if(t.indexOf('banca')!==-1&&t.indexOf('x')!==-1)return 'Banca X';if(t.indexOf('favorita')!==-1)return 'Segna favorita';return name||''}
  function laTargetOddNum(v){var n=Number(String(v==null?'':v).replace(',','.').replace(/[^0-9.]/g,''));return Number.isFinite(n)&&n>1?n:null}
  function laLiveOddForSignal(name,odds){odds=odds||{};if(name==='Over 0.5 HT')return laTargetOddNum(odds.ht);if(name==='Over 1.5 FT')return laTargetOddNum(odds.ft);if(name==='Banca X')return laTargetOddNum(odds.lay);if(name==='Segna favorita'||name==='Favorito HT')return laTargetOddNum(odds.fav);return null}
  function laApplyTargetQuotaGate(arr,preStrategy,targetQuota,odds){var priority=laStrategySignalName(preStrategy),target=laTargetOddNum(targetQuota);if(!priority||target==null||priority==='Favorito HT')return arr;var sig=arr.find(function(x){return x.name===priority});if(!sig)return arr;sig.targetQuota=target;sig.liveQuota=laLiveOddForSignal(priority,odds);if(sig.state==='VERDE'){if(sig.liveQuota==null){sig.state='ATTESA QUOTA';sig.reason='Dati live confermati, ma manca la quota live.';sig.why='Quota target '+target.toFixed(2)+'. Inserisci la quota corrente per autorizzare l’ingresso.';}else if(priority==='Banca X'){if(sig.liveQuota>target+0.0001){sig.state='ATTESA QUOTA';sig.reason='Condizioni live confermate, quota Lay X ancora troppo alta.';sig.why='Quota live '+sig.liveQuota.toFixed(2)+' • target massimo '+target.toFixed(2)+'. Attendi che scenda a '+target.toFixed(2)+' o meno.';}else{sig.reason=(sig.reason||'Segnale confermato.')+' Quota Lay raggiunta.';sig.why=(sig.why||'')+' Quota live '+sig.liveQuota.toFixed(2)+' ≤ target '+target.toFixed(2)+'.';}}else if(sig.liveQuota+0.0001<target){sig.state='ATTESA QUOTA';sig.reason='Condizioni live confermate, quota non ancora raggiunta.';sig.why='Quota live '+sig.liveQuota.toFixed(2)+' • target '+target.toFixed(2)+'. Attendi la quota senza forzare l’ingresso.';}else{sig.reason=(sig.reason||'Segnale confermato.')+' Quota raggiunta.';sig.why=(sig.why||'')+' Quota live '+sig.liveQuota.toFixed(2)+' ≥ target '+target.toFixed(2)+'.';}}return arr}
  function laApplyBancaXHardQuotaGate(arr,odds){var sig=arr.find(function(x){return x.name==='Banca X'});if(!sig)return arr;var eng=window.EasyBetLiveStrategies,max=(eng&&eng.RULES&&eng.RULES.layx&&eng.RULES.layx.quotaMax)||2.10,q=laTargetOddNum((odds||{}).lay);sig.liveQuota=q;sig.targetQuota=max;if(sig.state==='VERDE'){if(q==null){sig.state='ATTESA QUOTA';sig.reason='Pareggio all’intervallo, quota Lay X mancante.';sig.why='Inserisci la quota Lay X corrente: ingresso consentito solo a '+max.toFixed(2)+' o inferiore.';}else if(q>max+0.0001){sig.state='NO BET';sig.reason='Quota Lay X troppo alta: non entrare.';sig.why='Quota live '+q.toFixed(2)+' • massimo '+max.toFixed(2)+'.';}}return arr}
  var laHistoryActive=false,laSignalSentKeys={},laExcludedKeys={};
  function openLiveAnalyzer(m){markLifecycle(m,'live');laAutoManualOnly=false;liveAnalyzerCurrentKey=liveAnalyzerMatchKey(m);var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{};var selectedStrategy=st.strategy||m.tipoGiocata||'',targetQuota=st.targetQuota!=null?st.targetQuota:(m.quotaIngresso||'');st=Object.assign({},st,{strategy:selectedStrategy,targetQuota:targetQuota});liveAnalyzerState[liveAnalyzerCurrentKey]=st;laSaveStoredStates();document.getElementById('laHome').value=m.casa||'';document.getElementById('laAway').value=m.trasferta||'';document.getElementById('laMinute').value=st.minute||'';document.getElementById('laScore').value=st.score||'';document.getElementById('laFirstGoal').value=(st.firstGoalObservedMinute!=null?st.firstGoalObservedMinute:'');document.getElementById('laFavorite').value=st.favorite||'none';document.getElementById('laRaw').value=st.raw||'';var oo=st.odds||{};document.getElementById('laOddHT').value=oo.ht||'';document.getElementById('laOddFT').value=oo.ft||'';document.getElementById('laOddLay').value=oo.lay||'';document.getElementById('laOddFav').value=oo.fav||'';var oaw=document.getElementById('laOddAway');if(oaw)oaw.value=oo.away||'';var rememberedMode=st.sourceMode==='manual'?'manual':'auto';laPrefillPrimaryOdd(m,laStrategySignalName(selectedStrategy),rememberedMode==='auto');laRawUserOpen=false;laPaintAlertsBtn();laSetMode(rememberedMode);var laOverlay=document.getElementById('liveAnalyzerOverlay'),wasAlreadyOpen=laOverlay.classList.contains('open');document.body.classList.add('live-analyzer-open');laOverlay.classList.add('open');laOverlay.setAttribute('aria-hidden','false');if(!wasAlreadyOpen){try{history.pushState({easybetLiveAnalyzer:true,key:liveAnalyzerCurrentKey},'',location.href);laHistoryActive=true}catch(_){laHistoryActive=false}}if(st.raw)renderLiveAnalyzer();else{var sum=document.getElementById('laSummary');if(sum)sum.innerHTML='<div class="la-stat"><small>Stato</small><strong>In attesa dei dati</strong></div><div class="la-stat strategy-focus"><small>Strategia pre-match</small><strong>'+esc(selectedStrategy||'Non definita')+'</strong></div>';var sig=document.getElementById('laSignals');if(sig&&selectedStrategy){sig.innerHTML='<div class="la-pre-banner"><span>★</span><div><small>Strategia selezionata pre-match</small><br><b>'+esc(selectedStrategy)+'</b> — il relativo segnale verrà evidenziato appena analizzi il live.</div></div>'}}if(rememberedMode==='auto')laStartAuto();else{laStopAuto();laAutoManualOnly=true;laSetAutoStatus('MODALITÀ MANUALE • dati conservati finché non premi SVUOTA DATI.','manual')}}
  function closeLiveAnalyzer(fromHistory){laStopAuto();setTimeout(function(){try{if(currentView==='live')render()}catch(e){}},0);document.body.classList.remove('live-analyzer-open');var ov=document.getElementById('liveAnalyzerOverlay');if(ov){ov.classList.remove('open');ov.setAttribute('aria-hidden','true')}var shouldBack=!fromHistory&&laHistoryActive&&history.state&&history.state.easybetLiveAnalyzer;laHistoryActive=false;if(shouldBack){try{history.back()}catch(_){}}}
  // STEP 3: storico locale dei polling per pressione recente e trend 5/10 minuti.
  function laPairTotal(p){if(!p||!Array.isArray(p))return null;var vals=p.filter(function(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}).map(Number);return vals.length?vals.reduce(function(a,b){return a+b},0):null}
  function laSnapshotStats(stats){stats=stats||{};var keys=['xg','shots','sot','big','corners','boxshots','touches'];var out={};keys.forEach(function(k){out[k]=laPairTotal(stats[k])});return out}
  function laCaptureSnapshot(minute,stats,source){if(!liveAnalyzerCurrentKey)return;var mn=Number(minute);if(!Number.isFinite(mn)||mn<0)return;var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},hist=Array.isArray(st.history)?st.history:[],snap={minute:mn,ts:Date.now(),source:source||'auto',stats:laSnapshotStats(stats)};var last=hist[hist.length-1];if(last&&Math.abs(Number(last.minute)-mn)<0.2){hist[hist.length-1]=snap}else{hist.push(snap)};hist=hist.filter(function(x){return mn-Number(x.minute)<=22}).slice(-30);st.history=hist;liveAnalyzerState[liveAnalyzerCurrentKey]=st}
  function laSnapshotFromParsed(m){return {xg:m.xg,shots:m.shots,sot:m.sot,big:m.big,corners:m.corners,boxshots:m.boxshots,touches:m.touches}}
  function laMetricDelta(a,b,k){var av=a&&a.stats?a.stats[k]:null,bv=b&&b.stats?b.stats[k]:null;if(av==null||bv==null)return null;return Math.max(0,Number(bv)-Number(av))}
  function laWindowDelta(hist,current,mins){if(!hist||hist.length<2||!Number.isFinite(current))return null;var target=current-mins,base=null;for(var i=hist.length-1;i>=0;i--){if(Number(hist[i].minute)<=target+.35){base=hist[i];break}}if(!base)base=hist[0];var latest=hist[hist.length-1],covered=Number(latest.minute)-Number(base.minute);if(covered<Math.min(2,mins*.45))return null;var d={covered:covered};['xg','shots','sot','big','corners','boxshots','touches'].forEach(function(k){d[k]=laMetricDelta(base,latest,k)});return d}
  function laPressureValue(d){if(!d)return null;function n(v){return v==null?0:Number(v)||0}return n(d.xg)*34+n(d.sot)*12+n(d.shots)*3+n(d.big)*10+n(d.boxshots)*4+n(d.corners)*2+n(d.touches)*.55}
  function laTrendInfo(){var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},hist=Array.isArray(st.history)?st.history:[],mn=Number((document.getElementById('laMinute')||{}).value);if(!Number.isFinite(mn)||hist.length<2)return {ready:false,label:'Raccolta dati',className:'flat',detail:'Aggiorna minuto e statistiche almeno 2 volte (es. ogni 3–5’) per vedere il trend, anche in manuale.'};var d5=laWindowDelta(hist,mn,5),d10=laWindowDelta(hist,mn,10),p5=laPressureValue(d5),p10=laPressureValue(d10),trend='STABILE',cls='flat';if(p5!=null&&p10!=null&&d10&&d10.covered>=7){var prev=Math.max(0,p10-p5),ratio=(p5+1)/(prev+1);if(ratio>=1.35){trend='CRESCENTE';cls='up'}else if(ratio<=.72){trend='CALANTE';cls='down'}}else if(p5!=null){if(p5>=42){trend='FORTE ORA';cls='up'}else if(p5<12){trend='BASSA ORA';cls='down'}}return {ready:!!d5,label:trend,className:cls,d5:d5,d10:d10,p5:p5,p10:p10,detail:d5?('Ultimi '+Math.round(d5.covered)+' min: +'+(d5.shots==null?'?':d5.shots)+' tiri, +'+(d5.sot==null?'?':d5.sot)+' SOT, +'+(d5.xg==null?'?':laR(d5.xg))+' xG'):'Raccolta dati in corso.'}}
  function laSignalScore100(sig){if(!sig)return null;if(sig.score100!=null&&Number.isFinite(Number(sig.score100)))return Math.max(0,Math.min(100,Math.round(Number(sig.score100))));if(sig.score!=null&&Number.isFinite(Number(sig.score)))return Math.max(0,Math.min(100,Math.round(Number(sig.score)*100)));var c=sig.criteria||[];return c.length?Math.round(c.filter(function(x){return x[1]}).length/c.length*100):null}
  function laSignalQuality(sig,trend){var base=laSignalScore100(sig);if(base==null)base=45;var q=base;if(trend&&trend.ready&&trend.className==='up')q+=5;if(trend&&trend.ready&&trend.className==='down')q-=5;q=Math.max(0,Math.min(100,q));return {level:q>=75?'ALTA':q>=52?'MEDIA':'BASSA',cls:q>=75?'high':q>=52?'mid':'low'} }
  function laRenderTrendPanel(){var el=document.getElementById('laTrendPanel');if(!el)return;var t=laTrendInfo(),d5=t.d5,d10=t.d10;function fmtD(d,k){return !d||d[k]==null?'N/D':'+'+(k==='xg'?laR(d[k]):Math.round(d[k]))}el.innerHTML='<div class="la-trend-panel"><div class="la-trend-head"><b>⚡ Pressione recente</b><small>calcolata dagli aggiornamenti del Live Analyzer</small></div><div class="la-trend-grid"><div class="la-trend-card la-trend-'+t.className+'"><small>TREND</small><strong>'+esc(t.label)+'</strong><em>'+esc(t.detail)+'</em></div><div class="la-trend-card"><small>ULTIMI 5 MIN</small><strong>'+fmtD(d5,'xg')+' xG • '+fmtD(d5,'sot')+' SOT</strong><em>'+fmtD(d5,'shots')+' tiri • '+fmtD(d5,'boxshots')+' in area</em></div><div class="la-trend-card"><small>ULTIMI 10 MIN</small><strong>'+fmtD(d10,'xg')+' xG • '+fmtD(d10,'sot')+' SOT</strong><em>'+fmtD(d10,'shots')+' tiri • '+fmtD(d10,'big')+' big chance</em></div><div class="la-trend-card"><small>LETTURA EASYBET</small><strong class="'+(t.className==='up'?'la-quality-high':t.className==='down'?'la-quality-low':'la-quality-mid')+'">'+(t.ready?(t.className==='up'?'Pressione in aumento':t.className==='down'?'Pressione in calo':'Pressione stabile'):'In osservazione')+'</strong><em>Il trend integra i numeri, non sostituisce i paletti della strategia.</em></div></div><div class="la-trend-note">Confronto dinamico: EasyBet conserva gli ultimi aggiornamenti della partita aperta e misura quanto xG, tiri, SOT, big chances, tiri in area, corner e tocchi in area stanno crescendo.</div></div>'}

  function laGoalCount(score){var mm=String(score||'').match(/(\d+)\s*[-:]\s*(\d+)/);return mm?Number(mm[1])+Number(mm[2]):0}
  function laPostGoalTotals(m){return{xg:laSum(m.xg),sot:laSum(m.sot),shots:laSum(m.shots)}}
  function laPostGoalPressure(base,now){
    base=base||{};now=now||{};
    var dxg=(base.xg==null||now.xg==null)?null:Number(now.xg)-Number(base.xg);
    var dsot=(base.sot==null||now.sot==null)?null:Number(now.sot)-Number(base.sot);
    var dshots=(base.shots==null||now.shots==null)?null:Number(now.shots)-Number(base.shots);
    return {ok:(dxg!=null&&dxg>=.12)||(dsot!=null&&dsot>=1)||(dshots!=null&&dshots>=2),dxg:dxg,dsot:dsot,dshots:dshots};
  }
  function laApplyOver15PostGoalGuard(arr,m,minuteValue,scoreValue){
    if(!liveAnalyzerCurrentKey)return arr;
    var eng=window.EasyBetLiveStrategies;if(eng&&eng.RULES&&eng.RULES.over15ft&&eng.RULES.over15ft.allowPostGoal===false)return arr;
    var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},minute=Number(minuteValue),goals=laGoalCount(scoreValue),firstGoal=Number(st.firstGoalObservedMinute);
    var ft=arr.find(function(x){return x.name==='Over 1.5 FT'});
    if(!ft||!Number.isFinite(minute))return arr;

    var lastGoals=st.lastAnalyzedGoals;
    var lastFtState=String(st.lastOver15State||'');
    var currentMatch=matches.find(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});
    var alreadyGreen=!!(currentMatch&&currentMatch.signalFirstAt);

    if(!alreadyGreen&&goals===1&&Number.isFinite(firstGoal)&&firstGoal>=25){
      if(lastGoals===0&&lastFtState&&lastFtState!=='VERDE'&&!st.over15PostGoal){
        st.over15PostGoal={goalMinute:firstGoal,holdUntil:firstGoal+4,base:laPostGoalTotals(m),preState:lastFtState};
      }
      if(st.over15PostGoal){
        var pg=st.over15PostGoal,pressure=laPostGoalPressure(pg.base,laPostGoalTotals(m));
        if(minute<Number(pg.holdUntil)){
          ft.state='RIVALUTA GOL';
          ft.reason='Gol appena segnato: non entrare subito.';
          ft.why='Prima del gol EasyBet era '+(pg.preState||'in attesa')+'. Rivaluta dal '+pg.holdUntil+'° e usa solo la nuova pressione costruita dopo il gol.';
        }else if(!pressure.ok){
          ft.state='RIVALUTA GOL';
          ft.reason='Attendi nuova pressione dopo il gol.';
          ft.why='I dati accumulati prima del gol non autorizzano l’ingresso. Servono nuovi segnali post-gol: +0.12 xG oppure +1 SOT oppure +2 tiri.';
        }
      }
    }else if(goals===0){
      delete st.over15PostGoal;
    }

    st.lastAnalyzedGoals=goals;
    st.lastOver15State=ft.state;
    liveAnalyzerState[liveAnalyzerCurrentKey]=st;
    laSaveStoredStates();
    return arr;
  }


  // ---------- Live Analyzer: schede segnale, avvisi, dati, comandi rapidi, ingresso nel Diario ----------
  var LA_ICONS={'Over 0.5 HT':'⚽','Over 1.5 FT':'▥','Banca X':'◆','Segna favorita':'◎','Under 0.5 HT':'🛡','Favorito HT':'♛'};
  var LA_DIARIO_SYSTEMS=['EXCH O1.5 GOL 25-70','O0.5 HT PRE+LIVE','EXCH LAY X HT','EXCH UNDER 0.5 HT','EXCH FAVORITO HT · PARITÀ','EXCH FAVORITO HT · SOTTO','BET X PRE-MATCH'];
  var LA_ODD_INPUT={'Over 0.5 HT':'laOddHT','Over 1.5 FT':'laOddFT','Banca X':'laOddLay','Favorito HT':'laOddFav','Segna favorita':'laOddFav'};
  function laEffectiveTarget(name,tq){var R=(window.EasyBetLiveStrategies||{}).RULES||{};if(name==='Over 1.5 FT'&&R.over15ft)return Math.max(tq,R.over15ft.base.quotaMin);if(name==='Over 0.5 HT'&&R.over05ht)return Math.max(tq,R.over05ht.base.quotaMin);if(name==='Banca X'&&R.layx)return Math.min(tq,R.layx.quotaMax);return tq}
  function laSignalCard(x,priority,trendInfo){
    var cc=(x.criteria||[]),okc=cc.filter(function(c){return c[1]}).length,total=cc.length||0,isPriority=!!priority&&x.name===priority,confirmed=isPriority&&x.state==='VERDE',displayState=laDisplayState(x),score=laSignalScore100(x),cov=laSignalCoverage(x),q=laSignalQuality(x,trendInfo);
    var dots=total?'<div class="la-criterion-dots">'+cc.map(function(c){return '<span class="la-dot '+(c[1]?'ok':'')+'" title="'+escAttr(c[0])+'"></span>'}).join('')+'</div>':'';
    var badge=isPriority?'<span class="la-signal-badge'+(confirmed?' confirmed':'')+'">'+(confirmed?'★ STRATEGIA DELLA PARTITA · CONFERMATA':'★ STRATEGIA DELLA PARTITA')+'</span>':'';
    var quota='';
    if(x.targetQuota!=null){var lq=x.liveQuota,tq=laEffectiveTarget(x.name,Number(x.targetQuota)),isLay=x.name==='Banca X',ok=lq!=null&&(isLay?lq<=tq+0.0001:lq+0.0001>=tq);quota='<div class="la-quota-check '+(lq==null?'none':ok?'ok':'ko')+'">'+(lq==null?'Quota live non inserita · target '+(isLay?'≤ ':'≥ ')+tq.toFixed(2):'Quota live '+Number(lq).toFixed(2)+' '+(ok?'✓':'✗')+' '+(isLay?'≤ ':'≥ ')+'target '+tq.toFixed(2))+'</div>'}
    var timing=x.timing?'<div class="la-signal-timing">⏱ '+esc(x.timing)+'</div>':'';
    var entry=isPriority?'<button type="button" class="la-entry-btn'+(confirmed?' hot':'')+'" data-la-entry="'+escAttr(x.name)+'">📒 Sono entrata</button>':'';
    return '<article class="la-signal '+laClass(x.state)+(isPriority?' is-pre-match':' la-secondary')+(confirmed?' confirmed':'')+'"><div class="la-signal-icon">'+(LA_ICONS[x.name]||'•')+'</div><div class="la-signal-main"><div class="la-signal-head"><h5>'+esc(x.name)+'</h5>'+badge+'</div><p>'+esc(x.reason)+'</p>'+(x.why?'<div class="la-signal-note">'+esc(x.why)+'</div>':'')+timing+quota+(isPriority?'<div class="la-signal-proof"><span class="la-proof-chip">'+esc(cov.label)+'</span><span class="la-signal-quality '+q.cls+'">QUALITÀ '+q.level+'</span></div>':'')+'</div><div class="la-signal-score">'+dots+(total?'<div class="la-signal-count">'+okc+'/'+total+' criteri'+(score!=null?' · '+score+'/100':'')+'</div>':'')+'<span class="la-pill">'+esc(displayState)+'</span>'+entry+'</div></article>';
  }
  var LA_KEY_METRICS={'Over 0.5 HT':['xG','Tiri in porta','Big chances','Tiri in area','Tocchi area','Tiri'],'Over 1.5 FT':['xG','Tiri in porta','Big chances','Tiri in area','Tocchi area','Tiri'],'Under 0.5 HT':['xG','Tiri in porta','Big chances','Tiri'],'Banca X':['xG','Tiri in porta','Tiri','Possesso','Big chances','Tocchi area'],'Favorito HT':['xG','Tiri in porta','Tiri','Possesso','Big chances','Tocchi area'],'Segna favorita':['xG','Tiri in porta','Tiri','Possesso','Big chances','Tocchi area']};
  function laRenderParsed(m,priority){
    var par=document.getElementById('laParsed');if(!par)return;
    var rows=[['xG',laFmt(m.xg)],['xGOT',laFmt(m.xgot)],['Possesso',laFmt(m.possession,'%')],['Tiri',laFmt(m.shots)],['Tiri in porta',laFmt(m.sot)],['Big chances',laFmt(m.big)],['Corner',laFmt(m.corners)],['Tiri in area',laFmt(m.boxshots)],['Tocchi area',laFmt(m.touches)],['xA',laFmt(m.xa)],['Tiri bloccati',laFmt(m.blocked)],['Parate',laFmt(m.saves)]];
    var keys=LA_KEY_METRICS[priority]||['xG','Tiri in porta','Tiri','Big chances','Tiri in area','Tocchi area'];
    var main=keys.map(function(k){return rows.find(function(r){return r[0]===k})}).filter(Boolean),rest=rows.filter(function(r){return keys.indexOf(r[0])===-1});
    par.innerHTML=main.map(function(r){return laMetricPairMarkup(r[0],r[1])}).join('');
    var more=document.getElementById('laParsedMore');
    if(!more){more=document.createElement('details');more.id='laParsedMore';more.className='la-more-metrics';par.parentNode.insertBefore(more,par.nextSibling)}
    var wasOpen=more.open;more.innerHTML='<summary>Altre statistiche ('+rest.length+')</summary><div class="la-parsed-grid">'+rest.map(function(r){return laMetricPairMarkup(r[0],r[1])}).join('')+'</div>';more.open=wasOpen;
    var head=document.querySelector('.la-parsed-head h4');if(head)head.textContent=priority?'Dati chiave per '+priority:'Dati riconosciuti';
  }
  function laCountMetrics(m){return ['xg','xgot','possession','shots','sot','big','corners','boxshots','touches','xa','blocked','saves'].filter(function(k){var p=m[k];return p&&(p[0]!=null||p[1]!=null)}).length}
  var laRawUserOpen=false;
  function laUpdateRawCollapse(m){
    var raw=document.getElementById('laRaw');if(!raw)return;var field=raw.closest('.la-field');if(!field)return;field.classList.add('la-raw-field');
    var bar=field.querySelector('.la-raw-bar');if(!bar){bar=document.createElement('div');bar.className='la-raw-bar';field.insertBefore(bar,raw)}
    var n=laCountMetrics(m||laParse(raw.value||''));
    if(n>0){bar.innerHTML='<span>✓ <b>'+n+'</b> metriche riconosciute</span><button type="button" data-la-raw-toggle>'+(laRawUserOpen?'Nascondi statistiche':'Modifica statistiche')+'</button>';field.classList.toggle('collapsed',!laRawUserOpen)}
    else{bar.innerHTML='';field.classList.remove('collapsed')}
  }
  // avvisi
  function laAlertsOn(){try{return localStorage.getItem('easybet-la-alerts')==='1'}catch(e){return false}}
  function laSetAlerts(on){try{localStorage.setItem('easybet-la-alerts',on?'1':'0')}catch(e){}laPaintAlertsBtn();if(!on)return;var test=function(){laFireAlert('🔔 Avvisi EasyBet attivi','Prova: così vedrai i segnali VERDI.','easybet-test')};if(window.Notification&&Notification.permission==='default'){try{var p=Notification.requestPermission(test);if(p&&p.then)p.then(test)}catch(e){test()}}else{test();if(window.Notification&&Notification.permission==='denied')laToast('Notifiche di Windows bloccate','Clicca il lucchetto accanto all’indirizzo → Permessi → Invia notifiche → Consenti. Intanto vedrai questo avviso dentro il sito.')}}
  function laPaintAlertsBtn(){var b=document.getElementById('laAlertsBtn');if(b){var on=laAlertsOn();b.classList.toggle('active',on);b.textContent=on?'🔔 Avvisi attivi':'🔕 Avvisi spenti'}}
  function laBeep(){try{var C=window.AudioContext||window.webkitAudioContext;if(!C)return;var ctx=laBeep.ctx||(laBeep.ctx=new C());[0,0.18,0.36].forEach(function(t,i){var o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=i===2?1175:880;g.gain.setValueAtTime(0.0001,ctx.currentTime+t);g.gain.exponentialRampToValueAtTime(0.25,ctx.currentTime+t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+t+0.16);o.connect(g);g.connect(ctx.destination);o.start(ctx.currentTime+t);o.stop(ctx.currentTime+t+0.18)})}catch(e){}}
  function laFireAlert(title,body,tag){
    laBeep();
    try{if(window.Notification&&Notification.permission==='granted'){var n=new Notification(title,{body:body,tag:(tag||'easybet')+'-'+Date.now(),requireInteraction:true});n.onclick=function(){try{window.focus()}catch(e){}n.close()}}}catch(e){}
    laToast(title,body);laFlashTitle(title);
  }
  function laToast(title,body){
    var host=document.getElementById('laToastHost');if(!host){host=document.createElement('div');host.id='laToastHost';host.className='la-toast-host';document.body.appendChild(host)}
    var t=document.createElement('div');t.className='la-toast';var hh=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});t.innerHTML='<b>'+esc(title)+'</b><span>'+esc(body)+'</span><em>'+esc(hh)+'</em><button type="button" aria-label="Chiudi">×</button>';
    t.querySelector('button').onclick=function(){t.remove();laToastClearAll()};
    var cb=host.querySelector('.la-toast-clear');host.insertBefore(t,cb?cb.nextSibling:host.firstChild);
    while(host.querySelectorAll('.la-toast').length>10){var all=host.querySelectorAll('.la-toast');all[all.length-1].remove()}
    laToastClearAll();
  }
  function laToastClearAll(){var host=document.getElementById('laToastHost');if(!host)return;var n=host.querySelectorAll('.la-toast').length,c=host.querySelector('.la-toast-clear');if(n>=2){if(!c){c=document.createElement('button');c.type='button';c.className='la-toast-clear';c.onclick=function(){host.innerHTML=''};host.insertBefore(c,host.firstChild)}c.textContent='Chiudi tutte ('+n+')'}else if(c)c.remove()}
  var laTitleTimer=null,laTitleBase=null;
  function laFlashTitle(msg){if(laTitleBase==null)laTitleBase=document.title;clearInterval(laTitleTimer);var on=false,n=0;laTitleTimer=setInterval(function(){on=!on;n++;document.title=on?msg:laTitleBase;if(n>40||(n>6&&document.hasFocus())){clearInterval(laTitleTimer);document.title=laTitleBase}},900)}
  function laCheckAlerts(arr,priority){
    if(!liveAnalyzerCurrentKey)return;var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},prev=st.lastStates||{},next={},fired=[],alerted=st.alerted||{};
    arr.forEach(function(x){next[x.name]=x.state;if(x.state!=='VERDE'){delete alerted[x.name];return}if(x.name==='Under 0.5 HT')return;if(prev[x.name]!=='VERDE'&&!alerted[x.name]){fired.push(x);alerted[x.name]=Date.now()}});
    st.lastStates=next;st.alerted=alerted;liveAnalyzerState[liveAnalyzerCurrentKey]=st;laSaveStoredStates();
    if(!fired.length||!laAlertsOn())return;
    var home=(document.getElementById('laHome')||{}).value||'',away=(document.getElementById('laAway')||{}).value||'';
    fired.forEach(function(x){laFireAlert('🟢 VERDE · '+x.name,home+' – '+away+' · '+(x.reason||''),'easybet-'+liveAnalyzerCurrentKey+'-'+x.name)});
  }
  // comandi rapidi
  function laQuick(act){
    var minEl=document.getElementById('laMinute'),scEl=document.getElementById('laScore'),fg=document.getElementById('laFirstGoal');if(!minEl||!scEl)return;
    var mv=String(minEl.value||'').trim(),mn=/^ht$/i.test(mv)?45:(parseInt(mv,10)||0);
    if(act==='+1'||act==='+5'){mn=Math.min(130,mn+(act==='+1'?1:5));minEl.value=String(mn)}
    else if(act==='ht'){minEl.value='HT'}
    else if(act==='home'||act==='away'){var p=laScorePairText(scEl.value);var h=p[0]==null?0:p[0],w=p[1]==null?0:p[1];if(act==='home')h++;else w++;scEl.value=h+'-'+w;if(fg&&!String(fg.value||'').trim()&&mn)fg.value=String(mn)}
    else if(act==='undo'){var q=laScorePairText(scEl.value);if(q[0]!=null){var hh=q[0],ww=q[1];if(ww>0&&(ww>=hh))ww--;else if(hh>0)hh--;scEl.value=hh+'-'+ww;if(hh+ww===0&&fg)fg.value=''}}
    laPersistStateFromForm();renderLiveAnalyzer();
  }
  // ingresso → Diario Exchange
  function laDiarioSystemFor(name){var sc=laScorePairText((document.getElementById('laScore')||{}).value);if(name==='Over 1.5 FT')return 'EXCH O1.5 GOL 25-70';if(name==='Over 0.5 HT')return 'O0.5 HT PRE+LIVE';if(name==='Banca X')return 'EXCH LAY X HT';if(name==='Under 0.5 HT')return 'EXCH UNDER 0.5 HT';if(name==='Favorito HT')return (sc[0]!=null&&sc[0]<sc[1])?'EXCH FAVORITO HT · SOTTO':'EXCH FAVORITO HT · PARITÀ';return LA_DIARIO_SYSTEMS[0]}
  function laOpenEntryDialog(name){
    var m=matches.find(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});if(!m)return;
    var old=document.getElementById('laEntryDialog');if(old)old.remove();
    var sys=laDiarioSystemFor(name),side=/LAY X|SOTTO/.test(sys)?'Banca':'Punta',oid=LA_ODD_INPUT[name],odd=(oid&&(document.getElementById(oid)||{}).value)||m.quotaIngresso||'',mv=(document.getElementById('laMinute')||{}).value||'';
    var w=document.createElement('div');w.id='laEntryDialog';w.className='la-entry-backdrop';
    w.innerHTML='<div class="la-entry-box"><h4>📒 Registra ingresso nel Diario</h4><p>'+esc(m.casa+' – '+m.trasferta)+'</p><div class="la-entry-grid"><label>Sistema<select id="leSys">'+LA_DIARIO_SYSTEMS.map(function(s){return '<option'+(s===sys?' selected':'')+'>'+esc(s)+'</option>'}).join('')+'</select></label><label>Punta / Banca<select id="leSide"><option'+(side==='Punta'?' selected':'')+'>Punta</option><option'+(side==='Banca'?' selected':'')+'>Banca</option><option>Trading</option></select></label><label>Quota entrata<input id="leOdd" inputmode="decimal" value="'+escAttr(String(odd).replace(',','.'))+'"></label><label>Stake (€)<input id="leStake" inputmode="decimal" placeholder="es. 2"></label><label>Minuto<input id="leMin" value="'+escAttr(mv)+'"></label></div><small class="la-entry-hint">L’operazione entra nel Diario con P/L 0 (aperta). Quando in admin imposti l’esito, il profitto aggiorna la stessa operazione.</small><div class="la-entry-err" id="leErr"></div><div class="la-entry-actions"><button type="button" data-le="cancel">Annulla</button><button type="button" class="primary" data-le="save">Registra ingresso</button></div></div>';
    document.getElementById('liveAnalyzerOverlay').appendChild(w);
    w.addEventListener('click',function(ev){if(ev.target===w){w.remove();return}var b=ev.target.closest('[data-le]');if(!b)return;if(b.getAttribute('data-le')==='cancel'){w.remove();return}
      var v=function(id){return String((w.querySelector('#'+id)||{}).value||'').trim().replace(',','.')},err=w.querySelector('#leErr');
      if(!(Number(v('leOdd'))>1)){err.textContent='Inserisci la quota di entrata.';return}
      err.textContent='Salvataggio…';
      fetch('/api/exchange/link-match',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify({matchId:m.id,open:true,strategy:v('leSys'),side:v('leSide'),oddsIn:v('leOdd'),stake:v('leStake'),minute:v('leMin')})})
        .then(function(r){return r.json().catch(function(){return {}}).then(function(d){if(r.status===401||r.status===403)throw new Error('Per registrare nel Diario accedi come admin (pulsante «Accedi» in alto).');if(!r.ok)throw new Error(d.error||'Errore');return d})})
        .then(function(d){err.className='la-entry-ok';err.textContent='✓ Ingresso registrato: '+(d.period||'')+' · sessione '+d.slot+'.';setTimeout(function(){w.remove()},1600)})
        .catch(function(e2){err.className='la-entry-err';err.textContent=e2.message||'Errore'})});
  }
  function laPrefillPrimaryOdd(m,priority,forceBase){
    Object.keys(LA_ODD_INPUT).forEach(function(k){var el=document.getElementById(LA_ODD_INPUT[k]);if(el)el.closest('.la-odds-field')&&el.closest('.la-odds-field').classList.remove('la-odd-primary')});
    var id=LA_ODD_INPUT[priority],el=id&&document.getElementById(id);if(!el)return;var f=el.closest('.la-odds-field');if(f)f.classList.add('la-odd-primary');
    if(m&&m.quotaIngresso&&priority!=='Favorito HT'&&(forceBase||!String(el.value||'').trim())){
      el.value=String(m.quotaIngresso).replace(',','.');
      el.title=forceBase?'AUTO: usa la quota base di ingresso pre-match come riferimento':'Precompilata con la quota pre-match: aggiornala con quella live';
      if(forceBase&&liveAnalyzerCurrentKey){
        var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},od=Object.assign({},st.odds||{}),key=priority==='Over 0.5 HT'?'ht':priority==='Over 1.5 FT'?'ft':priority==='Banca X'?'lay':(priority==='Segna favorita'?'fav':'');
        if(key){od[key]=el.value;st.odds=od;st.updatedAt=Date.now();liveAnalyzerState[liveAnalyzerCurrentKey]=st;laSaveStoredStates()}
      }
    }
  }
  function renderLiveAnalyzer(){if(!liveAnalyzerCurrentKey)return;var homeEl=document.getElementById('laHome'),awayEl=document.getElementById('laAway'),minEl=document.getElementById('laMinute'),scoreEl=document.getElementById('laScore'),firstGoalEl=document.getElementById('laFirstGoal'),favEl=document.getElementById('laFavorite'),rawEl=document.getElementById('laRaw');var prev=liveAnalyzerState[liveAnalyzerCurrentKey]||{},preStrategy=prev.strategy||'',odds={ht:(document.getElementById('laOddHT')||{}).value||'',ft:(document.getElementById('laOddFT')||{}).value||'',lay:(document.getElementById('laOddLay')||{}).value||'',fav:(document.getElementById('laOddFav')||{}).value||'',away:(document.getElementById('laOddAway')||{}).value||''},manualFirstGoal=firstGoalEl&&String(firstGoalEl.value||'').trim()!==''?Number(String(firstGoalEl.value).replace(/[^0-9.]/g,'')):null;if(manualFirstGoal!=null&&Number.isFinite(manualFirstGoal)){prev.firstGoalObservedMinute=manualFirstGoal;prev.earlyGoalBefore25=manualFirstGoal<25}else if(firstGoalEl&&String(firstGoalEl.value||'').trim()===''){delete prev.firstGoalObservedMinute;prev.earlyGoalBefore25=false}liveAnalyzerState[liveAnalyzerCurrentKey]=Object.assign({},prev,{minute:minEl.value,score:scoreEl.value,favorite:favEl.value,raw:rawEl.value,strategy:preStrategy,odds:odds,sourceMode:prev.sourceMode||((document.getElementById('laModeAuto')||{}).classList&&document.getElementById('laModeAuto').classList.contains('active')?'auto':'manual')});laSaveStoredStates();var m=laParse(rawEl.value);if((liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual')laCaptureSnapshot(Number(minEl.value),laSnapshotFromParsed(m),'manual');var arr=laAnalyzeStats(m,minEl.value,scoreEl.value,favEl.value,homeEl.value,awayEl.value,odds),targetQuota=prev.targetQuota||'',sum=document.getElementById('laSummary'),sig=document.getElementById('laSignals'),par=document.getElementById('laParsed'),txg=laSum(m.xg),tsot=laSum(m.sot),tshots=laSum(m.shots),priority=laStrategySignalName(preStrategy),pretty=laPrettyStrategy(preStrategy);arr=laApplyTargetQuotaGate(arr,preStrategy,targetQuota,odds);arr=laApplyBancaXHardQuotaGate(arr,odds);arr=laApplyOver15PostGoalGuard(arr,m,minEl.value,scoreEl.value);if(priority){arr.sort(function(a,b){return (a.name===priority?-1:0)-(b.name===priority?-1:0)})}var preSignal=priority?arr.find(function(z){return z.name===priority}):null,preNote='STRATEGIA ATTIVA';if(preSignal){if(preSignal.state==='VERDE')preNote='STRATEGIA CONFERMATA';else if(preSignal.state==='NON ATTIVA')preNote='PRE-MATCH • NON ATTIVA';else if(preSignal.state==='CHIUSA')preNote='PRE-MATCH • CHIUSA';else if(preSignal.state==='RIVALUTA GOL')preNote='PRE-MATCH • RIVALUTA POST-GOL';else if(preSignal.state==='VALUTA A HT'||preSignal.state==='ATTENDI HT')preNote='PRE-MATCH • ATTESA HT';}
    var exclTxt=preSignal&&window.EasyBetLiveStrategies&&window.EasyBetLiveStrategies.exclusionOf?window.EasyBetLiveStrategies.exclusionOf(preSignal):null;
    if(exclTxt){var cmx=matches.find(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});if(cmx&&!cmx.liveExcludedAt&&!cmx.signalFirstAt&&!laExcludedKeys[liveAnalyzerCurrentKey]){laExcludedKeys[liveAnalyzerCurrentKey]=1;markLifecycle(cmx,'excluded',{reason:exclTxt,signalName:preSignal.name,minute:minEl.value,scoreText:scoreEl.value}).then(function(u){if(u&&u.excludedNow)laToast('⛔ Partita esclusa',(u.casa||'')+' – '+(u.trasferta||'')+' · '+exclTxt)})}}
    if(preSignal&&preSignal.state==='VERDE'){var currentMatch=matches.find(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});if(currentMatch&&!(currentMatch.liveAlertSent)&&!laSignalSentKeys[liveAnalyzerCurrentKey])laSignalSentKeys[liveAnalyzerCurrentKey]=1,markLifecycle(currentMatch,'signal',{level:'verde',score:laSignalScore100(preSignal),summary:preSignal.reason||'',signalName:preSignal.name,minute:minEl.value,scoreText:scoreEl.value,source:(liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual'?'manual':'goaldir',snapshot:laSignalSnapshotPayload(m,minEl.value,scoreEl.value)});}
    sum.innerHTML='<div class="la-stat"><small>Partita</small><strong>'+esc(homeEl.value)+' – '+esc(awayEl.value)+'</strong></div><div class="la-stat"><small>Minuto / risultato</small><strong>'+(minEl.value?esc(minEl.value)+(String(minEl.value).toUpperCase()==='HT'?'':"'"):'N/D')+' • '+esc(scoreEl.value||'N/D')+'</strong></div><div class="la-stat"><small>xG totale</small><strong>'+(txg==null?'N/D':laR(txg))+'</strong></div><div class="la-stat"><small>SOT / Tiri</small><strong>'+(tsot??'N/D')+' / '+(tshots??'N/D')+'</strong></div><div class="la-source-line"><span>Fonte dell’analisi</span><span class="la-source-chip '+((liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual'?'manual':'auto')+'">'+((liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual'?'MANUALE':'AUTO GoalDir')+'</span></div>'+(pretty?'<div class="la-stat strategy-focus"><div class="strategy-copy"><small>Strategia pre-match selezionata</small><strong>'+esc(pretty)+'</strong></div><div class="strategy-meta"><span class="strategy-note">'+esc(preNote)+'</span>'+(laTargetOddNum(targetQuota)!=null?'<span class="strategy-target">QUOTA TARGET '+laTargetOddNum(targetQuota).toFixed(2)+'</span>':'')+'</div></div>':'');laRenderTrendPanel();var trendInfo=laTrendInfo();var title='<div class="la-live-section-title"><div class="left"><span>⚡</span><span>Segnali live</span></div><span class="hint">Ordinati per priorità in base alla strategia pre-match</span></div>';arr=arr.filter(function(x){return x.name!=='Segna favorita'||x.name===priority});laCheckAlerts(arr,priority);sig.innerHTML=title+arr.map(function(x){return laSignalCard(x,priority,trendInfo)}).join('');laRenderParsed(m,priority);laUpdateRawCollapse(m);var head=document.querySelector('.la-parsed-head');if(head&&!head.querySelector('.la-side-legend'))head.insertAdjacentHTML('beforeend','<span class="la-side-legend">CASA / OSPITE</span>')}
  var laAutoTimer=null,laAutoBusy=false,laAutoManualOnly=false;
  function laPairHasAny(p){return p&&((p[0]!==null&&p[0]!==undefined)||(p[1]!==null&&p[1]!==undefined))}
  function laAutoRaw(data){
    var s=data&&data.stats?data.stats:{},out=[];
    function add(label,p,suffix){if(!laPairHasAny(p))return;out.push(p[0]==null?'N/D':String(p[0])+(suffix||''));out.push(label);out.push(p[1]==null?'N/D':String(p[1])+(suffix||''))}
    add('Goal previsti (xG)',s.xg);add('xG sui Tiri in porta (xGOT)',s.xgot);add('Possesso palla',s.possession,'%');add('Tiri totali',s.shots);add('Tiri in porta',s.sot);add('Grandi occasioni',s.big);add("Calci d'angolo",s.corners);add("Tiri dall'area di rigore",s.boxshots);add("Palloni toccati nell'area avversaria",s.touches);add('Assist previsti (xA)',s.xa);add('Tiri fermati',s.blocked);add('Parate',s.saves);add('Tiri fuori',s.off);add('Fuorigioco',s.offsides);
    return out.join('\n');
  }
  function laSetAutoStatus(msg,kind){var el=document.getElementById('laAutoStatus');if(!el)return;el.textContent=msg||'';el.className='la-auto-status'+(kind?' '+kind:'')}
  function laStopAuto(){if(laAutoTimer){clearInterval(laAutoTimer);laAutoTimer=null}}
  async function laFetchAuto(silent){setTimeout(gdLoadUsage,2500);
    if(laAutoBusy||!liveAnalyzerCurrentKey)return;laAutoBusy=true;
    var btn=document.getElementById('laAutoFetch');if(btn)btn.disabled=true;
    if(!silent)laSetAutoStatus('Recupero statistiche GoalDir…','warn');laSetMode('auto');
    try{
      var currentMatch=matches.find(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});
      var autoState=liveAnalyzerState[liveAnalyzerCurrentKey]||{};
      if(currentMatch)laPrefillPrimaryOdd(currentMatch,laStrategySignalName(autoState.strategy||currentMatch.tipoGiocata||''),true);
      var h=document.getElementById('laHome').value,a=document.getElementById('laAway').value;
      var r=await fetch('/api/goaldir/live-stats?home='+encodeURIComponent(h)+'&away='+encodeURIComponent(a),{cache:'no-store'});
      var d=await r.json().catch(function(){return{}});
      if(!r.ok){
        if(d&&d.code==='MATCH_NOT_FOUND'){laAutoManualOnly=true;laStopAuto();laSetMode('manual');laSetAutoStatus('PARTITA NON TROVATA NEL FEED GOALDIR • possibile campionato non coperto oppure nomi squadre differenti. Usa il riquadro qui sopra e incolla le statistiche manualmente.','manual');return}
        if(d&&d.code==='NO_GOALDIR_KEY'){laAutoManualOnly=true;laStopAuto();laSetMode('manual');laSetAutoStatus('AUTO NON CONFIGURATO • puoi continuare con inserimento manuale.','manual');return}
        throw new Error(d&&d.error?d.error:'Statistiche live non disponibili.');
      }
      var stGoal=liveAnalyzerState[liveAnalyzerCurrentKey]||{},prevScore=String(stGoal.score||document.getElementById('laScore').value||'0-0'),nextScore=String(d.score||prevScore),nextMinute=d.minute!=null?Number(d.minute):Number(document.getElementById('laMinute').value||0);
      function goalCount(sc){var mm=String(sc||'').match(/(\d+)\s*[-:]\s*(\d+)/);return mm?Number(mm[1])+Number(mm[2]):0}
      var prevGoals=goalCount(prevScore),nextGoals=goalCount(nextScore);
      if(d.firstGoalMinute!==null&&d.firstGoalMinute!==undefined&&Number.isFinite(Number(d.firstGoalMinute))){
        stGoal.firstGoalObservedMinute=Number(d.firstGoalMinute);
        stGoal.earlyGoalBefore25=Number(d.firstGoalMinute)<25;
        var fgAuto=document.getElementById('laFirstGoal');if(fgAuto)fgAuto.value=Number(d.firstGoalMinute);
      }else if(d.earlyGoalBefore25===true){
        stGoal.earlyGoalBefore25=true;
      }else if(!stGoal.earlyGoalBefore25&&nextGoals>0&&((prevGoals===0&&nextMinute<25)||(!stGoal.minute&&nextMinute<25))){
        stGoal.earlyGoalBefore25=true;stGoal.firstGoalObservedMinute=nextMinute;
      }
      liveAnalyzerState[liveAnalyzerCurrentKey]=Object.assign({},stGoal);
      if(d.isHalftime===true)document.getElementById('laMinute').value='HT';else if(d.minute!=null)document.getElementById('laMinute').value=d.minute;
      if(d.score)document.getElementById('laScore').value=d.score;
      var raw=laAutoRaw(d);if(raw)document.getElementById('laRaw').value=raw;
      laCaptureSnapshot(nextMinute,d.stats||{},'auto');
      renderLiveAnalyzer();
      var extras=[];if(d.xgEstimated)extras.push('xG stimato');if(d.hasShotmap)extras.push('shotmap');if(d.hasMomentum)extras.push('momentum');if(d.firstGoalMinute!==null&&d.firstGoalMinute!==undefined)extras.push('1° gol '+d.firstGoalMinute+"'");
      laSetMode('auto');laSetAutoStatus('LIVE AUTO OK • '+(d.isHalftime===true?'HT • ':(d.minute!=null?d.minute+"' • ":''))+(d.rateLimit?d.rateLimit+' • ':'')+(extras.length?extras.join(' + '):'dati standard'),'ok');
    }catch(e){laSetAutoStatus(e&&e.message?e.message:'Errore statistiche live.','err')}
    finally{laAutoBusy=false;if(btn)btn.disabled=false}
  }
  async function laStartAuto(){laStopAuto();laAutoManualOnly=false;await laFetchAuto(false);if(laAutoManualOnly)return;laAutoTimer=setInterval(function(){var ov=document.getElementById('liveAnalyzerOverlay');if(ov&&ov.classList.contains('open'))laFetchAuto(true);},60000)}
  function laClearAnalyzerData(){
    var st=liveAnalyzerCurrentKey?(liveAnalyzerState[liveAnalyzerCurrentKey]||{}):{};
    var raw=document.getElementById('laRaw');if(raw)raw.value='';
    ['laOddHT','laOddFT','laOddLay','laOddFav','laOddAway'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=''});
    var fgClear=document.getElementById('laFirstGoal');if(fgClear)fgClear.value='';
    var sum=document.getElementById('laSummary');if(sum)sum.innerHTML='<div class="la-stat"><small>Stato</small><strong>In attesa dei dati</strong></div>'+(st.strategy?'<div class="la-stat strategy-focus"><small>Strategia pre-match</small><strong>'+esc(st.strategy)+'</strong></div>':'');
    var sig=document.getElementById('laSignals');if(sig)sig.innerHTML=st.strategy?'<div class="la-pre-banner"><span>★</span><div><small>Strategia selezionata pre-match</small><br><b>'+esc(st.strategy)+'</b> — il relativo segnale verrà evidenziato appena analizzi il live.</div></div>':'';
    var parsed=document.getElementById('laParsed');if(parsed)parsed.innerHTML='';var trend=document.getElementById('laTrendPanel');if(trend)trend.innerHTML='';
    if(liveAnalyzerCurrentKey){
      
      liveAnalyzerState[liveAnalyzerCurrentKey]={strategy:st.strategy||'',targetQuota:st.targetQuota||'',favorite:st.favorite||'none',minute:'',score:'',raw:'',odds:{},sourceMode:st.sourceMode||'manual',firstGoalObservedMinute:null,earlyGoalBefore25:false,history:[],lastAnalyzedGoals:null,lastOver15State:'',over15PostGoal:null};laSaveStoredStates();
    }
  }
  function initLiveAnalyzerUI(){
    if(document.documentElement.dataset.laDelegated==='1')return;
    document.documentElement.dataset.laDelegated='1';
    document.addEventListener('click',function(e){
      var analyzeBtn=e.target.closest('#laAnalyze');
      if(analyzeBtn){e.preventDefault();laRawUserOpen=false;laSetMode('manual');laPersistStateFromForm();renderLiveAnalyzer();laSyncManualSignal(laParse((document.getElementById('laRaw')||{}).value||''));return;}
      var autoBtn=e.target.closest('#laAutoFetch');
      if(autoBtn){e.preventDefault();laAutoManualOnly=false;laFetchAuto(false);return;}
      var clearBtn=e.target.closest('#laClear');
      if(clearBtn){e.preventDefault();laClearAnalyzerData();return;}
      var closeBtn=e.target.closest('#liveAnalyzerClose');
      if(closeBtn){e.preventDefault();closeLiveAnalyzer(false);return;}
      var mobileBack=e.target.closest('#liveAnalyzerBack');
      if(mobileBack){e.preventDefault();closeLiveAnalyzer(false);return;}
      var manualMode=e.target.closest('#laModeManual');
      if(manualMode){e.preventDefault();laStopAuto();laAutoManualOnly=true;laSetMode('manual');laPersistStateFromForm();laSetAutoStatus('MODALITÀ MANUALE • dati conservati finché non premi SVUOTA DATI.','manual');return;}
      var qb=e.target.closest('[data-la-quick]');
      if(qb){e.preventDefault();laQuick(qb.getAttribute('data-la-quick'));return;}
      var eb=e.target.closest('[data-la-entry]');
      if(eb){e.preventDefault();laOpenEntryDialog(eb.getAttribute('data-la-entry'));return;}
      var rt=e.target.closest('[data-la-raw-toggle]');
      if(rt){e.preventDefault();laRawUserOpen=!laRawUserOpen;laUpdateRawCollapse(null);if(laRawUserOpen){var ra=document.getElementById('laRaw');if(ra)ra.focus()}return;}
      var ab=e.target.closest('#laAlertsBtn');
      if(ab){e.preventDefault();laSetAlerts(!laAlertsOn());return;}
      var autoMode=e.target.closest('#laModeAuto');
      if(autoMode){e.preventDefault();laAutoManualOnly=false;laSetMode('auto');laStartAuto();return;}
    });
    document.addEventListener('input',function(e){if(!liveAnalyzerCurrentKey)return;var id=e.target&&e.target.id||'';if(['laMinute','laScore','laFirstGoal','laFavorite','laRaw','laOddHT','laOddFT','laOddLay','laOddFav','laOddAway'].indexOf(id)!==-1)laPersistStateFromForm()});
    document.addEventListener('change',function(e){if(!liveAnalyzerCurrentKey)return;var id=e.target&&e.target.id||'';if(['laMinute','laScore','laFirstGoal','laFavorite','laRaw','laOddHT','laOddFT','laOddLay','laOddFav','laOddAway'].indexOf(id)!==-1)laPersistStateFromForm()});
    document.addEventListener('click',function(e){var ov=document.getElementById('liveAnalyzerOverlay');if(ov&&e.target===ov)closeLiveAnalyzer(false)});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLiveAnalyzer(false)});
    window.addEventListener('popstate',function(){
      var ov=document.getElementById('liveAnalyzerOverlay');
      if(ov&&ov.classList.contains('open'))closeLiveAnalyzer(true);
      else laHistoryActive=false;
    });
  }
  initLiveAnalyzerUI();

  var initial=(location.hash||'#home').replace('#','');if(['home','pronostici','live','statistiche','strategie','consigli','exchange','masaniello'].indexOf(initial)<0)initial='home';currentView=initial;load();setInterval(load,15000);setInterval(function(){render()},30000)
})();
