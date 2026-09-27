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
  var crestCache={},matches=[],currentFilter='tutte',currentView='home',performanceStats=null,performanceStatsLoading=false;
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
  function escAttr(s){return esc(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;')}
  var currentPronosticiStrategy=null;
  var liveSearchQuery='';
  function strategyKey(raw){
    var s=String(raw||'').trim().toUpperCase();
    if(/OVER\s*1[\.,]?5/.test(s)) return 'over15';
    if(/OVER\s*0[\.,]?5\s*HT/.test(s)||/OVER\s*0[\.,]?5\s*1T/.test(s)) return 'over05';
    if(/BANCA\s*LA\s*X/.test(s)) return 'banca';
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
    return map[key]||map.custom;
  }
  function strategyMeta(raw){
    var name=String(raw||'Da definire').trim().toUpperCase();
    var key=strategyKey(raw);
    var map={
      over15:{name:'OVER 1.5 FT',desc:'Almeno 2 gol nella partita.'},
      over05:{name:'OVER 0.5 HT',desc:'Almeno 1 gol nel primo tempo.'},
      banca:{name:'BANCA LA X',desc:'0-0 / 1-1 a HT, ingresso nel secondo tempo quando la quota Lay X arriva a 2.00 o meno.'},
      favorita:{name:'SEGNA LA FAVORITA',desc:'La favorita deve trovare il gol.'}
    };
    var base=map[key]||{name:name,desc:'Pronostici raggruppati per questa strategia.'};
    return {key:key,name:base.name,desc:base.desc,icon:strategyIcon(key)};
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
      return '<article class="pstrategy-card"><div class="pstrategy-head"><div class="pstrategy-titlebox"><div class="pstrategy-icon">'+g.meta.icon+'</div><div><h3>'+esc(g.meta.name)+'</h3><p>'+esc(g.meta.desc)+'</p></div></div><span class="pstrategy-badge">'+g.count+' '+(g.count===1?'partita':'partite')+'</span></div><div class="pstrategy-list">'+preview+more+'</div><div class="pstrategy-foot"><div class="pstrategy-metric"><span>Prossima partita</span><strong>'+esc(nextTime)+'</strong></div><div class="pstrategy-metric"><span>Quota media</span><strong>'+esc(avg)+'</strong></div></div><button class="pstrategy-btn js-open-strategy" data-strategy="'+escAttr(g.meta.key)+'">VEDI '+g.count+' '+(g.count===1?'PARTITA':'PARTITE')+' →</button></article>';
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
    if(currentView==='statistiche'||currentView==='strategie'||currentView==='consigli') return false;
    return isFinished(m);
  }
  function matchesOutcomeFilter(m){return currentFilter==='tutte'||(m.esitoManuale||'')===currentFilter}
  function updateViewUI(){
    var title=document.getElementById('sectionTitle'),sub=document.getElementById('sectionSubtitle'),toolbar=document.getElementById('toolbar'),liveSearchBar=document.getElementById('liveSearchBar');
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
    var circles=pts.map(function(p){return '<circle class="trend-point" cx="'+p[0]+'" cy="'+p[1]+'" r="4"/>'}).join('');
    var labels=series.length>1?'<div class="trend-labels"><span>'+esc(series[0].label)+'</span><span>'+esc(series[Math.floor(series.length/2)].label)+'</span><span>'+esc(series[series.length-1].label)+'</span></div>':'';
    return '<div class="trend-wrap"><svg class="trend-svg" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none"><defs><linearGradient id="trendArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f3d271" stop-opacity=".28"/><stop offset="100%" stop-color="#f3d271" stop-opacity="0"/></linearGradient></defs><line class="trend-grid" x1="18" x2="602" y1="18" y2="18"/><line class="trend-grid" x1="18" x2="602" y1="105" y2="105"/><line class="trend-grid" x1="18" x2="602" y1="192" y2="192"/><path class="trend-area" d="'+area+'"/><path class="trend-line" d="'+line+'"/>'+circles+'</svg>'+labels+'</div>';
  }
  function performanceClass(v){v=Number(v)||0;return v>=70?'good':v>=55?'warn':'bad'}
  function fmtQuota(v){return v==null?'—':Number(v).toFixed(2).replace('.',',')}
  function performanceTable(title,sub,rows){
    rows=Array.isArray(rows)?rows:[];
    if(!rows.length)return '<div class="stats-tablebox"><div class="chart-title">'+esc(title)+'</div><div class="chart-sub">'+esc(sub)+'</div><div class="stats-empty" style="margin-top:12px;padding:28px">Nessun dato disponibile.</div></div>';
    return '<div class="stats-tablebox"><div class="chart-title">'+esc(title)+'</div><div class="chart-sub">'+esc(sub)+'</div><div class="stats-tablewrap"><table class="stats-table"><thead><tr><th>Voce</th><th>Tot.</th><th>Entrati</th><th>V</th><th>P</th><th>Non entr.</th><th>Ingresso %</th><th>Win rate</th><th>Quota media</th></tr></thead><tbody>'+rows.slice(0,30).map(function(r){return '<tr><td title="'+escAttr(r.label)+'">'+esc(r.label)+'</td><td>'+Number(r.total||0)+'</td><td>'+Number(r.entered||0)+'</td><td>'+Number(r.wins||0)+'</td><td>'+Number(r.losses||0)+'</td><td>'+Number(r.skipped||0)+'</td><td>'+Number(r.entryRate||0)+'%</td><td class="'+performanceClass(r.winRate)+'">'+Number(r.winRate||0)+'%</td><td>'+fmtQuota(r.avgQuota)+'</td></tr>'}).join('')+'</tbody></table></div></div>';
  }
  function performancePeriodsHtml(p){
    p=p||{};var list=[p.today,p.last7,p.last30,p.all].filter(Boolean);
    return '<div class="stats-performance-head"><div><h3>Storico automatico delle performance</h3><p>Aggiornato direttamente dagli esiti salvati nel database.</p></div></div><div class="stats-periods">'+list.map(function(x){return '<div class="stats-period"><span>'+esc(x.label)+'</span><strong>'+Number(x.winRate||0)+'%</strong><small>'+Number(x.wins||0)+' vinte / '+Number(x.losses||0)+' perse · '+Number(x.entryRate||0)+'% ingressi</small></div>'}).join('')+'</div>';
  }
  function loadPerformanceStats(force){
    if(performanceStatsLoading||(!force&&performanceStats))return;
    performanceStatsLoading=true;
    fetch('/api/performance-stats?ts='+Date.now(),{cache:'no-store'}).then(function(r){if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(function(d){performanceStats=d;performanceStatsLoading=false;if(currentView==='statistiche')renderStats()}).catch(function(e){console.warn('EasyBet performance stats:',e);performanceStatsLoading=false;if(currentView==='statistiche')renderStats()});
  }
  function renderStats(){
    var s=statsData(),dash=document.getElementById('statsDashboard'),grid=document.getElementById('grid');grid.classList.remove('home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');grid.classList.add('view-hidden');grid.style.display='none';dash.classList.add('show');
    if(!s.total){dash.innerHTML='<div class="stats-empty">Appena avrai partite con esito, qui compariranno percentuali e grafici.</div>';return}
    dash.style.setProperty('--winPct',s.winPct+'%');dash.style.setProperty('--lossPct',s.lossPct+'%');
    dash.innerHTML='<div class="stat-box win"><div class="stat-label">Presa</div><div class="stat-value num">'+s.winPct+'%</div><div class="stat-foot">'+s.w+' pronostici vinti su '+s.total+' conclusi</div></div>'+ 
      '<div class="stat-box loss"><div class="stat-label">Perdita</div><div class="stat-value num">'+s.lossPct+'%</div><div class="stat-foot">'+s.l+' pronostici persi su '+s.total+' conclusi</div></div>'+ 
      '<div class="stat-box skip"><div class="stat-label">Non entrati</div><div class="stat-value num">'+s.skipPct+'%</div><div class="stat-foot">'+s.s+' partite senza ingresso</div></div>'+ 
      '<div class="stat-box rate"><div class="stat-label">Win rate sugli ingressi</div><div class="stat-value num">'+s.hitRate+'%</div><div class="stat-foot">Calcolato solo su vinte + perse</div></div>'+ 
      '<div class="chart-box"><div class="chart-title">Distribuzione esiti</div><div class="chart-sub">Percentuale sul totale delle partite concluse.</div><div class="donut-wrap"><div class="donut"><div class="donut-center"><div><strong class="num">'+s.total+'</strong><span>conclusi</span></div></div></div><div class="chart-legend"><div class="chart-legend-row"><span><i class="dot g"></i>Presa</span><b class="num">'+s.winPct+'%</b></div><div class="chart-legend-row"><span><i class="dot r"></i>Perdita</span><b class="num">'+s.lossPct+'%</b></div><div class="chart-legend-row"><span><i class="dot y"></i>Non entrati</span><b class="num">'+s.skipPct+'%</b></div></div></div></div>'+ 
      '<div class="chart-box"><div class="chart-title">Andamento della presa</div><div class="chart-sub">Win rate cumulativo sulle sole partite in cui sei entrato.</div>'+renderTrend(trendSeries())+'</div>'+ 
      '<div class="stats-note">“Presa”, “Perdita” e “Non entrati” sono calcolati sul totale dei pronostici conclusi. Il “Win rate sugli ingressi” esclude invece i non entrati, così puoi distinguere la qualità degli ingressi dalla frequenza con cui la strategia trova la quota richiesta.</div>'+
      (performanceStats ? performancePeriodsHtml(performanceStats.periods)+performanceTable('Rendimento per strategia','Confronto automatico tra le strategie salvate nelle partite concluse.',performanceStats.byStrategy)+performanceTable('Rendimento per campionato','Campionati ordinati per numero di pronostici conclusi.',performanceStats.byLeague) : '<div class="stats-loading">Caricamento storico automatico…</div>');
    if(!performanceStats&&!performanceStatsLoading)loadPerformanceStats(false);
  }

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
  function markLifecycle(m,event,extra){if(!m||!m.id)return;var body=Object.assign({event:event},extra||{});fetch('/api/matches/'+encodeURIComponent(m.id)+'/lifecycle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(function(r){return r.ok?r.json():null}).then(function(updated){if(!updated)return;var idx=matches.findIndex(function(x){return String(x.id)===String(updated.id)});if(idx>=0)matches[idx]=Object.assign({},matches[idx],updated)}).catch(function(){})}
  function laSignalSnapshotPayload(parsed,minute,score){function pair(v){return Array.isArray(v)?[v[0]==null?null:Number(v[0]),v[1]==null?null:Number(v[1])]:[null,null]}return{minute:Number.isFinite(Number(minute))?Number(minute):null,score:String(score||''),xg:pair(parsed.xg),sot:pair(parsed.sot),shots:pair(parsed.shots),chances:pair(parsed.big),boxshots:pair(parsed.boxshots),touches:pair(parsed.touches)}}
  function renderMatchCard(m){
      var e=m.esitoManuale||'',status=e?e:'attesa',camp=esc(m.campionato||'Campionato'),q=esc(m.quotaIngresso||'—'),str=esc(m.tipoGiocata||'Da definire');
      var icon,label;
      if(e){icon=ESITO_ICON[e];label=ESITO_LABEL[e]}
      else if(currentView==='live'){icon='●';label='Live'}
      else{icon='⏱';label='Da iniziare'}
      var analyzerBtn=currentView==='live'?'<button type="button" class="live-analyze-btn js-live-analyze" data-match-key="'+esc(liveAnalyzerMatchKey(m))+'">⚡ ANALIZZA LIVE</button>':'';
      return '<article class="card'+(e?' esito-'+e:'')+'"><div class="card-head"><div class="league"><small>Campionato</small>'+camp+'</div><div class="time"><small>Ora</small><strong class="num">'+esc(fmtTime(m))+'</strong></div></div><div class="date num">'+esc(fmtDate(m))+'</div><div class="matchup"><div class="team"><div class="role">Casa</div>'+crestImg(m.casa,m.campionato)+'<div class="team-name">'+esc(m.casa||'Squadra casa')+'</div></div><div class="vs">VS</div><div class="team"><div class="role">Trasferta</div>'+crestImg(m.trasferta,m.campionato)+'<div class="team-name">'+esc(m.trasferta||'Squadra trasferta')+'</div></div></div><div class="info-grid"><div class="info"><label>Quota ingresso</label><strong class="num">'+q+'</strong></div><div class="info strategy"><label>Strategia</label><strong>'+str+'</strong></div></div>'+lifecycleStrip(m)+'<div class="status '+status+'"><span class="status-icon">'+icon+'</span><span class="status-copy"><small>'+ (e?'Esito':currentView==='live'?'Stato':'Stato') +'</small><strong>'+esc(label)+'</strong></span></div>'+analyzerBtn+'</article>'
    }
  function renderFinishedByDate(list,grid){
    var groups={};
    list.slice().sort(function(a,b){return Number(b.startAt)-Number(a.startAt)}).forEach(function(m){var k=dayKey(m);(groups[k]||(groups[k]=[])).push(m)});
    var now=new Date(),today=localDayKey(now),yd=new Date(now.getFullYear(),now.getMonth(),now.getDate()-1),yesterday=localDayKey(yd);
    var html='';
    [today,yesterday].forEach(function(k){
      if(!groups[k])return;
      html+='<section class="history-section recent"><div class="history-section-head"><div class="history-section-badge">'+relativeDateLabel(k)+'</div><div class="history-section-line"></div><div class="history-section-date">'+esc(shortDateLabelFromKey(k))+'</div></div><div class="date-group-grid">'+groups[k].map(renderMatchCard).join('')+'</div></section>';
      delete groups[k];
    });
    var archiveKeys=Object.keys(groups).sort().reverse();
    archiveKeys.forEach(function(k){
      var count=groups[k].length;
      html+='<details class="date-group archive history-archive"><summary><span class="archive-main"><span class="archive-icon" aria-hidden="true"></span><span class="archive-copy"><small>Archivio</small><strong>'+esc(dateLabelFromKey(k))+'</strong></span></span><span class="archive-meta"><b>'+count+'</b><span>'+(count===1?'partita':'partite')+'</span></span><span class="archive-story">OGNI PARTITA<br>UNA STORIA</span></summary><div class="date-group-grid">'+groups[k].map(renderMatchCard).join('')+'</div></details>';
    });
    grid.classList.add('home-history');
    grid.innerHTML=html||'<div class="empty">Nessuna partita terminata disponibile.</div>';
  }
  function livePriorityLevel(m){
    var raw=String(m.liveLastLevel||'').trim().toLowerCase();
    if(raw.indexOf('verde')!==-1||raw==='green')return 'green';
    if(raw.indexOf('giall')!==-1||raw.indexOf('attendi')!==-1||raw==='yellow')return 'yellow';
    return 'neutral';
  }
  function livePriorityFresh(m){
    var ts=Number(m.liveLastUpdated||0);return ts>0&&(Date.now()-ts)<=12*60*1000;
  }
  function livePriorityAge(m){
    var ts=Number(m.liveLastUpdated||0);if(!ts)return 'nessuna lettura recente';
    var min=Math.max(0,Math.round((Date.now()-ts)/60000));
    if(min<1)return 'aggiornato ora';if(min===1)return 'aggiornato 1 min fa';return 'aggiornato '+min+' min fa';
  }
  function priorityScore(m){
    var level=livePriorityLevel(m),score=level==='green'?300:level==='yellow'?200:100;
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
    var list=priorities.map(function(m,i){var lv=livePriorityLevel(m),label=lv==='green'?'VERDE':lv==='yellow'?'QUASI PRONTO':'DA CONTROLLARE',sub=[m.campionato||'Campionato',laPrettyStrategy?laPrettyStrategy(m.tipoGiocata||m.liveStrategy||''):String(m.tipoGiocata||'') ,livePriorityAge(m)].filter(Boolean).join(' • ');return '<button type="button" class="live-priority-item js-priority-open" data-match-key="'+escAttr(liveAnalyzerMatchKey(m))+'"><span class="live-priority-rank">'+String(i+1).padStart(2,'0')+'</span><span class="live-priority-copy"><b>'+esc((m.casa||'')+' – '+(m.trasferta||''))+'</b><span>'+esc(sub)+'</span></span><span class="live-priority-state '+lv+'">'+label+'</span></button>'}).join('');
    el.innerHTML='<div class="live-priority-shell"><div class="live-priority-head"><div><h3>⚡ Cosa devo guardare adesso</h3><p>EasyBet mette in cima le partite LIVE più interessanti in base all’ultimo stato disponibile.</p></div><div class="live-priority-updated">'+new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})+'</div></div><div class="live-priority-kpis"><div class="live-priority-kpi gold"><small>LIVE ORA</small><strong>'+live.length+'</strong></div><div class="live-priority-kpi green"><small>SEGNALI VERDI</small><strong>'+green.length+'</strong></div><div class="live-priority-kpi yellow"><small>QUASI PRONTI</small><strong>'+yellow.length+'</strong></div><div class="live-priority-kpi blue"><small>ENTRO 30 MIN</small><strong>'+upcoming30.length+'</strong></div></div>'+(list?'<div class="live-priority-list">'+list+'</div>':'<div class="live-priority-empty">Nessuna partita LIVE da prioritizzare in questo momento.</div>')+'</div>';
    el.classList.add('show');
  }

  function render(){
    updateViewUI();
    renderLivePriorityDashboard();
    var grid=document.getElementById('grid'),dash=document.getElementById('statsDashboard'),board=document.getElementById('strategiesBoard'),advice=document.getElementById('adviceBoard');
    board.classList.remove('show');board.innerHTML='';advice.classList.remove('show');advice.innerHTML='';
    if(currentView==='statistiche'){renderStats();return}
    if(currentView==='strategie'){renderStrategies();return}
    if(currentView==='consigli'){renderAdvice();return}
    dash.classList.remove('show');dash.innerHTML='';grid.classList.remove('view-hidden','home-history','pronostici-detail-mode','pronostici-summary-mode','live-mode');grid.style.display='grid';
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
  function applyPublicState(s){
    if(loadWatchdog){clearTimeout(loadWatchdog);loadWatchdog=null}
    var incoming=normalizeMatchesPayload(s);
    matches=incoming.slice().sort(function(a,b){return Number(a.startAt)-Number(b.startAt)});
    hasLoadedOnce=true;
    loadInProgress=false;
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
    document.querySelectorAll('.pill').forEach(function(p){p.classList.toggle('active',p.getAttribute('data-f')==='tutte')});
    render();
    if(currentView==='statistiche')loadPerformanceStats(true);
    if(scroll) document.getElementById('partite').scrollIntoView({behavior:'smooth',block:'start'});
  }
  document.querySelectorAll('[data-view]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var v=a.getAttribute('data-view');if(!v)return;history.replaceState(null,'','#'+v);setView(v,true);if(mobileNav){mobileNav.classList.remove('open')}if(mobileMenuBtn){mobileMenuBtn.setAttribute('aria-expanded','false');mobileMenuBtn.textContent='☰'}})});
  document.getElementById('pills').addEventListener('click',function(e){var b=e.target.closest('.pill');if(!b)return;currentFilter=b.getAttribute('data-f');document.querySelectorAll('.pill').forEach(function(p){p.classList.remove('active')});b.classList.add('active');render()});
  var liveSearchInput=document.getElementById('liveSearchInput');if(liveSearchInput){liveSearchInput.addEventListener('input',function(){liveSearchQuery=String(this.value||'').trim();render()});}
  document.getElementById('grid').addEventListener('click',function(e){var openBtn=e.target.closest('.js-open-strategy');if(openBtn){currentPronosticiStrategy=openBtn.getAttribute('data-strategy')||null;render();return}var backBtn=e.target.closest('.js-back-pronostici');if(backBtn){currentPronosticiStrategy=null;render()}});
  document.getElementById('grid').addEventListener('click',function(e){var b=e.target.closest('.js-live-analyze');if(!b)return;var key=b.getAttribute('data-match-key');var m=matches.find(function(x){return liveAnalyzerMatchKey(x)===key});if(m)openLiveAnalyzer(m)});

  /* ===== Live Analyzer integrato ===== */
  var liveAnalyzerState={},liveAnalyzerCurrentKey=null;
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
      return [laSig('Over 0.5 HT','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Over 1.5 FT','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Banca X','DATI','Motore strategie non disponibile.','Ricarica la pagina.'),laSig('Segna favorita','DATI','Motore strategie non disponibile.','Ricarica la pagina.')];
    }
    var goalState=(liveAnalyzerCurrentKey&&liveAnalyzerState[liveAnalyzerCurrentKey])||{};
    return engine.analyzeAll(m,{
      minute:min,score:sc,favorite:favSel,homeName:homeName,awayName:awayName,odds:odds||{},
      earlyGoalBefore25:!!goalState.earlyGoalBefore25,
      firstGoalKnown:goalState.firstGoalObservedMinute!=null&&Number.isFinite(Number(goalState.firstGoalObservedMinute))
    });
  }
  function laSignalCoverage(x){var cc=(x.criteria||[]),total=cc.length,ok=cc.filter(function(c){return c[1]}).length,pct=total?Math.round(ok/total*100):null,label='';if(x.state==='VERDE')label='Conferma live';else if(x.state==='ATTENDI FORTE')label='Vicino all’ingresso';else if(x.state==='ATTESA QUOTA')label='Dati ok • attesa quota';else if(x.state==='NO BET'||x.state==='INGIOCABILE')label='Filtro non superato';else if(x.state==='VALUTA A HT'||x.state==='ATTENDI HT')label='Valutazione a HT';else if(x.state==='NON ATTIVA'||x.state==='CHIUSA')label='Strategia non attiva';else label='Valutazione live';return {ok:ok,total:total,pct:pct,label:label}}

  function laClass(s){return s==='VERDE'?'green':(s==='NO BET'||s==='INGIOCABILE')?'red':(s==='ATTENDI'||s==='ATTENDI FORTE'||s==='ATTENDI HT'||s==='VALUTA A HT'||s==='ATTESA QUOTA')?'yellow':'blue'}


  function laSetMode(mode){var a=document.getElementById('laModeAuto'),m=document.getElementById('laModeManual');if(a)a.classList.toggle('active',mode==='auto');if(m)m.classList.toggle('active',mode==='manual');if(liveAnalyzerCurrentKey){var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{};st.sourceMode=mode;liveAnalyzerState[liveAnalyzerCurrentKey]=st}}
  function laMiniIcon(label){var map={'xG':'↗','xGOT':'◎','Possesso':'◔','Tiri':'▥','Tiri in porta':'◉','Big chances':'★','Corner':'⚑','Tiri in area':'▣','Tocchi area':'☝','xA':'↗','Tiri bloccati':'▦','Parate':'◒'};return map[label]||'•'}

  function laPrettyStrategy(name){var s=String(name||'').trim();if(!s)return '';return s.replace(/0\.5HT/ig,'0.5 HT').replace(/1\.5FT/ig,'1.5 FT').replace(/\s+/g,' ')}
  function laDisplayState(x){if(x.state!=='NO BET')return x.state;var r=laNorm(x.reason+' '+x.why);if(r.indexOf('finestra operativa superata')!==-1||r.indexOf('tempo residuo ridotto')!==-1)return 'NO BET';return 'NO BET ORA'}
  function laMetricPairMarkup(label,val){var raw=String(val||'N/D'),m=raw.match(/(-?\d+(?:\.\d+)?%?)\s*[–-]\s*(-?\d+(?:\.\d+)?%?)/),isNA=raw.trim()==='N/D',a='N/D',b='N/D',ah=0,aw=0;if(m){a=m[1];b=m[2];var na=Math.abs(parseFloat(a)),nb=Math.abs(parseFloat(b)),tot=na+nb;if(tot>0){ah=Math.round(na/tot*100);aw=100-ah}else{ah=50;aw=50}}return '<div class="la-mini '+(isNA?'is-na':'')+'"><span class="la-mini-ico">'+esc(laMiniIcon(label))+'</span><span class="la-mini-label">'+esc(label)+'</span><div class="la-mini-pair"><div class="la-mini-side"><small>CASA</small><b>'+esc(a)+'</b></div><div class="la-mini-side"><small>OSPITE</small><b>'+esc(b)+'</b></div></div><div class="la-mini-bar dual"><i class="home" style="width:'+ah+'%"></i><i class="away" style="width:'+aw+'%"></i></div></div>'}
  function laStrategySignalName(name){var t=laNorm(name).replace(/\./g,'');if(!t)return '';if(t.indexOf('over 0 5')!==-1||t.indexOf('over 05')!==-1||t.indexOf('over 0,5')!==-1){if(t.indexOf('ht')!==-1||t.indexOf('1 tempo')!==-1||t.indexOf('primo tempo')!==-1)return 'Over 0.5 HT'}if(t.indexOf('over 1 5')!==-1||t.indexOf('over 15')!==-1||t.indexOf('over 1,5')!==-1){if(t.indexOf('ft')!==-1||t.indexOf('full time')!==-1||t.indexOf('finale')!==-1)return 'Over 1.5 FT'}if(t.indexOf('banca')!==-1&&t.indexOf('x')!==-1)return 'Banca X';if(t.indexOf('favorita')!==-1)return 'Segna favorita';return name||''}
  function laTargetOddNum(v){var n=Number(String(v==null?'':v).replace(',','.').replace(/[^0-9.]/g,''));return Number.isFinite(n)&&n>1?n:null}
  function laLiveOddForSignal(name,odds){odds=odds||{};if(name==='Over 0.5 HT')return laTargetOddNum(odds.ht);if(name==='Over 1.5 FT')return laTargetOddNum(odds.ft);if(name==='Banca X')return laTargetOddNum(odds.lay);if(name==='Segna favorita')return laTargetOddNum(odds.fav);return null}
  function laApplyTargetQuotaGate(arr,preStrategy,targetQuota,odds){var priority=laStrategySignalName(preStrategy),target=laTargetOddNum(targetQuota);if(!priority||target==null)return arr;var sig=arr.find(function(x){return x.name===priority});if(!sig)return arr;sig.targetQuota=target;sig.liveQuota=laLiveOddForSignal(priority,odds);if(sig.state==='VERDE'){if(sig.liveQuota==null){sig.state='ATTESA QUOTA';sig.reason='Dati live confermati, ma manca la quota live.';sig.why='Quota target '+target.toFixed(2)+'. Inserisci la quota corrente per autorizzare l’ingresso.';}else if(priority==='Banca X'){if(sig.liveQuota>target+0.0001){sig.state='ATTESA QUOTA';sig.reason='Condizioni live confermate, quota Lay X ancora troppo alta.';sig.why='Quota live '+sig.liveQuota.toFixed(2)+' • target massimo '+target.toFixed(2)+'. Attendi che scenda a '+target.toFixed(2)+' o meno.';}else{sig.reason=(sig.reason||'Segnale confermato.')+' Quota Lay raggiunta.';sig.why=(sig.why||'')+' Quota live '+sig.liveQuota.toFixed(2)+' ≤ target '+target.toFixed(2)+'.';}}else if(sig.liveQuota+0.0001<target){sig.state='ATTESA QUOTA';sig.reason='Condizioni live confermate, quota non ancora raggiunta.';sig.why='Quota live '+sig.liveQuota.toFixed(2)+' • target '+target.toFixed(2)+'. Attendi la quota senza forzare l’ingresso.';}else{sig.reason=(sig.reason||'Segnale confermato.')+' Quota raggiunta.';sig.why=(sig.why||'')+' Quota live '+sig.liveQuota.toFixed(2)+' ≥ target '+target.toFixed(2)+'.';}}return arr}
  function laApplyBancaXHardQuotaGate(arr,odds){var sig=arr.find(function(x){return x.name==='Banca X'});if(!sig)return arr;var q=laTargetOddNum((odds||{}).lay);sig.liveQuota=q;sig.targetQuota=2.00;if(sig.state==='VERDE'){if(q==null){sig.state='ATTESA QUOTA';sig.reason='Dati live confermati, quota Lay X mancante.';sig.why='Inserisci la quota Lay X corrente: ingresso consentito solo a 2.00 o inferiore.';}else if(q>2.0001){sig.state='ATTESA QUOTA';sig.reason='Dati live confermati, quota Lay X ancora troppo alta.';sig.why='Quota live '+q.toFixed(2)+' • target massimo 2.00. Attendi che scenda.';}else{sig.reason='Pareggio fragile nel secondo tempo e quota idonea.';sig.why='Condizioni live confermate • quota Lay X '+q.toFixed(2)+' ≤ 2.00.';}}return arr}
  function openLiveAnalyzer(m){markLifecycle(m,'live');laAutoManualOnly=false;laSetMode('auto');liveAnalyzerCurrentKey=liveAnalyzerMatchKey(m);var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{};var selectedStrategy=st.strategy||m.tipoGiocata||'',targetQuota=st.targetQuota!=null?st.targetQuota:(m.quotaIngresso||'');liveAnalyzerState[liveAnalyzerCurrentKey]=Object.assign({},st,{strategy:selectedStrategy,targetQuota:targetQuota});document.getElementById('laHome').value=m.casa||'';document.getElementById('laAway').value=m.trasferta||'';document.getElementById('laMinute').value=st.minute||'';document.getElementById('laScore').value=st.score||'';document.getElementById('laFirstGoal').value=(st.firstGoalObservedMinute!=null?st.firstGoalObservedMinute:'');document.getElementById('laFavorite').value=st.favorite||'none';document.getElementById('laRaw').value=st.raw||'';var oo=st.odds||{};document.getElementById('laOddHT').value=oo.ht||'';document.getElementById('laOddFT').value=oo.ft||'';document.getElementById('laOddLay').value=oo.lay||'';document.getElementById('laOddFav').value=oo.fav||'';document.getElementById('liveAnalyzerOverlay').classList.add('open');document.getElementById('liveAnalyzerOverlay').setAttribute('aria-hidden','false');if(st.raw)renderLiveAnalyzer();else{var sum=document.getElementById('laSummary');if(sum)sum.innerHTML='<div class="la-stat"><small>Stato</small><strong>In attesa dei dati</strong></div><div class="la-stat strategy-focus"><small>Strategia pre-match</small><strong>'+esc(selectedStrategy||'Non definita')+'</strong></div>';var sig=document.getElementById('laSignals');if(sig&&selectedStrategy){sig.innerHTML='<div class="la-pre-banner"><span>★</span><div><small>Strategia selezionata pre-match</small><br><b>'+esc(selectedStrategy)+'</b> — il relativo segnale verrà evidenziato appena analizzi il live.</div></div>'}}laStartAuto()}
  function closeLiveAnalyzer(){laStopAuto();var ov=document.getElementById('liveAnalyzerOverlay');ov.classList.remove('open');ov.setAttribute('aria-hidden','true')}
  // STEP 3: storico locale dei polling per pressione recente e trend 5/10 minuti.
  function laPairTotal(p){if(!p||!Array.isArray(p))return null;var vals=p.filter(function(v){return v!==null&&v!==undefined&&Number.isFinite(Number(v))}).map(Number);return vals.length?vals.reduce(function(a,b){return a+b},0):null}
  function laSnapshotStats(stats){stats=stats||{};var keys=['xg','shots','sot','big','corners','boxshots','touches'];var out={};keys.forEach(function(k){out[k]=laPairTotal(stats[k])});return out}
  function laCaptureSnapshot(minute,stats,source){if(!liveAnalyzerCurrentKey)return;var mn=Number(minute);if(!Number.isFinite(mn)||mn<0)return;var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},hist=Array.isArray(st.history)?st.history:[],snap={minute:mn,ts:Date.now(),source:source||'auto',stats:laSnapshotStats(stats)};var last=hist[hist.length-1];if(last&&Math.abs(Number(last.minute)-mn)<0.2){hist[hist.length-1]=snap}else{hist.push(snap)};hist=hist.filter(function(x){return mn-Number(x.minute)<=22}).slice(-30);st.history=hist;liveAnalyzerState[liveAnalyzerCurrentKey]=st}
  function laSnapshotFromParsed(m){return {xg:m.xg,shots:m.shots,sot:m.sot,big:m.big,corners:m.corners,boxshots:m.boxshots,touches:m.touches}}
  function laMetricDelta(a,b,k){var av=a&&a.stats?a.stats[k]:null,bv=b&&b.stats?b.stats[k]:null;if(av==null||bv==null)return null;return Math.max(0,Number(bv)-Number(av))}
  function laWindowDelta(hist,current,mins){if(!hist||hist.length<2||!Number.isFinite(current))return null;var target=current-mins,base=null;for(var i=hist.length-1;i>=0;i--){if(Number(hist[i].minute)<=target+.35){base=hist[i];break}}if(!base)base=hist[0];var latest=hist[hist.length-1],covered=Number(latest.minute)-Number(base.minute);if(covered<Math.min(2,mins*.45))return null;var d={covered:covered};['xg','shots','sot','big','corners','boxshots','touches'].forEach(function(k){d[k]=laMetricDelta(base,latest,k)});return d}
  function laPressureValue(d){if(!d)return null;function n(v){return v==null?0:Number(v)||0}return n(d.xg)*34+n(d.sot)*12+n(d.shots)*3+n(d.big)*10+n(d.boxshots)*4+n(d.corners)*2+n(d.touches)*.55}
  function laTrendInfo(){var st=liveAnalyzerState[liveAnalyzerCurrentKey]||{},hist=Array.isArray(st.history)?st.history:[],mn=Number((document.getElementById('laMinute')||{}).value);if(!Number.isFinite(mn)||hist.length<2)return {ready:false,label:'Raccolta dati',className:'flat',detail:'Servono almeno alcuni aggiornamenti automatici.'};var d5=laWindowDelta(hist,mn,5),d10=laWindowDelta(hist,mn,10),p5=laPressureValue(d5),p10=laPressureValue(d10),trend='STABILE',cls='flat';if(p5!=null&&p10!=null&&d10&&d10.covered>=7){var prev=Math.max(0,p10-p5),ratio=(p5+1)/(prev+1);if(ratio>=1.35){trend='CRESCENTE';cls='up'}else if(ratio<=.72){trend='CALANTE';cls='down'}}else if(p5!=null){if(p5>=42){trend='FORTE ORA';cls='up'}else if(p5<12){trend='BASSA ORA';cls='down'}}return {ready:!!d5,label:trend,className:cls,d5:d5,d10:d10,p5:p5,p10:p10,detail:d5?('Ultimi '+Math.round(d5.covered)+' min: +'+(d5.shots==null?'?':d5.shots)+' tiri, +'+(d5.sot==null?'?':d5.sot)+' SOT, +'+(d5.xg==null?'?':laR(d5.xg))+' xG'):'Raccolta dati in corso.'}}
  function laSignalScore100(sig){if(!sig)return null;if(sig.score100!=null&&Number.isFinite(Number(sig.score100)))return Math.max(0,Math.min(100,Math.round(Number(sig.score100))));if(sig.score!=null&&Number.isFinite(Number(sig.score)))return Math.max(0,Math.min(100,Math.round(Number(sig.score)*100)));var c=sig.criteria||[];return c.length?Math.round(c.filter(function(x){return x[1]}).length/c.length*100):null}
  function laSignalQuality(sig,trend){var base=laSignalScore100(sig);if(base==null)base=45;var q=base;if(trend&&trend.ready&&trend.className==='up')q+=5;if(trend&&trend.ready&&trend.className==='down')q-=5;q=Math.max(0,Math.min(100,q));return {level:q>=75?'ALTA':q>=52?'MEDIA':'BASSA',cls:q>=75?'high':q>=52?'mid':'low'} }
  function laRenderTrendPanel(){var el=document.getElementById('laTrendPanel');if(!el)return;var t=laTrendInfo(),d5=t.d5,d10=t.d10;function fmtD(d,k){return !d||d[k]==null?'N/D':'+'+(k==='xg'?laR(d[k]):Math.round(d[k]))}el.innerHTML='<div class="la-trend-panel"><div class="la-trend-head"><b>⚡ Pressione recente</b><small>calcolata dagli aggiornamenti del Live Analyzer</small></div><div class="la-trend-grid"><div class="la-trend-card la-trend-'+t.className+'"><small>TREND</small><strong>'+esc(t.label)+'</strong><em>'+esc(t.detail)+'</em></div><div class="la-trend-card"><small>ULTIMI 5 MIN</small><strong>'+fmtD(d5,'xg')+' xG • '+fmtD(d5,'sot')+' SOT</strong><em>'+fmtD(d5,'shots')+' tiri • '+fmtD(d5,'boxshots')+' in area</em></div><div class="la-trend-card"><small>ULTIMI 10 MIN</small><strong>'+fmtD(d10,'xg')+' xG • '+fmtD(d10,'sot')+' SOT</strong><em>'+fmtD(d10,'shots')+' tiri • '+fmtD(d10,'big')+' big chance</em></div><div class="la-trend-card"><small>LETTURA EASYBET</small><strong class="'+(t.className==='up'?'la-quality-high':t.className==='down'?'la-quality-low':'la-quality-mid')+'">'+(t.ready?(t.className==='up'?'Pressione in aumento':t.className==='down'?'Pressione in calo':'Pressione stabile'):'In osservazione')+'</strong><em>Il trend integra i numeri, non sostituisce i paletti della strategia.</em></div></div><div class="la-trend-note">Confronto dinamico: EasyBet conserva gli ultimi aggiornamenti della partita aperta e misura quanto xG, tiri, SOT, big chances, tiri in area, corner e tocchi in area stanno crescendo.</div></div>'}
  function renderLiveAnalyzer(){if(!liveAnalyzerCurrentKey)return;var homeEl=document.getElementById('laHome'),awayEl=document.getElementById('laAway'),minEl=document.getElementById('laMinute'),scoreEl=document.getElementById('laScore'),firstGoalEl=document.getElementById('laFirstGoal'),favEl=document.getElementById('laFavorite'),rawEl=document.getElementById('laRaw');var prev=liveAnalyzerState[liveAnalyzerCurrentKey]||{},preStrategy=prev.strategy||'',odds={ht:(document.getElementById('laOddHT')||{}).value||'',ft:(document.getElementById('laOddFT')||{}).value||'',lay:(document.getElementById('laOddLay')||{}).value||'',fav:(document.getElementById('laOddFav')||{}).value||''},manualFirstGoal=firstGoalEl&&String(firstGoalEl.value||'').trim()!==''?Number(String(firstGoalEl.value).replace(/[^0-9.]/g,'')):null;if(manualFirstGoal!=null&&Number.isFinite(manualFirstGoal)){prev.firstGoalObservedMinute=manualFirstGoal;prev.earlyGoalBefore25=manualFirstGoal<25}else if(firstGoalEl&&String(firstGoalEl.value||'').trim()===''){delete prev.firstGoalObservedMinute;prev.earlyGoalBefore25=false}liveAnalyzerState[liveAnalyzerCurrentKey]=Object.assign({},prev,{minute:minEl.value,score:scoreEl.value,favorite:favEl.value,raw:rawEl.value,strategy:preStrategy,odds:odds,sourceMode:prev.sourceMode||((document.getElementById('laModeAuto')||{}).classList&&document.getElementById('laModeAuto').classList.contains('active')?'auto':'manual')});var m=laParse(rawEl.value);if((liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual')laCaptureSnapshot(Number(minEl.value),laSnapshotFromParsed(m),'manual');var arr=laAnalyzeStats(m,minEl.value,scoreEl.value,favEl.value,homeEl.value,awayEl.value,odds),targetQuota=prev.targetQuota||'',sum=document.getElementById('laSummary'),sig=document.getElementById('laSignals'),par=document.getElementById('laParsed'),txg=laSum(m.xg),tsot=laSum(m.sot),tshots=laSum(m.shots),priority=laStrategySignalName(preStrategy),pretty=laPrettyStrategy(preStrategy);arr=laApplyTargetQuotaGate(arr,preStrategy,targetQuota,odds);arr=laApplyBancaXHardQuotaGate(arr,odds);if(priority){arr.sort(function(a,b){return (a.name===priority?-1:0)-(b.name===priority?-1:0)})}var preSignal=priority?arr.find(function(z){return z.name===priority}):null,preNote='STRATEGIA ATTIVA';if(preSignal){if(preSignal.state==='VERDE')preNote='STRATEGIA CONFERMATA';else if(preSignal.state==='NON ATTIVA')preNote='PRE-MATCH • NON ATTIVA';else if(preSignal.state==='CHIUSA')preNote='PRE-MATCH • CHIUSA';else if(preSignal.state==='VALUTA A HT'||preSignal.state==='ATTENDI HT')preNote='PRE-MATCH • ATTESA HT';}
    if(preSignal&&preSignal.state==='VERDE'){var currentMatch=matches.find(function(x){return liveAnalyzerMatchKey(x)===liveAnalyzerCurrentKey});if(currentMatch&&!currentMatch.signalFirstAt)markLifecycle(currentMatch,'signal',{level:'verde',score:laSignalScore100(preSignal),summary:preSignal.reason||'',source:(liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual'?'manual':'goaldir',snapshot:laSignalSnapshotPayload(m,minEl.value,scoreEl.value)});}
    sum.innerHTML='<div class="la-stat"><small>Partita</small><strong>'+esc(homeEl.value)+' – '+esc(awayEl.value)+'</strong></div><div class="la-stat"><small>Minuto / risultato</small><strong>'+(minEl.value?esc(minEl.value)+(String(minEl.value).toUpperCase()==='HT'?'':"'"):'N/D')+' • '+esc(scoreEl.value||'N/D')+'</strong></div><div class="la-stat"><small>xG totale</small><strong>'+(txg==null?'N/D':laR(txg))+'</strong></div><div class="la-stat"><small>SOT / Tiri</small><strong>'+(tsot??'N/D')+' / '+(tshots??'N/D')+'</strong></div><div class="la-source-line"><span>Fonte dell’analisi</span><span class="la-source-chip '+((liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual'?'manual':'auto')+'">'+((liveAnalyzerState[liveAnalyzerCurrentKey]||{}).sourceMode==='manual'?'MANUALE':'AUTO GoalDir')+'</span></div>'+(pretty?'<div class="la-stat strategy-focus"><div class="strategy-copy"><small>Strategia pre-match selezionata</small><strong>'+esc(pretty)+'</strong></div><div class="strategy-meta"><span class="strategy-note">'+esc(preNote)+'</span>'+(laTargetOddNum(targetQuota)!=null?'<span class="strategy-target">QUOTA TARGET '+laTargetOddNum(targetQuota).toFixed(2)+'</span>':'')+'</div></div>':'');laRenderTrendPanel();var trendInfo=laTrendInfo();var title='<div class="la-live-section-title"><div class="left"><span>⚡</span><span>Segnali live</span></div><span class="hint">Ordinati per priorità in base alla strategia pre-match</span></div>';sig.innerHTML=title+arr.map(function(x){var icons={'Over 0.5 HT':'⚽','Over 1.5 FT':'▥','Banca X':'◆','Segna favorita':'◎'},cc=(x.criteria||[]),okc=cc.filter(function(c){return c[1]}).length,total=cc.length||0,dots=cc.length?'<div class="la-criterion-dots">'+cc.map(function(c){return '<span class="la-dot '+(c[1]?'ok':'')+'"></span>'}).join('')+'</div>':'',isPriority=priority&&x.name===priority,confirmed=isPriority&&x.state==='VERDE',inactivePre=isPriority&&(x.state==='NON ATTIVA'||x.state==='CHIUSA'),waitingPre=isPriority&&(x.state==='VALUTA A HT'||x.state==='ATTENDI HT'),badge=isPriority?('<span class="la-signal-badge'+(confirmed?' confirmed':'')+'>'+ (confirmed?'★ PRIORITÀ 1 ✓ CONFERMATA':inactivePre?('PRE-MATCH • '+x.state):waitingPre?'PRE-MATCH • ATTESA HT':'★ PRIORITÀ 1')+'</span>'):'',displayState=laDisplayState(x),pillClass=displayState==='NO BET ORA'?' no-bet-now':'',quotaHint=(x.targetQuota!=null?'<div class="la-quota-gate"><span>LIVE '+(x.liveQuota!=null?Number(x.liveQuota).toFixed(2):'—')+'</span><b>TARGET '+Number(x.targetQuota).toFixed(2)+'</b></div>':'');return '<article class="la-signal '+laClass(x.state)+(isPriority?' is-pre-match':'')+(confirmed?' confirmed':'')+'"><div class="la-signal-icon">'+(icons[x.name]||'•')+'</div><div class="la-signal-main"><div class="la-signal-head"><h5>'+esc(x.name)+'</h5>'+badge+'</div><p>'+esc(x.reason)+'</p><div class="la-signal-note">'+esc(x.why||'')+'</div><div class="la-signal-proof"><span class="la-proof-chip">'+esc(laSignalCoverage(x).label)+'</span>'+(laSignalCoverage(x).total?'<span class="la-proof-chip neutral">'+laSignalCoverage(x).ok+'/'+laSignalCoverage(x).total+' • '+laSignalCoverage(x).pct+'% criteri</span>':'')+'<span class="la-signal-quality '+laSignalQuality(x,trendInfo).cls+'">QUALITÀ '+laSignalQuality(x,trendInfo).level+'</span></div></div><div class="la-signal-score">'+(total?'<div class="la-signal-count">'+okc+'/'+total+' criteri</div>':'')+dots+'<span class="la-pill'+pillClass+'">'+esc(displayState)+(laSignalScore100(x)==null?'':' · '+laSignalScore100(x)+'/100')+'</span>'+quotaHint+'</div></article>'}).join('');var rows=[['xG',laFmt(m.xg)],['xGOT',laFmt(m.xgot)],['Possesso',laFmt(m.possession,'%')],['Tiri',laFmt(m.shots)],['Tiri in porta',laFmt(m.sot)],['Big chances',laFmt(m.big)],['Corner',laFmt(m.corners)],['Tiri in area',laFmt(m.boxshots)],['Tocchi area',laFmt(m.touches)],['xA',laFmt(m.xa)],['Tiri bloccati',laFmt(m.blocked)],['Parate',laFmt(m.saves)]];par.innerHTML=rows.map(function(r){return laMetricPairMarkup(r[0],r[1])}).join('');var head=document.querySelector('.la-parsed-head');if(head&&!head.querySelector('.la-side-legend'))head.insertAdjacentHTML('beforeend','<span class="la-side-legend">CASA / OSPITE</span>')}
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
  async function laFetchAuto(silent){
    if(laAutoBusy||!liveAnalyzerCurrentKey)return;laAutoBusy=true;
    var btn=document.getElementById('laAutoFetch');if(btn)btn.disabled=true;
    if(!silent)laSetAutoStatus('Recupero statistiche GoalDir…','warn');laSetMode('auto');
    try{
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
    ['laOddHT','laOddFT','laOddLay','laOddFav'].forEach(function(id){var el=document.getElementById(id);if(el)el.value=''});
    var fgClear=document.getElementById('laFirstGoal');if(fgClear)fgClear.value='';
    var sum=document.getElementById('laSummary');if(sum)sum.innerHTML='<div class="la-stat"><small>Stato</small><strong>In attesa dei dati</strong></div>'+(st.strategy?'<div class="la-stat strategy-focus"><small>Strategia pre-match</small><strong>'+esc(st.strategy)+'</strong></div>':'');
    var sig=document.getElementById('laSignals');if(sig)sig.innerHTML=st.strategy?'<div class="la-pre-banner"><span>★</span><div><small>Strategia selezionata pre-match</small><br><b>'+esc(st.strategy)+'</b> — il relativo segnale verrà evidenziato appena analizzi il live.</div></div>':'';
    var parsed=document.getElementById('laParsed');if(parsed)parsed.innerHTML='';var trend=document.getElementById('laTrendPanel');if(trend)trend.innerHTML='';
    if(liveAnalyzerCurrentKey){
      
      liveAnalyzerState[liveAnalyzerCurrentKey]={strategy:st.strategy||'',targetQuota:st.targetQuota||'',favorite:st.favorite||'none',minute:'',score:'',raw:'',odds:{},sourceMode:st.sourceMode||'manual',firstGoalObservedMinute:null,earlyGoalBefore25:false,history:[]};
    }
  }
  function initLiveAnalyzerUI(){
    if(document.documentElement.dataset.laDelegated==='1')return;
    document.documentElement.dataset.laDelegated='1';
    document.addEventListener('click',function(e){
      var analyzeBtn=e.target.closest('#laAnalyze');
      if(analyzeBtn){e.preventDefault();laSetMode('manual');renderLiveAnalyzer();return;}
      var autoBtn=e.target.closest('#laAutoFetch');
      if(autoBtn){e.preventDefault();laAutoManualOnly=false;laFetchAuto(false);return;}
      var clearBtn=e.target.closest('#laClear');
      if(clearBtn){e.preventDefault();laClearAnalyzerData();return;}
      var closeBtn=e.target.closest('#liveAnalyzerClose');
      if(closeBtn){e.preventDefault();closeLiveAnalyzer();return;}
      var manualMode=e.target.closest('#laModeManual');
      if(manualMode){e.preventDefault();laSetMode('manual');return;}
      var autoMode=e.target.closest('#laModeAuto');
      if(autoMode){e.preventDefault();laAutoManualOnly=false;laSetMode('auto');return;}
    });
    document.addEventListener('click',function(e){var ov=document.getElementById('liveAnalyzerOverlay');if(ov&&e.target===ov)closeLiveAnalyzer()});
    document.addEventListener('keydown',function(e){if(e.key==='Escape')closeLiveAnalyzer()});
  }
  initLiveAnalyzerUI();

  var initial=(location.hash||'#home').replace('#','');if(['home','pronostici','live','statistiche','strategie','consigli'].indexOf(initial)<0)initial='home';currentView=initial;load();setInterval(load,15000);setInterval(function(){render()},30000)
})();
