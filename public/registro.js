/* EasyBet — Registro scommesse (sostituisce il vecchio Money Management)
   Singole multiple contemporanee, multiple, sistemi, movimenti e trasferimenti tra book.
   Stato salvato in locale + sincronizzato su Postgres (sezione "registro"). */
(function(){
'use strict';
const KEY='easybet.registro.v1', UI_KEY='easybet.registro.ui.v1', SECTION='registro';
const SPORTS={calcio:['⚽','Calcio'],tennis:['🎾','Tennis'],basket:['🏀','Basket'],volley:['🏐','Volley'],hockey:['🏒','Hockey'],football:['🏈','Football US'],baseball:['⚾','Baseball'],rugby:['🏉','Rugby'],ippica:['🏇','Ippica'],motori:['🏁','Motori'],esport:['🎮','eSport'],altro:['🎯','Altro']};
const STATUS={open:'In corso',win:'Vinta',loss:'Persa',void:'Void',cashout:'Cash Out',halfwin:'½ Vinta',halfloss:'½ Persa'};
const STATUS_CLASS={open:'open',win:'win',halfwin:'win',loss:'loss',halfloss:'loss',void:'void',cashout:'co'};
const TYPES={singola:'SINGOLA',multipla:'MULTIPLA',sistema:'SISTEMA'};
const MARKETS=['1X2','Doppia chance','U/O','GG/NG','Multigol','DNB','Handicap','Risultato esatto','Primo tempo','Marcatore','Testa a testa','Vincente','Altro'];
const DEFAULT_BOOKS=[['Bet365','#127a3d'],['Eurobet','#1f57b4'],['Betfair Exchange','#f2b705'],['AdmiralBet','#24418f'],['Snai','#d3202a'],['Sisal','#0b8a47'],['GoldBet','#c99a1e'],['Lottomatica','#0e63b8'],['Planetwin365','#e0262f'],['William Hill','#14274e'],['Betflag','#ef6a10'],['Better','#00804a']];
/* Bandiere: prima il PAESE scritto nel torneo, poi il nome della competizione; per tornei ambigui ("Serie B") si guardano anche le squadre. */
const COUNTRY_FLAGS=[[/brasil|brazil|brasile|brasileir|brasiler|paulista|carioca|mineiro|gaucho|baiano|pernambucano|cearense/i,'🇧🇷'],[/argentin/i,'🇦🇷'],[/uruguay|urugua/i,'🇺🇾'],[/paraguay/i,'🇵🇾'],[/chile|cile/i,'🇨🇱'],[/colombi/i,'🇨🇴'],[/peru|perù/i,'🇵🇪'],[/ecuador/i,'🇪🇨'],[/bolivi/i,'🇧🇴'],[/venezuel/i,'🇻🇪'],[/messic|mexic|liga mx/i,'🇲🇽'],[/\busa\b|stati uniti|united states|\bmls\b|usl/i,'🇺🇸'],[/canad/i,'🇨🇦'],[/giappon|japan|j-?league|j1|j2/i,'🇯🇵'],[/corea|korea|k-?league/i,'🇰🇷'],[/cina|china|chinese/i,'🇨🇳'],[/australi|a-league/i,'🇦🇺'],[/arabia|saudi/i,'🇸🇦'],[/scozi|scotland|scottish/i,'🇬🇧'],[/galles|wales|welsh/i,'🇬🇧'],[/irlanda del nord|northern ireland/i,'🇬🇧'],[/irland|ireland/i,'🇮🇪'],[/ingh|england|english|inglese/i,'🇬🇧'],[/spagn|spain|españa|espana|spanish/i,'🇪🇸'],[/german|germani|tedesc|deutsch/i,'🇩🇪'],[/franc|french/i,'🇫🇷'],[/portog|portugal/i,'🇵🇹'],[/oland|netherland|dutch|paesi bassi/i,'🇳🇱'],[/belgi/i,'🇧🇪'],[/svizzer|switzerland|swiss/i,'🇨🇭'],[/austri/i,'🇦🇹'],[/turch|turkey|türkiye|turkiye/i,'🇹🇷'],[/grecia|greece|greek/i,'🇬🇷'],[/danimarc|denmark|danish/i,'🇩🇰'],[/svezi|sweden|swedish/i,'🇸🇪'],[/norveg|norway/i,'🇳🇴'],[/finland/i,'🇫🇮'],[/polon|poland|polish/i,'🇵🇱'],[/cechi|czech/i,'🇨🇿'],[/croazi|croatia/i,'🇭🇷'],[/serbi/i,'🇷🇸'],[/romani/i,'🇷🇴'],[/ungheri|hungar/i,'🇭🇺'],[/ucrain|ukrain/i,'🇺🇦'],[/russi/i,'🇷🇺'],[/slovenia/i,'🇸🇮'],[/slovacch|slovakia/i,'🇸🇰'],[/bulgari/i,'🇧🇬'],[/israel/i,'🇮🇱'],[/egitt|egypt/i,'🇪🇬'],[/marocc|morocco/i,'🇲🇦'],[/sudafric|south africa/i,'🇿🇦'],[/islanda|iceland/i,'🇮🇸'],[/estonia/i,'🇪🇪'],[/lettonia|latvia/i,'🇱🇻'],[/lituani|lithuania/i,'🇱🇹'],[/cipro|cyprus/i,'🇨🇾'],[/ital/i,'🇮🇹']];
const COMP_FLAGS=[[/champions|europa league|conference league|uefa|nations league|mondial|world cup|europe|euro 20/i,'🌍'],[/libertadores|sudamericana/i,'🌎'],[/premier league|championship|fa cup|efl|league one|league two|carabao/i,'🇬🇧'],[/bundesliga|dfb|2\. liga/i,'🇩🇪'],[/ligue ?1|ligue ?2|coupe de france/i,'🇫🇷'],[/laliga|la liga|segunda|copa del rey/i,'🇪🇸'],[/eredivisie|eerste divisie/i,'🇳🇱'],[/primeira|liga portugal/i,'🇵🇹'],[/super lig/i,'🇹🇷'],[/jupiler|pro league/i,'🇧🇪'],[/allsvenskan/i,'🇸🇪'],[/eliteserien/i,'🇳🇴'],[/superliga/i,'🇩🇰'],[/ekstraklasa/i,'🇵🇱'],[/brasileir|brasilero/i,'🇧🇷'],[/coppa italia|supercoppa italiana|serie [abcd]\b|primavera/i,'🇮🇹'],[/atp|wta|itf|slam|wimbledon|roland|us open/i,'🎾'],[/nba|euroleague|eurolega/i,'🏀'],[/nfl/i,'🏈'],[/nhl/i,'🏒']];
const BR_TEAM=/\s(SP|RJ|MG|PR|RS|SC|GO|MT|MS|BA|PE|CE|AL|SE|PB|RN|PI|MA|PA|AM|AP|RR|RO|AC|TO|ES|DF)$|\b(gremio|grêmio|flamengo|fluminense|palmeiras|corinthians|santos|vasco|cruzeiro|atletico mineiro|atlético mineiro|atletico paranaense|athletico|bahia|vitoria|vitória|sport recife|ceara|ceará|goias|goiás|goianiense|coritiba|avai|avaí|chapecoense|juventude|botafogo|clube do remo|remo|paysandu|ponte preta|guarani|criciuma|criciúma|londrina|novorizontino|mirassol|cuiaba|cuiabá|bragantino|amazonas|crb|ituano|operario|operário|vila nova|villa nova|fortaleza|internacional|sao paulo|são paulo|nautico|náutico|tombense|ypiranga|figueirense|abc|america mg|américa mg|brasil de pelotas|confianca|confiança|volta redonda|ferroviaria|ferroviária|botafogo sp|athletic club)\b/i;
const AR_TEAM=/\b(boca juniors|river plate|racing club|independiente|san lorenzo|estudiantes|velez|vélez|lanus|lanús|newell|rosario central|huracan|huracán|talleres|godoy cruz|banfield|argentinos juniors|gimnasia)\b/i;

/* ---------- helpers ---------- */
function uid(p){return (p||'rg')+'_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4)}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function n(v,d){let x=Number(v);return Number.isFinite(x)?x:(d==null?0:d)}
function num(v){let s=String(v==null?'':v).trim().replace(/\s|€/g,'');if(s.includes(',')&&s.includes('.'))s=s.replace(/\./g,'');s=s.replace(',','.');let x=Number(s);return Number.isFinite(x)?x:NaN}
function r2(x){return Math.round((n(x)+Number.EPSILON)*100)/100}
function money(v,sign){let x=r2(v);return (sign&&x>0?'+':'')+x.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})+' €'}
function fmtOdds(v){return n(v)?n(v).toFixed(2):'—'}
function pad(x){return String(x).padStart(2,'0')}
function todayIso(){let d=new Date();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())}
function nowTime(){let d=new Date();return pad(d.getHours())+':'+pad(d.getMinutes())}
function dateShort(iso){let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso||''));return m?m[3]+'/'+m[2]+'/'+m[1].slice(2):(iso||'—')}
function toIso(v){let s=String(v||'').trim();let m=/^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);if(m)return m[1]+'-'+pad(m[2])+'-'+pad(m[3]);m=/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);if(m){let y=m[3].length===2?'20'+m[3]:m[3];return y+'-'+pad(m[2])+'-'+pad(m[1])}return ''}
function initials(name){return String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'•'}
function textOn(hex){let h=String(hex||'#666').replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');let r=parseInt(h.slice(0,2),16),g=parseInt(h.slice(2,4),16),b=parseInt(h.slice(4,6),16);return (r*299+g*587+b*114)/1000>150?'#111':'#fff'}
function leagueFlag(l,home,away){l=String(l||'');let teams=[home,away].filter(Boolean).map(String);
  for(const [re,f] of COUNTRY_FLAGS)if(re.test(l))return f;
  if(teams.some(t=>BR_TEAM.test(t)))return '🇧🇷';
  if(teams.some(t=>AR_TEAM.test(t)))return '🇦🇷';
  if(!l.trim())return '🌐';
  for(const [re,f] of COMP_FLAGS)if(re.test(l))return f;
  return '🌐'}
function sortKey(e){return (e.date||'0000-00-00')+' '+(e.time||'00:00')+' '+String(n(e.createdAt)).padStart(15,'0')}

/* ---------- icone ---------- */
const IC={
plus:'<path d="M12 5v14M5 12h14"/>',
swap:'<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
wallet:'<path d="M4 7h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a1 1 0 0 1-1-1z"/><path d="M4 7l11-3v3"/><circle cx="16" cy="13" r="1.3"/>',
refresh:'<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
down:'<path d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"/>',
up:'<path d="M12 16V5m0 0-4 4m4-4 4 4M5 19h14"/>',
chart:'<path d="M4 19h16"/><path d="M5 15l4-5 4 3 6-7"/>',
grid:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
filter:'<path d="M4 5h16l-6 7v6l-4 2v-8z"/>',
edit:'<path d="M4 20h4L19 9l-4-4L4 16z"/>',
copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
trash:'<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
check:'<path d="M5 12.5l4.5 4.5L19 7"/>',
x:'<path d="M6 6l12 12M18 6 6 18"/>',
undo:'<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
cloud:'<path d="M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z"/>',
search:'<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
save:'<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
book:'<path d="M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h10"/>',
chev:'<path d="M9 6l6 6-6 6"/>'
};
function ico(k,cls){return `<svg class="rg-ico ${cls||''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[k]||''}</svg>`}

/* ---------- stato ---------- */
function defaults(){return{v:1,savedAt:0,startBank:1000,books:DEFAULT_BOOKS.map(([name,color])=>({id:uid('bk'),name,color,start:0})),entries:[]}}
function normLeg(l){l=l||{};return{home:String(l.home||''),away:String(l.away||''),league:String(l.league||''),market:String(l.market||''),pick:String(l.pick||''),odds:n(l.odds,0),status:STATUS[l.status]&&['open','win','loss','void'].includes(l.status)?l.status:'open',date:String(l.date||''),time:String(l.time||'')}}
function normEntry(e){
  e=e&&typeof e==='object'?e:{};
  let base={id:String(e.id||uid('e')),kind:['bet','move','transfer'].includes(e.kind)?e.kind:'bet',createdAt:n(e.createdAt,Date.now()),date:toIso(e.date)||todayIso(),time:/^\d{1,2}:\d{2}$/.test(String(e.time||''))?String(e.time).padStart(5,'0'):'',note:String(e.note||'')};
  if(base.kind==='move')return Object.assign(base,{amount:n(e.amount),book:String(e.book||'')});
  if(base.kind==='transfer')return Object.assign(base,{amount:Math.abs(n(e.amount)),from:String(e.from||''),to:String(e.to||'')});
  return Object.assign(base,{sport:SPORTS[e.sport]?e.sport:'calcio',league:String(e.league||''),home:String(e.home||''),away:String(e.away||''),market:String(e.market||''),pick:String(e.pick||''),type:TYPES[e.type]?e.type:'singola',system:String(e.system||''),book:String(e.book||''),odds:n(e.odds,0),stake:Math.abs(n(e.stake)),freebet:!!e.freebet,bonus:Math.max(0,n(e.bonus,0)),status:STATUS[e.status]?e.status:'open',ret:n(e.ret,0),legs:Array.isArray(e.legs)?e.legs.map(normLeg):[],tags:Array.isArray(e.tags)?e.tags.map(String).filter(Boolean):String(e.tags||'').split(',').map(s=>s.trim()).filter(Boolean)});
}
function normalize(d){
  let x=defaults();if(!d||typeof d!=='object')return x;
  x.savedAt=n(d.savedAt,0);x.startBank=n(d.startBank,1000);
  if(Array.isArray(d.books)&&d.books.length)x.books=d.books.filter(b=>b&&b.name).map(b=>({id:String(b.id||uid('bk')),name:String(b.name),color:/^#[0-9a-f]{3,8}$/i.test(String(b.color||''))?b.color:'#5b6b7f',start:n(b.start,0)}));
  x.entries=Array.isArray(d.entries)?d.entries.map(normEntry):[];
  return x;
}
let data=(()=>{try{let raw=localStorage.getItem(KEY);return normalize(raw?JSON.parse(raw):null)}catch(_){return defaults()}})();
let ui=(()=>{let u={sort:'newest',last:'all',q:'',filtersOpen:false,panel:'',full:false,expanded:{},f:{sport:'',book:'',type:'',status:'',market:'',tag:'',from:'',to:''},limit:150};try{let s=JSON.parse(localStorage.getItem(UI_KEY)||'null');if(s){u.sort=s.sort==='oldest'?'oldest':'newest';u.last=s.last||'all';u.panel=s.panel||''}}catch(_){}return u})();
function saveUi(){try{localStorage.setItem(UI_KEY,JSON.stringify({sort:ui.sort,last:ui.last,panel:ui.panel}))}catch(_){}}

/* ---------- cloud sync ---------- */
let cloud={ready:false,at:0,status:'locale',timer:null,loading:false};
function localSave(){try{localStorage.setItem(KEY,JSON.stringify(data))}catch(_){}}
async function cloudPut(){if(!cloud.ready)return;try{let r=await fetch('/api/money-management/state/'+SECTION,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({state:data})});if(r.ok){let j=await r.json();cloud.at=n(j.updatedAt,Date.now());cloud.status='sincronizzato'}else{cloud.status=r.status===401||r.status===403?'solo locale · accedi':'errore sync'}}catch(_){cloud.status='offline · salvato in locale'}paintSync()}
function save(){data.savedAt=Date.now();localSave();clearTimeout(cloud.timer);cloud.timer=setTimeout(cloudPut,350);paint()}
async function cloudLoad(force){
  if(cloud.loading)return;cloud.loading=true;
  try{
    let r=await fetch('/api/money-management/state/'+SECTION+'?ts='+Date.now(),{cache:'no-store',credentials:'same-origin'});
    if(!r.ok){cloud.status=r.status===401||r.status===403?'solo locale · accedi':'errore sync';return}
    let j=await r.json(),remote=j&&j.state,at=n(j&&j.updatedAt,0);
    if(!cloud.ready){
      cloud.ready=true;
      if(remote&&n(remote.savedAt)>=n(data.savedAt)&&(remote.entries||[]).length>=0&&(n(remote.savedAt)>0||!data.entries.length)){data=normalize(remote);localSave();cloud.at=at;cloud.status='sincronizzato';paint();}
      else{await cloudPut()}
      return;
    }
    if(force&&remote&&n(remote.savedAt)>n(data.savedAt)){data=normalize(remote);localSave();cloud.at=at;cloud.status='sincronizzato';paint()}
    else cloud.status='sincronizzato';
  }catch(_){cloud.status='offline · salvato in locale'}
  finally{cloud.loading=false;paintSync()}
}

/* ---------- calcoli ---------- */
function bookById(id){return data.books.find(b=>b.id===id)||null}
function bookName(id){let b=bookById(id);return b?b.name:(id||'—')}
function legOdds(l){return l.status==='void'?1:n(l.odds,1)||1}
function multiStatus(b){if(!b.legs.length)return b.status;if(b.legs.some(l=>l.status==='loss'))return 'loss';if(b.legs.every(l=>l.status!=='open'))return b.legs.every(l=>l.status==='void')?'void':'win';return 'open'}
function betOdds(b){if(b.type==='multipla'&&b.legs.length)return r2(b.legs.reduce((p,l)=>p*legOdds(l),1));return n(b.odds)}
function betReturn(b){
  let s=n(b.stake),q=betOdds(b),fb=b.freebet;
  switch(b.status){
    case 'open':return null;
    case 'win':if(b.type==='sistema'&&n(b.ret)>0)return n(b.ret)+n(b.bonus);return (fb?s*(q-1):s*q)+n(b.bonus);
    case 'halfwin':return fb?s/2*(q-1):s/2*q+s/2;
    case 'halfloss':return fb?0:s/2;
    case 'void':return fb?0:s;
    case 'cashout':return n(b.ret);
    default:return 0;
  }
}
function betPL(b){let r=betReturn(b);if(r==null)return null;return r2(r-(b.freebet?0:n(b.stake)))}
function bets(list){return (list||data.entries).filter(e=>e.kind==='bet')}
function chrono(list){return list.slice().sort((a,b)=>sortKey(a).localeCompare(sortKey(b)))}
function totals(){
  let pl=0,mov=0,open=0,openN=0;
  for(const e of data.entries){
    if(e.kind==='bet'){let p=betPL(e);if(p==null){openN++;if(!e.freebet)open+=n(e.stake)}else pl+=p}
    else if(e.kind==='move')mov+=n(e.amount);
  }
  let patrimonio=n(data.startBank)+pl+mov;
  return{pl:r2(pl),mov:r2(mov),open:r2(open),openN,patrimonio:r2(patrimonio),cassa:r2(patrimonio-open)};
}
function stats(list){
  let bs=chrono(bets(list)),w=0,l=0,v=0,coUp=0,coDn=0,gw=0,gl=0,nw=0,nl=0,stakeSum=0,plSum=0,maxW=0,maxL=0,cw=0,cl=0,cur='',curN=0,hits=0,impl=0,decided=0;
  for(const b of bs){
    let p=betPL(b);if(p==null)continue;
    stakeSum+=n(b.stake);plSum+=p;
    if(b.status==='win'||b.status==='halfwin')w++;else if(b.status==='loss'||b.status==='halfloss')l++;else if(b.status==='void')v++;else if(b.status==='cashout'){if(p>=0)coUp++;else coDn++}
    if(p>0){gw+=p;nw++;cw++;cl=0;if(cw>maxW)maxW=cw;if(cur==='W')curN++;else{cur='W';curN=1}}
    else if(p<0){gl+=-p;nl++;cl++;cw=0;if(cl>maxL)maxL=cl;if(cur==='L')curN++;else{cur='L';curN=1}}
    let q=betOdds(b);if((b.status==='win'||b.status==='loss')&&q>1){decided++;impl+=1/q;if(b.status==='win')hits++}
  }
  return{w,l,v,coUp,coDn,maxW,maxL,streak:cur?cur+curN:'—',pf:gl?gw/gl:(gw?Infinity:0),avgW:nw?gw/nw:0,avgL:nl?-gl/nl:0,edge:decided?(hits/decided-impl/decided)*100:0,yield:stakeSum?plSum/stakeSum*100:0,pl:r2(plSum),settled:w+l+v+coUp+coDn,total:bs.length};
}
function bookBalances(){
  let m={};data.books.forEach(b=>m[b.id]={book:b,bal:n(b.start),open:0,pl:0,n:0});
  const g=id=>m[id]||(m[id]={book:{id,name:id||'Senza book',color:'#5b6b7f',start:0,ghost:true},bal:0,open:0,pl:0,n:0});
  for(const e of data.entries){
    if(e.kind==='move'){if(e.book)g(e.book).bal+=n(e.amount)}
    else if(e.kind==='transfer'){if(e.from)g(e.from).bal-=n(e.amount);if(e.to)g(e.to).bal+=n(e.amount)}
    else if(e.book){let x=g(e.book),p=betPL(e);x.n++;if(p==null){if(!e.freebet){x.bal-=n(e.stake);x.open+=n(e.stake)}}else{x.bal+=p;x.pl+=p}}
  }
  let alloc=data.books.reduce((s,b)=>s+n(b.start),0);
  let unbooked=data.entries.filter(e=>e.kind==='bet'&&!e.book).reduce((s,e)=>{let p=betPL(e);return s+(p==null?(e.freebet?0:-n(e.stake)):p)},0)+data.entries.filter(e=>e.kind==='move'&&!e.book).reduce((s,e)=>s+n(e.amount),0);
  return{rows:Object.values(m),free:r2(n(data.startBank)-alloc+unbooked)};
}
function betSeqMap(){let m={},i=0;chrono(bets()).forEach(b=>m[b.id]=++i);return m}

/* ---------- filtri ---------- */
function betText(e){return [e.home,e.away,e.league,e.market,e.pick,e.note,(e.tags||[]).join(' '),bookName(e.book),TYPES[e.type],STATUS[e.status],...(e.legs||[]).map(l=>[l.home,l.away,l.league,l.market,l.pick].join(' '))].join(' ').toLowerCase()}
function entryText(e){if(e.kind==='bet')return betText(e);if(e.kind==='move')return [n(e.amount)>=0?'deposito':'prelievo','movimento',bookName(e.book),e.note].join(' ').toLowerCase();return ['trasferimento',bookName(e.from),bookName(e.to),e.note].join(' ').toLowerCase()}
function betOnly(){let f=ui.f;return !!(f.sport||f.type||f.status||f.market||f.tag)}
function filtered(){
  let q=ui.q.trim().toLowerCase(),f=ui.f,out=data.entries.slice();
  if(ui.last!=='all'){let d=new Date();d.setDate(d.getDate()-(Number(ui.last)-1));let lim=d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());out=out.filter(e=>e.date>=lim)}
  if(f.from)out=out.filter(e=>e.date>=f.from);if(f.to)out=out.filter(e=>e.date<=f.to);
  if(betOnly())out=out.filter(e=>e.kind==='bet');
  if(f.sport)out=out.filter(e=>e.sport===f.sport);
  if(f.type)out=out.filter(e=>e.type===f.type);
  if(f.status)out=out.filter(e=>f.status==='co'?e.status==='cashout':(STATUS_CLASS[e.status]===f.status||e.status===f.status));
  if(f.market)out=out.filter(e=>(e.market||'').toLowerCase()===f.market.toLowerCase()||(e.legs||[]).some(l=>(l.market||'').toLowerCase()===f.market.toLowerCase()));
  if(f.tag)out=out.filter(e=>(e.tags||[]).some(t=>t.toLowerCase()===f.tag.toLowerCase()));
  if(f.book)out=out.filter(e=>e.kind==='bet'||e.kind==='move'?e.book===f.book:(e.from===f.book||e.to===f.book));
  if(q)out=out.filter(e=>entryText(e).includes(q));
  out.sort((a,b)=>sortKey(a).localeCompare(sortKey(b)));if(ui.sort==='newest')out.reverse();
  return out;
}
function activeFilterCount(){return Object.values(ui.f).filter(Boolean).length}

/* ---------- render ---------- */
function root(){return document.getElementById('moneyBoard')}
function mount(){
  let r=root();if(!r)return false;
  if(r.dataset.rg==='1'&&r.querySelector('#rgBody'))return true;
  r.innerHTML=`<div class="rg ${ui.full?'rg-full':''}" id="rgApp">
    <div class="rg-topbar">
      <label class="rg-search">${ico('search')}<input id="rgSearch" type="search" autocomplete="off" placeholder="Cerca evento, pronostico, tag…"></label>
      <span class="rg-sync" id="rgSync" title="Stato sincronizzazione">${ico('cloud')}<b>locale</b></span>
      <button type="button" class="rg-btn" data-rg="toggle-filters" id="rgFiltersBtn">${ico('filter')}<span>Filtri</span></button>
      <button type="button" class="rg-btn" data-rg="export">${ico('down')}<span>Esporta CSV</span></button>
      <button type="button" class="rg-btn primary" data-rg="new-bet">${ico('plus')}<span>Nuova bet</span></button>
    </div>
    <div id="rgBody"></div>
    <input type="file" id="rgImportFile" accept=".csv,.json,text/csv,application/json" hidden>
  </div>`;
  r.dataset.rg='1';
  let s=r.querySelector('#rgSearch');s.value=ui.q;
  s.addEventListener('input',()=>{ui.q=s.value;ui.limit=150;paint()});
  r.querySelector('#rgImportFile').addEventListener('change',onImportFile);
  return true;
}
function paintSync(){let el=document.getElementById('rgSync');if(!el)return;let ok=cloud.status==='sincronizzato';el.className='rg-sync '+(ok?'ok':'warn');el.querySelector('b').textContent=cloud.status}
function kpi(label,value,cls,extra){return `<div class="rg-kpi ${cls||''}">${extra||''}<small>${label}</small><b>${value}</b></div>`}
function chip(label,value,cls,title){return `<div class="rg-chip ${cls||''}" ${title?`title="${esc(title)}"`:''}><span>${label}</span><b>${value}</b></div>`}
function headHtml(list){
  let t=totals(),all=bets().length,shown=bets(list).length;
  let s=stats(list),pf=s.pf===Infinity?'∞':s.pf.toFixed(2);
  return `<div class="rg-head">
    <div class="rg-title"><h2>Registro scommesse</h2><span class="rg-count">${shown} di ${all} scommesse</span></div>
    <div class="rg-kpis">
      <label class="rg-kpi edit" title="Clicca per modificare la cassa iniziale"><small>Cassa iniziale ${ico('edit','tiny')}</small><input id="rgStartBank" inputmode="decimal" value="${esc(r2(data.startBank).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}))}"><em>€</em></label>
      ${kpi('Cassa',money(t.cassa),'big '+(t.cassa>=data.startBank?'pos':'neg'))}
      ${kpi('P/L totale',money(t.pl,true),t.pl>=0?'pos':'neg')}
      ${kpi('Movimenti',money(t.mov,true),t.mov>0?'pos':t.mov<0?'neg':'')}
      ${kpi(`In gioco, ${t.openN} apert${t.openN===1?'a':'e'}`,money(t.open),'')}
      ${kpi('Patrimonio',money(t.patrimonio),'')}
      <div class="rg-kpi-tools">
        <button type="button" class="${ui.panel==='conti'?'on':''}" data-rg="panel" data-p="conti" title="Conti / saldo per book">${ico('wallet')}</button>
        <button type="button" class="${ui.panel==='grafico'?'on':''}" data-rg="panel" data-p="grafico" title="Andamento patrimonio">${ico('chart')}</button>
        <button type="button" class="${ui.panel==='analisi'?'on':''}" data-rg="panel" data-p="analisi" title="Analisi per book, tipo, mercato, tag">${ico('grid')}</button>
      </div>
    </div>
  </div>
  <div class="rg-chips">
    ${chip('Vinte',s.w,'win')}${chip('Perse',s.l,'loss')}${chip('Void',s.v,'void')}
    ${chip('CO',`<i class="up">▲${s.coUp}</i><i class="dn">▼${s.coDn}</i>`,'','Cash out in profitto ▲ / in perdita ▼')}
    ${chip('Max W',s.maxW,'pos','Serie vincente più lunga')}${chip('Max L',s.maxL,'neg','Serie perdente più lunga')}
    <span class="rg-sep"></span>
    ${chip('Streak',s.streak,s.streak[0]==='W'?'pos':s.streak[0]==='L'?'neg':'','Serie in corso')}
    ${chip('PF',pf,s.pf>=1?'pos':'neg','Profit factor = vincite lorde / perdite lorde')}
    ${chip('Vinc. med.',money(s.avgW),'pos','Profitto medio delle giocate in attivo')}
    ${chip('Perd. med.',money(s.avgL),'neg','Perdita media delle giocate in passivo')}
    ${chip('Yield',(s.yield>=0?'+':'')+s.yield.toFixed(1)+'%',s.yield>=0?'pos':'neg','P/L ÷ totale puntato')}
    ${chip('Edge',(s.edge>=0?'+':'')+s.edge.toFixed(1)+' pt',s.edge>=0?'pos':'neg','% vinte reale − % implicita nelle quote (solo vinte/perse)')}
  </div>`;
}
function opt(v,l,sel){return `<option value="${esc(v)}" ${String(v)===String(sel)?'selected':''}>${esc(l)}</option>`}
function allTags(){let s=new Set();data.entries.forEach(e=>(e.tags||[]).forEach(t=>s.add(t)));return [...s].sort((a,b)=>a.localeCompare(b))}
function allMarkets(){let s=new Set(MARKETS);data.entries.forEach(e=>{if(e.market)s.add(e.market);(e.legs||[]).forEach(l=>l.market&&s.add(l.market))});return [...s]}
function allLeagues(){let s=new Set();data.entries.forEach(e=>{if(e.league)s.add(e.league);(e.legs||[]).forEach(l=>l.league&&s.add(l.league))});return [...s].sort()}
function filtersHtml(){
  if(!ui.filtersOpen)return '';let f=ui.f;
  return `<div class="rg-filters">
    <label>Sport<select data-rgf="sport">${opt('','Tutti',f.sport)}${Object.entries(SPORTS).map(([k,v])=>opt(k,v[0]+' '+v[1],f.sport)).join('')}</select></label>
    <label>Book<select data-rgf="book">${opt('','Tutti',f.book)}${data.books.map(b=>opt(b.id,b.name,f.book)).join('')}</select></label>
    <label>Tipo<select data-rgf="type">${opt('','Tutti',f.type)}${Object.entries(TYPES).map(([k,v])=>opt(k,v,f.type)).join('')}</select></label>
    <label>Esito<select data-rgf="status">${opt('','Tutti',f.status)}${opt('open','In corso',f.status)}${opt('win','Vinte (anche ½)',f.status)}${opt('loss','Perse (anche ½)',f.status)}${opt('void','Void',f.status)}${opt('co','Cash Out',f.status)}</select></label>
    <label>Mercato<select data-rgf="market">${opt('','Tutti',f.market)}${allMarkets().map(m=>opt(m,m,f.market)).join('')}</select></label>
    <label>Tag<select data-rgf="tag">${opt('','Tutti',f.tag)}${allTags().map(t=>opt(t,t,f.tag)).join('')}</select></label>
    <label>Dal<input type="date" data-rgf="from" value="${esc(f.from)}"></label>
    <label>Al<input type="date" data-rgf="to" value="${esc(f.to)}"></label>
    <button type="button" class="rg-btn ghost" data-rg="clear-filters">Azzera filtri</button>
    <small class="rg-filters-note">Le statistiche (Vinte, PF, Edge…) seguono i filtri. Cassa e Patrimonio restano sempre totali.</small>
  </div>`;
}
function bookChip(id,small){let b=bookById(id);if(!id)return '<span class="rg-dim">—</span>';let c=b?b.color:'#5b6b7f',name=b?b.name:id;return `<span class="rg-book ${small?'sm':''}" title="${esc(name)}"><i style="background:${esc(c)};color:${textOn(c)}">${esc(initials(name))}</i>${small?'':`<em>${esc(name)}</em>`}</span>`}
function crest(name,league){return `<span class="rg-crest rg-js-crest" data-team="${esc(name||'')}" data-league="${esc(league||'')}"><img alt="" style="display:none"><span>${esc(initials(name))}</span></span>`}
function eventHtml(home,away,sport,league){if(!home&&!away)return '<span class="rg-dim">—</span>';if(!away)return `<span class="rg-ev"><b>${esc(home)}</b></span>`;let c=sport==='calcio';return `<span class="rg-ev">${c?crest(home,league):''}<b>${esc(home)}</b><span class="rg-vs">–</span><b>${esc(away)}</b>${c?crest(away,league):''}</span>`}
function pickHtml(market,pick){if(!market&&!pick)return '<span class="rg-dim">—</span>';return `<span class="rg-pick">${market?`<i>${esc(market)}</i>`:''}<b>${esc(pick||'—')}</b></span>`}
function statusPill(s){return `<span class="rg-status ${STATUS_CLASS[s]||''}">${esc(STATUS[s]||s)}</span>`}
function oddsBar(q){let p=Math.max(4,Math.min(100,Math.log(Math.max(q,1))/Math.log(10)*100));return `<span class="rg-bar"><i style="width:${p.toFixed(0)}%"></i></span>`}
function stakeBar(s,max){let p=max?Math.max(4,Math.min(100,s/max*100)):0;return `<span class="rg-bar stake"><i style="width:${p.toFixed(0)}%"></i></span>`}
function betRow(b,seq,maxStake){
  let q=betOdds(b),pl=betPL(b),multi=b.type!=='singola'&&b.legs.length,exp=!!ui.expanded[b.id];
  let ev=multi?`<button type="button" class="rg-legs-toggle ${exp?'open':''}" data-rg="toggle-legs" data-id="${b.id}">${ico('chev')}<b>${b.legs.length} selezioni</b><small>${esc(b.legs.slice(0,2).map(l=>l.home+(l.away?' - '+l.away:'')).join(' · '))}${b.legs.length>2?' …':''}</small></button>`:eventHtml(b.home,b.away,b.sport,b.league);
  let legsWon=multi?b.legs.filter(l=>l.status==='win').length:0,legsLost=multi?b.legs.filter(l=>l.status==='loss').length:0;
  let pk=multi?`<span class="rg-pick multi"><i>${b.type==='sistema'?esc(b.system||'Sistema'):'Multipla'}</i><b>${legsWon}✓ ${legsLost}✗ / ${b.legs.length}</b></span>`:pickHtml(b.market,b.pick);
  let open=b.status==='open';
  let quick=open?`<span class="rg-quick"><button type="button" class="w" data-rg="settle" data-s="win" data-id="${b.id}" title="Vinta">${ico('check')}</button><button type="button" class="l" data-rg="settle" data-s="loss" data-id="${b.id}" title="Persa">${ico('x')}</button><button type="button" class="v" data-rg="settle" data-s="void" data-id="${b.id}" title="Void / rimborsata">V</button><button type="button" class="c" data-rg="settle" data-s="cashout" data-id="${b.id}" title="Cash out">CO</button></span>`:`<span class="rg-quick"><button type="button" class="u" data-rg="settle" data-s="open" data-id="${b.id}" title="Riapri (torna In corso)">${ico('undo')}</button></span>`;
  let row=`<tr class="rg-row bet st-${STATUS_CLASS[b.status]}" data-id="${b.id}">
    <td class="c-num"><span class="rg-edge"></span><b>${seq||''}</b></td>
    <td class="c-date"><b>${dateShort(b.date)}</b><small>${esc(b.time||'')}</small></td>
    <td class="c-sport"><span class="rg-sport" title="${esc(SPORTS[b.sport][1])}">${SPORTS[b.sport][0]}</span></td>
    <td class="c-league">${multi?'<span class="rg-dim">—</span>':`<span class="rg-league"><i>${leagueFlag(b.league,b.home,b.away)}</i>${esc(b.league||'—')}</span>`}</td>
    <td class="c-event">${ev}</td>
    <td class="c-pick">${pk}</td>
    <td class="c-type"><span class="rg-type ${b.type}">${TYPES[b.type]}</span>${b.freebet?'<span class="rg-fb">FREEBET</span>':''}${n(b.bonus)>0?`<span class="rg-fb bonus">BONUS +${money(b.bonus)}</span>`:''}</td>
    <td class="c-book">${bookChip(b.book)}</td>
    <td class="c-odds"><b>${fmtOdds(q)}</b>${oddsBar(q)}</td>
    <td class="c-stake"><b>${money(b.stake)}</b>${stakeBar(n(b.stake),maxStake)}</td>
    <td class="c-status">${statusPill(b.status)}${quick}</td>
    <td class="c-pl ${pl==null?'':pl>0?'pos':pl<0?'neg':''}">${pl==null?`<small class="rg-dim">pot. ${money((b.freebet?n(b.stake)*(q-1):n(b.stake)*q)+n(b.bonus))}</small>`:`<b>${money(pl,true)}</b>`}</td>
    <td class="c-note">${(b.tags||[]).map(t=>`<span class="rg-tag" data-rg="tag" data-t="${esc(t)}">#${esc(t)}</span>`).join('')}${b.note?`<small title="${esc(b.note)}">${esc(b.note)}</small>`:''}</td>
    <td class="c-act"><button type="button" data-rg="edit" data-id="${b.id}" title="Modifica">${ico('edit')}</button><button type="button" data-rg="dup" data-id="${b.id}" title="Duplica">${ico('copy')}</button><button type="button" data-rg="del" data-id="${b.id}" title="Elimina">${ico('trash')}</button></td>
  </tr>`;
  if(multi&&exp){row+=b.legs.map((l,i)=>`<tr class="rg-row leg st-${STATUS_CLASS[l.status]}">
    <td class="c-num"><span class="rg-legline"></span></td><td class="c-date"><small>${l.date?dateShort(l.date):''} ${esc(l.time||'')}</small></td><td></td>
    <td class="c-league"><span class="rg-league"><i>${leagueFlag(l.league,l.home,l.away)}</i>${esc(l.league||'—')}</span></td>
    <td class="c-event">${eventHtml(l.home,l.away,b.sport,l.league)}</td><td class="c-pick">${pickHtml(l.market,l.pick)}</td><td colspan="2"><small class="rg-dim">selezione ${i+1}</small></td>
    <td class="c-odds"><b>${fmtOdds(l.odds)}</b></td><td></td>
    <td class="c-status" colspan="4"><span class="rg-legst">${['open','win','loss','void'].map(s=>`<button type="button" class="${l.status===s?'on '+STATUS_CLASS[s]:''}" data-rg="leg" data-id="${b.id}" data-i="${i}" data-s="${s}">${s==='open'?'In corso':STATUS[s]}</button>`).join('')}</span></td>
  </tr>`).join('')}
  return row;
}
function moveRow(e){
  if(e.kind==='transfer')return `<tr class="rg-row xfer"><td class="c-num"><span class="rg-edge"></span><span class="rg-xico">${ico('swap')}</span></td><td class="c-date"><b>${dateShort(e.date)}</b><small>${esc(e.time||'')}</small></td>
    <td colspan="11" class="c-xfer"><div class="rg-xfer"><span class="rg-xtag">${ico('swap')}TRASFERIMENTO</span>${bookChip(e.from)}<span class="rg-arrow"><b>${money(e.amount)}</b><i></i></span>${bookChip(e.to)}<span class="rg-xnote"><em>cassa totale invariata</em>${e.note?` <q>${esc(e.note)}</q>`:''}</span></div></td>
    <td class="c-act"><button type="button" data-rg="edit" data-id="${e.id}" title="Modifica">${ico('edit')}</button><button type="button" data-rg="del" data-id="${e.id}" title="Elimina">${ico('trash')}</button></td></tr>`;
  let dep=n(e.amount)>=0;
  return `<tr class="rg-row move ${dep?'dep':'wd'}"><td class="c-num"><span class="rg-edge"></span><span class="rg-xico">${ico(dep?'down':'up')}</span></td><td class="c-date"><b>${dateShort(e.date)}</b><small>${esc(e.time||'')}</small></td>
    <td colspan="11" class="c-xfer"><div class="rg-xfer"><span class="rg-xtag ${dep?'dep':'wd'}">${ico('wallet')}${dep?'DEPOSITO':'PRELIEVO'}</span>${bookChip(e.book)}<span class="rg-amount ${dep?'pos':'neg'}">${money(e.amount,true)}</span><span class="rg-xnote"><em>${dep?'entra in cassa':'esce dalla cassa'}</em>${e.note?` <q>${esc(e.note)}</q>`:''}</span></div></td>
    <td class="c-act"><button type="button" data-rg="edit" data-id="${e.id}" title="Modifica">${ico('edit')}</button><button type="button" data-rg="del" data-id="${e.id}" title="Elimina">${ico('trash')}</button></td></tr>`;
}
function diaryHtml(list){
  let seq=betSeqMap(),maxStake=Math.max(1,...bets().map(b=>n(b.stake))),rows=list.slice(0,ui.limit);
  let body=rows.length?rows.map(e=>e.kind==='bet'?betRow(e,seq[e.id],maxStake):moveRow(e)).join(''):`<tr><td colspan="14" class="rg-empty">${data.entries.length?'Nessuna operazione con questi filtri.':'Nessuna operazione registrata. Premi <b>+ Nuova bet</b> per iniziare.'}</td></tr>`;
  let more=list.length>rows.length?`<div class="rg-more"><button type="button" class="rg-btn ghost" data-rg="more">Mostra altre ${Math.min(150,list.length-rows.length)} (${list.length-rows.length} rimanenti)</button></div>`:'';
  return `<div class="rg-diary">
    <div class="rg-diary-head">
      <h3>Diario delle operazioni</h3>
      <div class="rg-tools">
        <button type="button" data-rg="new-bet" title="Nuova bet">${ico('plus')}</button>
        <button type="button" data-rg="new-transfer" title="Trasferimento tra book">${ico('swap')}</button>
        <button type="button" data-rg="new-move" title="Deposito / prelievo">${ico('wallet')}</button>
        <button type="button" data-rg="sync" title="Ricarica dal cloud">${ico('refresh')}</button>
        <button type="button" data-rg="export" title="Esporta CSV">${ico('down')}</button>
        <button type="button" data-rg="import" title="Importa CSV o backup JSON">${ico('up')}</button>
        <button type="button" data-rg="backup" title="Backup completo JSON">${ico('save')}</button>
        <button type="button" data-rg="panel" data-p="grafico" title="Grafico">${ico('chart')}</button>
        <button type="button" data-rg="full" title="Schermo intero">${ico('expand')}</button>
      </div>
      <div class="rg-seg"><span>Last</span>${['all','1','3','5','10'].map(v=>`<button type="button" class="${ui.last===v?'on':''}" data-rg="last" data-v="${v}" title="${v==='all'?'Tutto':'Ultimi '+v+' giorni'}">${v==='all'?'All':v}</button>`).join('')}</div>
      <div class="rg-seg"><span>Sort</span><button type="button" class="${ui.sort==='newest'?'on':''}" data-rg="sort" data-v="newest">Newest ↓</button><button type="button" class="${ui.sort==='oldest'?'on':''}" data-rg="sort" data-v="oldest">Oldest ↑</button></div>
    </div>
    <div class="rg-table-wrap"><table class="rg-table">
      <thead><tr><th>#</th><th>Data</th><th>Sport</th><th>Torneo/Info</th><th>Evento</th><th>Pronostico</th><th>Tipo</th><th>Book</th><th>Quota</th><th>Stake</th><th>Esito</th><th>P/L</th><th>Tag / Note</th><th></th></tr></thead>
      <tbody>${body}</tbody>
    </table></div>${more}
  </div>`;
}
/* --- pannelli --- */
function contiHtml(){
  let bb=bookBalances(),tot=bb.rows.reduce((s,r)=>s+r.bal,0)+bb.free;
  return `<div class="rg-panel"><div class="rg-panel-head"><h3>Conti per book</h3><p>Saldo iniziale di ogni book: la parte di cassa iniziale non assegnata resta in <b>Non allocato</b>. I trasferimenti spostano soldi tra book senza cambiare la cassa totale.</p></div>
  <div class="rg-books">${bb.rows.map(r=>`<div class="rg-bookcard ${r.book.ghost?'ghost':''}">
    <div class="rg-bookcard-top">${r.book.ghost?bookChip(r.book.id,true):`<input type="color" value="${esc(r.book.color)}" data-rgb="color" data-id="${r.book.id}" title="Colore">`}<input class="rg-bname" value="${esc(r.book.name)}" ${r.book.ghost?'disabled':''} data-rgb="name" data-id="${r.book.id}">${r.book.ghost?'':`<button type="button" data-rg="del-book" data-id="${r.book.id}" title="Elimina book">${ico('trash')}</button>`}</div>
    <div class="rg-bookcard-bal ${r.bal<0?'neg':''}">${money(r.bal)}</div>
    <div class="rg-bookcard-meta"><span>P/L <b class="${r.pl>=0?'pos':'neg'}">${money(r.pl,true)}</b></span><span>In gioco <b>${money(r.open)}</b></span><span>${r.n} bet</span></div>
    ${r.book.ghost?'':`<label class="rg-bookcard-start">Saldo iniziale<input inputmode="decimal" value="${esc(String(r2(r.book.start)).replace('.',','))}" data-rgb="start" data-id="${r.book.id}"></label>`}
  </div>`).join('')}
  <div class="rg-bookcard free"><div class="rg-bookcard-top"><b>Non allocato</b></div><div class="rg-bookcard-bal ${bb.free<0?'neg':''}">${money(bb.free)}</div><div class="rg-bookcard-meta"><span>Totale conti <b>${money(tot)}</b></span></div></div>
  <button type="button" class="rg-bookcard add" data-rg="add-book">${ico('plus')}<span>Aggiungi book</span></button></div></div>`;
}
function equitySeries(){
  let ev=chrono(data.entries.filter(e=>e.kind==='move'||(e.kind==='bet'&&betPL(e)!=null))),v=n(data.startBank),pts=[{v,label:'Cassa iniziale',d:''}];
  ev.forEach(e=>{if(e.kind==='move'){v+=n(e.amount);pts.push({v,label:(n(e.amount)>=0?'Deposito ':'Prelievo ')+money(e.amount,true),d:e.date})}else{let p=betPL(e);v+=p;pts.push({v,label:(e.type==='singola'?((e.home||'')+(e.away?' - '+e.away:'')):TYPES[e.type]+' '+e.legs.length+' sel.')+' · '+money(p,true),d:e.date})}});
  return pts;
}
function graficoHtml(){
  let pts=equitySeries();
  if(pts.length<2)return `<div class="rg-panel"><div class="rg-panel-head"><h3>Andamento patrimonio</h3><p>Il grafico appare dopo la prima scommessa chiusa.</p></div></div>`;
  let W=1000,H=240,P={l:62,r:16,t:16,b:26},vals=pts.map(p=>p.v),mn=Math.min(...vals),mx=Math.max(...vals);if(mx-mn<1){mx+=1;mn-=1}let pad2=(mx-mn)*.08;mn-=pad2;mx+=pad2;
  let X=i=>P.l+(W-P.l-P.r)*(pts.length===1?0:i/(pts.length-1)),Y=v=>P.t+(H-P.t-P.b)*(1-(v-mn)/(mx-mn));
  let line=pts.map((p,i)=>(i?'L':'M')+X(i).toFixed(1)+' '+Y(p.v).toFixed(1)).join(' ');
  let area=line+` L${X(pts.length-1).toFixed(1)} ${H-P.b} L${X(0).toFixed(1)} ${H-P.b} Z`;
  let ticks=[mn+(mx-mn)*.1,(mn+mx)/2,mx-(mx-mn)*.1];
  let base=Y(n(data.startBank));
  let last=pts[pts.length-1].v,t=totals();
  return `<div class="rg-panel"><div class="rg-panel-head"><h3>Andamento patrimonio</h3><p>${pts.length-1} operazioni chiuse · ora <b>${money(last)}</b> · P/L scommesse <b class="${t.pl>=0?'pos':'neg'}">${money(t.pl,true)}</b> · movimenti <b>${money(t.mov,true)}</b></p></div>
  <div class="rg-chart" id="rgChart" data-n="${pts.length}"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Andamento del patrimonio">
    <defs><linearGradient id="rgArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--rg-accent)" stop-opacity=".28"/><stop offset="1" stop-color="var(--rg-accent)" stop-opacity="0"/></linearGradient></defs>
    ${ticks.map(t=>`<line x1="${P.l}" x2="${W-P.r}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}" class="grid"/><text x="${P.l-8}" y="${(Y(t)+4).toFixed(1)}" text-anchor="end" class="ax">${Math.round(t).toLocaleString('it-IT')}</text>`).join('')}
    <line x1="${P.l}" x2="${W-P.r}" y1="${base.toFixed(1)}" y2="${base.toFixed(1)}" class="base"/>
    <path d="${area}" fill="url(#rgArea)"/><path d="${line}" class="ln" fill="none"/>
    <line class="cross" id="rgCross" x1="0" x2="0" y1="${P.t}" y2="${H-P.b}" style="display:none"/><circle id="rgDot" r="5" class="dot" style="display:none"/>
  </svg><div class="rg-tip" id="rgTip" style="display:none"></div></div></div>`;
}
function groupStats(keyFn){let m={};bets().forEach(b=>{let ks=keyFn(b);(Array.isArray(ks)?ks:[ks]).forEach(k=>{k=k||'—';(m[k]||(m[k]=[])).push(b)})});return Object.entries(m).map(([k,list])=>({k,s:stats(list),stake:list.reduce((a,b)=>a+(betPL(b)==null?0:n(b.stake)),0)})).sort((a,b)=>b.s.pl-a.s.pl)}
function anTable(title,rows){return `<div class="rg-an"><h4>${title}</h4><table><thead><tr><th></th><th>Bet</th><th>V-P</th><th>Puntato</th><th>P/L</th><th>Yield</th></tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td>${esc(r.k)}</td><td>${r.s.total}</td><td>${r.s.w}-${r.s.l}</td><td>${money(r.stake)}</td><td class="${r.s.pl>=0?'pos':'neg'}">${money(r.s.pl,true)}</td><td class="${r.s.yield>=0?'pos':'neg'}">${r.s.yield.toFixed(1)}%</td></tr>`).join(''):'<tr><td colspan="6" class="rg-dim">Nessun dato</td></tr>'}</tbody></table></div>`}
function oddsBand(b){let q=betOdds(b);return q<1.5?'< 1.50':q<2?'1.50–1.99':q<3?'2.00–2.99':q<5?'3.00–4.99':'5.00+'}
function analisiHtml(){
  return `<div class="rg-panel"><div class="rg-panel-head"><h3>Analisi</h3><p>Solo scommesse chiuse nel P/L e nello yield.</p></div><div class="rg-an-grid">
    ${anTable('Per book',groupStats(b=>bookName(b.book)))}
    ${anTable('Per tipo',groupStats(b=>TYPES[b.type]))}
    ${anTable('Per mercato',groupStats(b=>b.type==='singola'?(b.market||'—'):TYPES[b.type]))}
    ${anTable('Per fascia di quota',groupStats(oddsBand))}
    ${anTable('Per torneo',groupStats(b=>b.type==='singola'?(b.league||'—'):'(multiple)'))}
    ${anTable('Per tag',groupStats(b=>b.tags.length?b.tags:['senza tag']))}
  </div></div>`;
}
function paint(){
  if(!mount())return;
  let body=document.getElementById('rgBody');if(!body)return;
  let sx=0,wrap=body.querySelector('.rg-table-wrap');if(wrap)sx=wrap.scrollLeft;
  let list=filtered();
  let panel=ui.panel==='conti'?contiHtml():ui.panel==='grafico'?graficoHtml():ui.panel==='analisi'?analisiHtml():'';
  body.innerHTML=headHtml(list)+filtersHtml()+panel+diaryHtml(list);
  let fb=document.getElementById('rgFiltersBtn');if(fb){let c=activeFilterCount();fb.classList.toggle('on',ui.filtersOpen||c>0);fb.querySelector('span').textContent=c?'Filtri ('+c+')':'Filtri'}
  let app=document.getElementById('rgApp');if(app)app.classList.toggle('rg-full',!!ui.full);
  document.body.classList.toggle('rg-noscroll',!!ui.full);
  wrap=body.querySelector('.rg-table-wrap');if(wrap)wrap.scrollLeft=sx;
  paintSync();hydrateCrests();bindChart();
}
function hydrateCrests(){
  document.querySelectorAll('#moneyBoard .rg-js-crest').forEach(el=>{
    if(el.dataset.loaded||el.dataset.loading)return;let team=el.dataset.team;if(!team)return;
    let cached=crestCache[team.toLowerCase()];if(cached!==undefined){applyCrest(el,cached);return}
    el.dataset.loading='1';
    fetch('/api/team-crest?name='+encodeURIComponent(team)+(el.dataset.league?'&country='+encodeURIComponent(el.dataset.league):''),{cache:'force-cache'}).then(r=>r.ok?r.json():null).then(d=>{crestCache[team.toLowerCase()]=d&&d.url||'';applyCrest(el,crestCache[team.toLowerCase()])}).catch(()=>{}).finally(()=>{delete el.dataset.loading});
  });
}
const crestCache={};
function applyCrest(el,url){el.dataset.loaded='1';if(!url)return;let img=el.querySelector('img');img.src=url;img.style.display='block';el.classList.add('has')}
function bindChart(){
  let box=document.getElementById('rgChart');if(!box)return;let pts=equitySeries(),svg=box.querySelector('svg'),tip=document.getElementById('rgTip'),cross=document.getElementById('rgCross'),dot=document.getElementById('rgDot');
  let W=1000,H=240,P={l:62,r:16,t:16,b:26},vals=pts.map(p=>p.v),mn=Math.min(...vals),mx=Math.max(...vals);if(mx-mn<1){mx+=1;mn-=1}let pd=(mx-mn)*.08;mn-=pd;mx+=pd;
  let X=i=>P.l+(W-P.l-P.r)*(i/(pts.length-1)),Y=v=>P.t+(H-P.t-P.b)*(1-(v-mn)/(mx-mn));
  box.onmousemove=ev=>{let r=svg.getBoundingClientRect(),x=(ev.clientX-r.left)/r.width*W,i=Math.round((x-P.l)/(W-P.l-P.r)*(pts.length-1));i=Math.max(0,Math.min(pts.length-1,i));let p=pts[i];
    cross.setAttribute('x1',X(i));cross.setAttribute('x2',X(i));cross.style.display='';dot.setAttribute('cx',X(i));dot.setAttribute('cy',Y(p.v));dot.style.display='';
    tip.innerHTML=`<small>${p.d?dateShort(p.d):'Inizio'} · #${i}</small><b>${money(p.v)}</b><span>${esc(p.label)}</span>`;tip.style.display='';
    let px=X(i)/W*r.width,left=Math.min(r.width-190,Math.max(0,px+12));tip.style.left=left+'px';tip.style.top=Math.max(0,Y(p.v)/H*r.height-60)+'px'};
  box.onmouseleave=()=>{tip.style.display='none';cross.style.display='none';dot.style.display='none'};
}

/* ---------- modali ---------- */
let modal=null; /* {type, draft, id} */
function closeModal(){modal=null;let o=document.getElementById('rgOverlay');if(o)o.remove()}
function openModalShell(html,wide){
  let o=document.getElementById('rgOverlay');
  if(!o){o=document.createElement('div');o.id='rgOverlay';o.className='rg-overlay';document.body.appendChild(o);
    o.addEventListener('mousedown',e=>{if(e.target===o)closeModal()});
    o.addEventListener('click',onModalClick);o.addEventListener('paste',e=>{if(modal&&modal.imp&&e.target.classList&&e.target.classList.contains('rg-imp-raw'))setTimeout(()=>{modal.imp.raw=e.target.value;analyzePaste()},0)});o.addEventListener('input',onModalInput);o.addEventListener('change',onModalInput);
  }
  o.innerHTML=`<div class="rg-modal ${wide?'wide':''}" role="dialog" aria-modal="true">${html}</div>`;
}
function bookOptions(sel,empty){return (empty?opt('',empty,sel):'')+data.books.map(b=>opt(b.id,b.name,sel)).join('')+opt('__new','+ Nuovo book…','')}
function lastBetDefaults(){let last=chrono(bets()).pop();return{book:last?last.book:(data.books[0]&&data.books[0].id)||'',stake:last?last.stake:10,sport:last?last.sport:'calcio'}}
function blankBet(){let d=lastBetDefaults();return{kind:'bet',date:todayIso(),time:nowTime(),sport:d.sport,league:'',home:'',away:'',market:'1X2',pick:'',type:'singola',system:'',book:d.book,odds:'',stake:d.stake,freebet:false,bonus:'',status:'open',ret:'',legs:[],tags:'',note:''}}
function draftFrom(e){let x=JSON.parse(JSON.stringify(e));x.tags=(e.tags||[]).join(', ');x.odds=e.odds||'';x.ret=e.ret||'';x.bonus=e.bonus?String(e.bonus).replace('.',','):'';return x}
function openBet(id,dup){
  let e=id?data.entries.find(x=>x.id===id):null;
  let d=e?draftFrom(e):blankBet();
  if(dup){d.status='open';d.ret='';d.date=todayIso();d.time=nowTime();d.legs=(d.legs||[]).map(l=>Object.assign({},l,{status:'open'}))}
  if(d.type!=='singola'&&!d.legs.length)d.legs=[blankLeg(),blankLeg()];
  modal={type:'bet',id:dup?null:id,draft:d};renderBetModal();
}
function blankLeg(){return{home:'',away:'',league:'',market:'1X2',pick:'',odds:'',status:'open',date:todayIso(),time:''}}
function draftOdds(d){if(d.type==='multipla'&&d.legs.length)return d.legs.reduce((p,l)=>p*(l.status==='void'?1:(num(l.odds)||1)),1);return num(d.odds)||0}
function renderBetModal(focusSel){
  if(modal.imp){renderImporter();return}
  let d=modal.draft,edit=!!modal.id,multi=d.type!=='singola';
  let q=draftOdds(d),stake=num(d.stake)||0;
  let pot=(d.freebet?stake*(q-1):stake*q)+(num(d.bonus)||0);
  let needRet=d.status==='cashout'||(d.type==='sistema'&&d.status==='win');
  let leagues=allLeagues(),markets=allMarkets();
  let legs=multi?`<div class="rg-legs-ed"><div class="rg-legs-head"><b>Selezioni (${d.legs.length})</b><span><button type="button" class="rg-btn ghost sm accent" data-m="imp-open">📋 Incolla bolletta</button><button type="button" class="rg-btn ghost sm" data-m="pick-leg">${ico('book')}Dal Betting classico</button><button type="button" class="rg-btn ghost sm" data-m="add-leg">${ico('plus')}Selezione</button></span></div>
    ${d.legs.map((l,i)=>`<div class="rg-leg-ed">
      <input placeholder="Casa" value="${esc(l.home)}" data-l="${i}" data-lf="home"><input placeholder="Ospite" value="${esc(l.away)}" data-l="${i}" data-lf="away">
      <input placeholder="Torneo" list="rgLeagues" value="${esc(l.league)}" data-l="${i}" data-lf="league"><input placeholder="Mercato" list="rgMarkets" value="${esc(l.market)}" data-l="${i}" data-lf="market">
      <input placeholder="Pronostico" value="${esc(l.pick)}" data-l="${i}" data-lf="pick"><input placeholder="Quota" inputmode="decimal" value="${esc(l.odds)}" data-l="${i}" data-lf="odds" class="q">
      <select data-l="${i}" data-lf="status">${['open','win','loss','void'].map(s=>opt(s,s==='open'?'In corso':STATUS[s],l.status)).join('')}</select>
      <button type="button" data-m="del-leg" data-i="${i}" title="Rimuovi">${ico('x')}</button></div>`).join('')}
    ${d.type==='multipla'?`<div class="rg-legs-foot">Quota totale <b>${q?q.toFixed(2):'—'}</b> <small>(prodotto delle quote; void = 1.00)</small></div>`:''}</div>`:'';
  openModalShell(`<div class="rg-modal-head"><div><small>${edit?'MODIFICA':'NUOVA'} SCOMMESSA</small><h3>${edit?'Modifica bet':'Nuova bet'}</h3></div><button type="button" class="rg-x" data-m="close">${ico('x')}</button></div>
  <div class="rg-modal-body">
    <div class="rg-seg big">${Object.entries(TYPES).map(([k,v])=>`<button type="button" class="${d.type===k?'on':''}" data-m="type" data-v="${k}">${v}</button>`).join('')}</div>
    <div class="rg-form">
      <label>Data<input type="date" value="${esc(d.date)}" data-f="date"></label>
      <label>Ora<input type="time" value="${esc(d.time)}" data-f="time"></label>
      <label>Sport<select data-f="sport">${Object.entries(SPORTS).map(([k,v])=>opt(k,v[0]+' '+v[1],d.sport)).join('')}</select></label>
      <label>Book<select data-f="book">${bookOptions(d.book,'— nessuno —')}</select></label>
      ${multi?(d.type==='sistema'?`<label>Sistema<input placeholder="es. 2/3, Trixie, Yankee" value="${esc(d.system)}" data-f="system"></label><label>Quota (facolt.)<input inputmode="decimal" value="${esc(d.odds)}" data-f="odds" placeholder="per stat. Edge"></label>`:''):`
      <label class="span2">Torneo / info<input list="rgLeagues" value="${esc(d.league)}" data-f="league" placeholder="es. Serie A, Coppa Italia"></label>
      <label class="span2 rg-pickbtn"><span>&nbsp;</span><span class="rg-pickrow"><button type="button" class="rg-btn ghost accent" data-m="imp-open">📋 Incolla bolletta</button><button type="button" class="rg-btn ghost" data-m="pick-single">${ico('book')}Dal Betting classico</button></span></label>
      <label>Casa / Evento<input value="${esc(d.home)}" data-f="home" placeholder="Torino"></label>
      <label>Ospite<input value="${esc(d.away)}" data-f="away" placeholder="Bari"></label>
      <label>Mercato<input list="rgMarkets" value="${esc(d.market)}" data-f="market"></label>
      <label>Pronostico<input value="${esc(d.pick)}" data-f="pick" placeholder="1, X, Over 2.5…"></label>
      <label>Quota<input inputmode="decimal" value="${esc(d.odds)}" data-f="odds" placeholder="2,00"></label>`}
      <label>Stake €<input inputmode="decimal" value="${esc(d.stake)}" data-f="stake"></label>
      <label title="Bonus del book (es. bonus multipla) che si aggiunge alla vincita se la bet è vinta">Bonus €<input inputmode="decimal" value="${esc(d.bonus)}" data-f="bonus" placeholder="0,00"></label>
      <label class="rg-check"><input type="checkbox" ${d.freebet?'checked':''} data-f="freebet"><span>Freebet<small>stake non rimborsato</small></span></label>
      <label>Esito<select data-f="status">${Object.entries(STATUS).map(([k,v])=>opt(k,v,d.status)).join('')}</select></label>
      ${needRet?`<label>${d.status==='cashout'?'Importo cash out €':'Rientro sistema €'}<input inputmode="decimal" value="${esc(d.ret)}" data-f="ret"></label>`:''}
      <label class="span2">Tag<input value="${esc(d.tags)}" data-f="tags" list="rgTags" placeholder="es. progressione, trixie, bonus"></label>
      <label class="span2">Note<input value="${esc(d.note)}" data-f="note"></label>
    </div>
    ${legs}
    <datalist id="rgLeagues">${leagues.map(l=>`<option value="${esc(l)}">`).join('')}</datalist><datalist id="rgMarkets">${markets.map(m=>`<option value="${esc(m)}">`).join('')}</datalist><datalist id="rgTags">${allTags().map(t=>`<option value="${esc(t)}">`).join('')}</datalist>
    <div class="rg-summary"><span>Quota <b>${q?q.toFixed(2):'—'}</b></span><span>Stake <b>${money(stake)}</b></span><span>Vincita potenziale <b>${money(pot)}</b>${num(d.bonus)>0?` <small>(bonus incl.)</small>`:''}</span><span>Profitto pot. <b class="pos">${money(pot-(d.freebet?0:stake),true)}</b></span></div>
  </div>
  <div class="rg-modal-foot">${edit?'':`<button type="button" class="rg-btn ghost" data-m="save-next" title="Salva e apri subito un'altra bet con stessa data, book e stake">Salva e nuova</button>`}<button type="button" class="rg-btn ghost" data-m="close">Annulla</button><button type="button" class="rg-btn primary" data-m="save">${ico('check')}Salva</button></div>`,multi);
  if(focusSel){let el=document.querySelector('#rgOverlay '+focusSel);if(el){el.focus();if(el.setSelectionRange&&el.value)try{el.setSelectionRange(el.value.length,el.value.length)}catch(_){}}}
}
function openTransfer(id){
  let e=id?data.entries.find(x=>x.id===id):null;
  let d=e?Object.assign({},e):{kind:'transfer',date:todayIso(),time:nowTime(),from:(data.books[0]||{}).id||'',to:(data.books[1]||{}).id||'',amount:'',note:''};
  modal={type:'transfer',id,draft:d};
  openModalShell(`<div class="rg-modal-head"><div><small>MOVIMENTO INTERNO</small><h3>Trasferimento tra book</h3></div><button type="button" class="rg-x" data-m="close">${ico('x')}</button></div>
  <div class="rg-modal-body"><p class="rg-hint">Sposta soldi da un conto all'altro: la cassa totale non cambia, cambiano solo i saldi dei book.</p><div class="rg-form">
    <label>Data<input type="date" value="${esc(d.date)}" data-f="date"></label><label>Ora<input type="time" value="${esc(d.time)}" data-f="time"></label>
    <label>Da<select data-f="from">${bookOptions(d.from)}</select></label><label>A<select data-f="to">${bookOptions(d.to)}</select></label>
    <label>Importo €<input inputmode="decimal" value="${esc(d.amount)}" data-f="amount"></label><label class="span3">Nota<input value="${esc(d.note)}" data-f="note" placeholder="es. ricarica per sistema trixie"></label>
  </div></div>
  <div class="rg-modal-foot"><button type="button" class="rg-btn ghost" data-m="close">Annulla</button><button type="button" class="rg-btn primary" data-m="save">${ico('check')}Salva</button></div>`);
}
function openMove(id){
  let e=id?data.entries.find(x=>x.id===id):null;
  let d=e?Object.assign({},e,{dir:n(e.amount)>=0?'dep':'wd',amount:Math.abs(n(e.amount))}):{kind:'move',dir:'dep',date:todayIso(),time:nowTime(),book:(data.books[0]||{}).id||'',amount:'',note:''};
  modal={type:'move',id,draft:d};
  openModalShell(`<div class="rg-modal-head"><div><small>MOVIMENTO DI CASSA</small><h3>Deposito / prelievo</h3></div><button type="button" class="rg-x" data-m="close">${ico('x')}</button></div>
  <div class="rg-modal-body"><p class="rg-hint">Soldi che entrano o escono dalla cassa (ricariche dall'esterno, prelievi, bonus accreditati). Non entrano nel P/L delle scommesse.</p><div class="rg-form">
    <label>Tipo<select data-f="dir">${opt('dep','Deposito (+)',d.dir)}${opt('wd','Prelievo (−)',d.dir)}</select></label>
    <label>Data<input type="date" value="${esc(d.date)}" data-f="date"></label><label>Ora<input type="time" value="${esc(d.time)}" data-f="time"></label>
    <label>Book<select data-f="book">${bookOptions(d.book,'— nessuno —')}</select></label><label>Importo €<input inputmode="decimal" value="${esc(d.amount)}" data-f="amount"></label>
    <label class="span3">Nota<input value="${esc(d.note)}" data-f="note"></label>
  </div></div>
  <div class="rg-modal-foot"><button type="button" class="rg-btn ghost" data-m="close">Annulla</button><button type="button" class="rg-btn primary" data-m="save">${ico('check')}Salva</button></div>`);
}
function openCashout(id,status){
  let b=data.entries.find(x=>x.id===id);if(!b)return;
  modal={type:'ret',id,draft:{ret:b.ret||'',status}};
  let isCo=status==='cashout';
  openModalShell(`<div class="rg-modal-head"><div><small>${isCo?'CASH OUT':'SISTEMA VINCENTE'}</small><h3>${isCo?'Quanto hai incassato?':'Quanto è rientrato?'}</h3></div><button type="button" class="rg-x" data-m="close">${ico('x')}</button></div>
  <div class="rg-modal-body"><p class="rg-hint">Stake ${money(b.stake)} · quota ${fmtOdds(betOdds(b))}. Inserisci l'importo totale accreditato.</p><div class="rg-form one"><label>Importo €<input inputmode="decimal" value="${esc(b.ret||'')}" data-f="ret" autofocus></label></div></div>
  <div class="rg-modal-foot"><button type="button" class="rg-btn ghost" data-m="close">Annulla</button><button type="button" class="rg-btn primary" data-m="save">${ico('check')}Conferma</button></div>`);
  setTimeout(()=>{let i=document.querySelector('#rgOverlay [data-f="ret"]');if(i)i.focus()},0);
}
function onModalInput(e){
  if(!modal)return;let t=e.target,d=modal.draft;
  if(t.dataset.impfile){if(e.type!=='change')return;let f=t.files&&t.files[0];t.value='';if(!f)return;if(t.dataset.impfile==='ocr')readTicketImage(f);else readTicketSheet(f);return}
  if(t.dataset.imp&&modal.imp){modal.imp[t.dataset.imp]=t.value;if(t.dataset.imp==='stake'||t.dataset.imp==='bonus'){let q=impQuota(modal.imp),el=[...document.querySelectorAll('#rgOverlay .rg-imp-sum span b')].pop();if(el)el.textContent=money(q*(num(modal.imp.stake)||0)+(num(modal.imp.bonus)||0))}return}
  if(t.dataset.ir!=null&&modal.imp){let l=modal.imp.legs[Number(t.dataset.ir)];if(l){l[t.dataset.irf]=t.dataset.irf==='odds'?(num(t.value)||t.value):t.value}return}
  if(t.dataset.f){let f=t.dataset.f,v=t.type==='checkbox'?t.checked:t.value;
    if((f==='book'||f==='from'||f==='to')&&v==='__new'){let name=prompt('Nome del nuovo book');if(name&&name.trim()){let b={id:uid('bk'),name:name.trim(),color:'#5b6b7f',start:0};data.books.push(b);save();v=b.id}else v=d[f]||'';d[f]=v;rerenderModal();return}
    d[f]=v;
    if(modal.type==='bet'&&(e.type==='change'&&['status','freebet','sport','book'].includes(f)||f==='odds'||f==='stake'||f==='bonus')){if(e.type==='change'&&['status','freebet'].includes(f))rerenderModal();else paintSummary()}
  }else if(t.dataset.lf!=null){let l=d.legs[Number(t.dataset.l)];if(l){l[t.dataset.lf]=t.value;if(t.dataset.lf==='odds'||t.dataset.lf==='status'){paintSummary();let ft=document.querySelector('#rgOverlay .rg-legs-foot b');if(ft){let q=draftOdds(d);ft.textContent=q?q.toFixed(2):'—'}}}}
}
function paintSummary(){let d=modal.draft,s=document.querySelector('#rgOverlay .rg-summary');if(!s)return;let q=draftOdds(d),stake=num(d.stake)||0,pot=(d.freebet?stake*(q-1):stake*q)+(num(d.bonus)||0);s.innerHTML=`<span>Quota <b>${q?q.toFixed(2):'—'}</b></span><span>Stake <b>${money(stake)}</b></span><span>Vincita potenziale <b>${money(pot)}</b></span><span>Profitto pot. <b class="pos">${money(pot-(d.freebet?0:stake),true)}</b></span>`}
function rerenderModal(){if(!modal)return;if(modal.type==='bet')renderBetModal();else if(modal.type==='transfer')openTransfer2();else if(modal.type==='move')openMove2()}
function openTransfer2(){let m=modal;let tmp=m.draft;openTransfer(m.id);modal.draft=Object.assign(modal.draft,tmp);openTransferRefresh()}
function openTransferRefresh(){let d=modal.draft;document.querySelectorAll('#rgOverlay [data-f]').forEach(el=>{if(d[el.dataset.f]!=null)el.value=d[el.dataset.f]})}
function openMove2(){let m=modal;let tmp=m.draft;openMove(m.id);modal.draft=Object.assign(modal.draft,tmp);openTransferRefresh()}
function pickMatch(cb){if(!window.EasyBetBettingPicker||!window.EasyBetBettingPicker.open){alert('Il selettore partite non è disponibile in questa pagina.');return}window.EasyBetBettingPicker.open({title:'Scegli partita · Registro scommesse',onSelect:m=>cb(m)})}
function fromPicker(m){let q=num(m.quotaIngresso);return{home:m.casa||'',away:m.trasferta||'',league:m.campionato||'',market:m.tipoGiocata||'',pick:'',odds:q>1?String(q):'',date:toIso(m.data)||todayIso(),time:m.ora||''}}
function onModalClick(e){
  let b=e.target.closest('[data-m]');if(!b||!modal)return;let a=b.dataset.m,d=modal.draft;
  if(a==='close'){closeModal();return}
  if(a==='imp-open'){modal.imp={mode:'paste',raw:'',legs:[],stake:num(d.stake)||'',bonus:d.bonus||'',potential:0,error:'',loading:false,progress:0,fileName:''};renderBetModal();return}
  if(a==='imp-close'){if(modal.imp&&modal.imp.loading)return;modal.imp=null;renderBetModal();return}
  if(a==='imp-tab'){if(modal.imp.loading)return;modal.imp.mode=b.dataset.v;modal.imp.error='';renderBetModal();return}
  if(a==='imp-parse'){analyzePaste();return}
  if(a==='imp-del'){modal.imp.legs.splice(Number(b.dataset.i),1);renderBetModal();return}
  if(a==='imp-apply'){applyImport(b.dataset.v);return}
  if(a==='type'){d.type=b.dataset.v;if(d.type!=='singola'&&d.legs.length<2){if(d.home||d.away)d.legs=[{home:d.home,away:d.away,league:d.league,market:d.market,pick:d.pick,odds:d.odds,status:'open',date:d.date,time:d.time},blankLeg()];else d.legs=[blankLeg(),blankLeg()]}renderBetModal();return}
  if(a==='add-leg'){d.legs.push(blankLeg());renderBetModal(`[data-l="${d.legs.length-1}"][data-lf="home"]`);return}
  if(a==='del-leg'){d.legs.splice(Number(b.dataset.i),1);renderBetModal();return}
  if(a==='pick-leg'){pickMatch(m=>{let l=Object.assign(blankLeg(),fromPicker(m));let empty=d.legs.findIndex(x=>!x.home&&!x.away);if(empty>=0)d.legs[empty]=l;else d.legs.push(l);renderBetModal()});return}
  if(a==='pick-single'){pickMatch(m=>{let p=fromPicker(m);Object.assign(d,{home:p.home,away:p.away,league:p.league,market:p.market||d.market,odds:p.odds||d.odds,date:p.date,time:p.time||d.time});renderBetModal('[data-f="pick"]')});return}
  if(a==='save'||a==='save-next'){if(commitModal()){if(a==='save-next'){let keep={date:d.date,time:d.time,book:d.book,stake:d.stake,sport:d.sport,league:d.league,type:d.type,tags:d.tags};openBet(null);Object.assign(modal.draft,keep);if(keep.type!=='singola')modal.draft.legs=[blankLeg(),blankLeg()];renderBetModal('[data-f="home"]')}else closeModal()}return}
}
function commitModal(){
  let m=modal,d=m.draft;
  if(m.type==='ret'){let v=num(d.ret);if(!(v>=0)){alert('Importo non valido');return false}let b=data.entries.find(x=>x.id===m.id);if(b){b.status=d.status;b.ret=v;save()}return true}
  if(m.type==='bet'){
    let stake=num(d.stake);if(!(stake>0)){alert('Inserisci uno stake valido.');return false}
    let e=normEntry({id:m.id||uid('bet'),kind:'bet',createdAt:m.id?(data.entries.find(x=>x.id===m.id)||{}).createdAt:Date.now(),date:d.date,time:d.time,sport:d.sport,book:d.book,type:d.type,system:d.system,stake,freebet:d.freebet,bonus:Math.max(0,num(d.bonus)||0),status:d.status,ret:num(d.ret)||0,tags:String(d.tags||'').split(',').map(s=>s.trim()).filter(Boolean),note:d.note});
    if(d.type==='singola'){let q=num(d.odds);if(!(q>1)){alert('Inserisci una quota valida (maggiore di 1).');return false}Object.assign(e,{league:d.league,home:d.home,away:d.away,market:d.market,pick:d.pick,odds:q,legs:[]})}
    else{let legs=d.legs.filter(l=>l.home||l.away||num(l.odds)>1).map(l=>normLeg(Object.assign({},l,{odds:num(l.odds)||0})));if(legs.length<1){alert('Aggiungi almeno una selezione.');return false}if(d.type==='multipla'&&legs.some(l=>!(l.odds>1))){alert('Ogni selezione della multipla deve avere una quota valida.');return false}e.legs=legs;e.odds=d.type==='multipla'?r2(legs.reduce((p,l)=>p*l.odds,1)):(num(d.odds)||0);
      if(d.type==='multipla'&&!['cashout'].includes(d.status)&&legs.some(l=>l.status!=='open'))e.status=multiStatus(e)}
    if((e.status==='cashout'||(e.type==='sistema'&&e.status==='win'))&&!(num(d.ret)>=0&&String(d.ret).trim()!=='')){alert(e.status==='cashout'?'Inserisci l\'importo del cash out.':'Inserisci quanto è rientrato dal sistema.');return false}
    upsert(e);return true;
  }
  if(m.type==='transfer'){let a=num(d.amount);if(!(a>0)){alert('Importo non valido');return false}if(!d.from||!d.to||d.from===d.to){alert('Scegli due book diversi.');return false}upsert(normEntry({id:m.id||uid('tr'),kind:'transfer',createdAt:m.id?d.createdAt:Date.now(),date:d.date,time:d.time,from:d.from,to:d.to,amount:a,note:d.note}));return true}
  if(m.type==='move'){let a=num(d.amount);if(!(a>0)){alert('Importo non valido');return false}upsert(normEntry({id:m.id||uid('mv'),kind:'move',createdAt:m.id?d.createdAt:Date.now(),date:d.date,time:d.time,book:d.book,amount:d.dir==='wd'?-a:a,note:d.note}));return true}
  return false;
}
function upsert(e){let i=data.entries.findIndex(x=>x.id===e.id);if(i>=0)data.entries[i]=e;else data.entries.push(e);save()}

/* ---------- IMPORT BOLLETTA (copia/incolla · Excel/CSV · screenshot GoldBet) ---------- */
function cleanCell(v){return String(v==null?'':v).replace(/<br\s*\/?\s*>/gi,' ').replace(/\*\*/g,'').replace(/ /g,' ').replace(/\s+/g,' ').trim()}
function parseWhen(s){s=cleanCell(s);let time='',date='';let tm=s.match(/(\d{1,2})[:.](\d{2})(?!\d)/);if(tm&&Number(tm[1])<24)time=pad(tm[1])+':'+tm[2];let dm=s.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);if(dm)date=dm[1]+'-'+pad(dm[2])+'-'+pad(dm[3]);else{let mn=s.match(/(\d{1,2})[\s\/.-]+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*\.?(?:[\s\/.-]+(\d{2,4}))?/i);if(mn){let mi='genfebmaraprmaggiulugagosetottnovdic'.indexOf(mn[2].toLowerCase())/3+1,y=mn[3]?(mn[3].length===2?'20'+mn[3]:mn[3]):String(new Date().getFullYear());date=y+'-'+pad(mi)+'-'+pad(mn[1])}else dm=s.match(/(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?(?!\d|:)/);if(!date&&dm&&!(tm&&dm[0].includes(tm[0]))){let y=dm[3]?(dm[3].length===2?'20'+dm[3]:dm[3]):String(new Date().getFullYear());date=y+'-'+pad(dm[2])+'-'+pad(dm[1])}}return{date,time}}
function isWhenCell(c){return c.length<26&&(/^\d{1,2}[\s\/.-]+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)/i.test(c)||/\d{1,2}:\d{2}/.test(c)||/^\d{1,2}[\/.-]\d{1,2}([\/.-]\d{2,4})?$/.test(c)||/^\d{4}-\d{2}-\d{2}/.test(c))&&!/[a-z]{4,}/i.test(c.replace(/(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-z]*/ig,''))}
function oddOf(c){let m=String(c||'').trim().match(/^@?\s*(\d{1,3}[.,]\d{1,3})$/);if(!m)return NaN;let q=num(m[1]);return q>1&&q<1000?q:NaN}
function splitMarket(m){m=cleanCell(m);let i=m.lastIndexOf(':');if(i>0&&i<m.length-1)return{market:m.slice(0,i).trim(),pick:m.slice(i+1).trim()};return{market:'',pick:m}}
const TEAM_SEP=/\s+(?:-|–|—|vs\.?|v\.?)\s+/i;
function parseCells(cells){
  cells=cells.map(cleanCell).filter(c=>c&&!/^(si|sì|no|-|—)$/i.test(c));
  let oi=-1,odds=NaN;for(let i=cells.length-1;i>=0;i--){let q=oddOf(cells[i]);if(q>1){oi=i;odds=q;break}}
  let rest=cells.filter((_,i)=>i!==oi);
  if(!(odds>1)){/* quota attaccata al mercato: "Over 2.5 1.85" */for(let i=rest.length-1;i>=0;i--){let mm=rest[i].match(/(?:^|\s|@)(\d{1,3}[.,]\d{2})\s*$/);if(mm){let q=num(mm[1]);if(q>1&&q<1000){odds=q;rest[i]=rest[i].slice(0,mm.index).trim();if(!rest[i])rest.splice(i,1);break}}}}
  if(!(odds>1))return null;
  let date='',time='';rest=rest.filter(c=>{if(isWhenCell(c)){let w=parseWhen(c);date=date||w.date;time=time||w.time;return false}return true});
  let league='',home='',away='',mk=[];
  const leagueLike=c=>/^(calcio|tennis|basket|volley|hockey|rugby)\s*[-–]/i.test(c)||gbLooksLeague(c);
  let ti=rest.findIndex(c=>TEAM_SEP.test(c)&&c.split(TEAM_SEP).length===2&&!leagueLike(c));
  if(ti>=0){[home,away]=rest[ti].split(TEAM_SEP).map(cleanCell);league=rest.slice(0,ti).join(' ');mk=rest.slice(ti+1)}
  else if(rest.length>=4&&(leagueLike(rest[0])||rest.length>=5||!gbLooksMarket(rest[2]))){league=rest[0];home=rest[1];away=rest[2];mk=rest.slice(3)}
  else if(rest.length>=4){home=rest[0];away=rest[1];mk=rest.slice(2)}
  else if(rest.length===3){home=rest[0];away=rest[1];mk=[rest[2]]}
  else return null;
  league=league.replace(/^calcio\s*[-–]\s*/i,'').trim();
  let market='',pick='';if(mk.length>=2){market=mk.slice(0,-1).join(' ');pick=mk[mk.length-1]}else if(mk.length===1){let s=splitMarket(mk[0]);market=s.market;pick=s.pick}
  if(!home||!(odds>1))return null;
  return{league,home,away,market,pick,odds,date,time};
}
function parseTableText(raw){
  let out=[];
  String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).forEach(line=>{
    if(/^\|?\s*:?-{2,}/.test(line))return;
    let cells=null;
    if(line.includes('|')){cells=line.split('|');if(!cleanCell(cells[0]))cells.shift();if(cells.length&&!cleanCell(cells[cells.length-1]))cells.pop()}
    else if(line.includes('\t'))cells=line.split('\t');else if(line.includes(';'))cells=line.split(';');else if(/\S\s{2,}\S/.test(line))cells=line.split(/\s{2,}/);
    else{/* riga unica: "Torino - Bari 1X2: 1 @ 2.00" */let mm=line.match(/^(.*?\S)\s+(?:-|–|vs\.?)\s+(.*?)\s+@?\s*(\d{1,3}[.,]\d{2})\s*$/i);if(mm){let mid=mm[2].split(/\s+/);let away=[],market=[];/* l'ospite finisce dove inizia il mercato */let mi=mid.findIndex(w=>/^(1|x|2|1x|x2|12|over|under|gg|ng|goal|nogoal|o|u|dc|esito|segno|combo|multigol|dnb|handicap|hnd|ris|pari|dispari|1x2|u\/o|gg\/ng|o\/u|\d[.,]5)$/i.test(w)||/[:]/.test(w));if(mi<=0)mi=mid.length;away=mid.slice(0,mi);market=mid.slice(mi);let s=splitMarket(market.join(' '));out.push({league:'',home:cleanCell(mm[1]),away:away.join(' '),market:s.market,pick:s.pick,odds:num(mm[3]),date:'',time:''})}return}
    let lower=cells.map(c=>cleanCell(c).toLowerCase());if(lower.includes('casa')&&lower.includes('ospite'))return;
    let r=parseCells(cells);if(r)out.push(r);
  });
  return out;
}
/* --- testo copiato da ticket (GoldBet e simili: squadre su righe separate, mercato, quota) --- */
function gbCleanLine(v){return String(v||'').replace(/[|]/g,' ').replace(/\s+/g,' ').trim()}
function gbMoney(v){let m=String(v||'').replace(/\./g,'').replace(',','.').match(/(\d+(?:\.\d{1,2})?)/);return m?Number(m[1]):NaN}
function gbLooksNoise(line){let u=line.toUpperCase();return !line||u==='MULTIPLA'||u==='SINGOLA'||u.includes('GOLDBET')||u.includes('INFORMAZIONI SUL BIGLIETTO')||u.startsWith('ID:')||u.startsWith('ID ADM')||u.includes('VAI ALL')||u.includes('IN CORSO')||u.startsWith('DATA:')||u.startsWith('IMPORTO')||u.startsWith('VINCITA POTENZIALE')||u.startsWith('BONUS')||u.startsWith('VINCITA ')||u.startsWith('QUOTA TOTALE')||u.startsWith('PUNTATA')||/^\d{1,2}[-\/]\w+[-\/]\d{4}/i.test(line)||/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/.test(line)}
function gbLooksLeague(line){let u=line.toUpperCase();return /LIGA|LEAGUE|MLS|SERIE|DIVISION|CONFERENCE|PREMIER|BUNDES|CHAMPIONSHIP|COPPA|CUP|LIGUE|EREDIVISIE|PRVA|SUPER LIGA|NATIONAL|PRIMERA|CALCIO -/.test(u)&&line.length<70&&!gbLooksMarket(line)}
function gbLooksMarket(line){let u=line.toUpperCase();return /COMBO|OVER|UNDER|SEGNO|GOAL|NO GOAL|DOPPIA CHANCE|\b1X\b|\bX2\b|\b12\b|ESITO|MULTIGOL|PARI\/?DISPARI|1X2|U\/O|GG\/NG|\bGG\b|\bNG\b|HANDICAP|DRAW NO BET|\bDNB\b|RISULTATO ESATTO|PARZIALE|TESTA A TESTA|MARCATORE|T\/T|1 ?X ?2/.test(u)}
function gbExtractOdd(line){let a=String(line||'').match(/(?:^|\s|@)(\d{1,3}[\.,]\d{2})(?=\s|$|[^\d])/g);if(!a||!a.length)return NaN;let raw=a[a.length-1].match(/\d{1,3}[\.,]\d{2}/);return raw?Number(raw[0].replace(',','.')):NaN}
function gbStripOdd(line){return gbCleanLine(String(line||'').replace(/(?:\s|@)\d{1,3}[\.,]\d{2}(?:\s*\[?@?\]?)?\s*$/,''))}
function gbCleanMarket(line){return gbStripOdd(line).replace(/\s*:\s*(?:SI|S1|51|§1)\b/i,'').replace(/\s+(?:SI|S1|51|§1)\s*$/i,'').replace(/\s*\[@?\s*$/,'').replace(/0\s*52/gi,'0,5 2°T').replace(/0\s*5\s*2[°º]?\s*T/gi,'0,5 2°T').replace(/0\s*5\s*1[°º]?\s*T/gi,'0,5 1°T').trim()}
function gbMergeLines(text){let src=String(text||'').replace(/\r/g,'').split('\n').map(gbCleanLine).filter(Boolean),out=[];for(let i=0;i<src.length;i++){let l=src[i];if(gbLooksMarket(l)&&!(gbExtractOdd(l)>1)&&i+1<src.length&&gbExtractOdd(src[i+1])>1&&!gbLooksMarket(src[i+1])){l=gbCleanLine(l+' '+src[i+1]);i++}else if(gbLooksMarket(l)&&!(gbExtractOdd(l)>1)&&i+2<src.length&&src[i+1].length<=24&&!(gbExtractOdd(src[i+1])>1)&&!TEAM_SEP.test(src[i+1])&&/^@?\s*\d{1,3}[.,]\d{2}$/.test(src[i+2])){l=gbCleanLine(l+': '+src[i+1]+' '+src[i+2]);i+=2}else if(gbLooksMarket(l)&&!(gbExtractOdd(l)>1)&&i+1<src.length&&gbLooksMarket(src[i+1])&&i+2<src.length&&/^@?\s*\d{1,3}[.,]\d{2}$/.test(src[i+2])){l=gbCleanLine(l+': '+src[i+1]+' '+src[i+2]);i+=2}out.push(l)}return out}
function gbCandidateTeams(lines,i){let prev=[],league='',when='';for(let j=i-1;j>=0&&prev.length<3;j--){let x=lines[j];if(gbLooksMarket(x)||(gbExtractOdd(x)>1&&!TEAM_SEP.test(x)))break;if(gbLooksLeague(x)){league=league||x;continue}if(isWhenCell(x)||/^\d{1,2}[-\/]\w+/i.test(x)){when=when||x;continue}if(gbLooksNoise(x))continue;prev.unshift(x);if(TEAM_SEP.test(x))break}
  let home='',away='';let joined=prev.find(x=>TEAM_SEP.test(x));
  if(joined){[home,away]=joined.split(TEAM_SEP)}
  else if(prev.length>=2){home=prev[prev.length-2];away=prev[prev.length-1]}
  else if(prev.length===1){home=prev[0]}
  let w=parseWhen(when);
  return{home:gbCleanLine(home),away:gbCleanLine(away),league:gbCleanLine(league).replace(/^calcio\s*[-–]\s*/i,''),date:w.date,time:w.time}
}
function ticketAmounts(text){let stake=NaN,potential=NaN,bonus=NaN;String(text||'').split(/\r?\n/).forEach(l=>{let m=l.match(/(?:IMPORTO(?: GIOCATO| SCOMMESSO)?|PUNTATA|STAKE|IMPORTO TOTALE)[^\d]{0,15}(\d+[\.,]\d{1,2}|\d+)/i);if(m&&!(stake>=0))stake=gbMoney(m[1]);m=l.match(/(?:VINCITA POTENZIALE|POSSIBILE VINCITA|VINCITA MAX|VINCITA)[^\d]{0,15}(\d[\d\.]*,\d{1,2}|\d+\.\d{1,2}|\d+)/i);if(m&&!(potential>=0))potential=gbMoney(m[1]);m=l.match(/BONUS[^\d%]{0,20}(\d[\d\.]*,\d{1,2}|\d+\.\d{1,2}|\d+)\s*(%|€|eur)?/i);if(m&&!(bonus>=0)&&m[2]!=='%')bonus=gbMoney(m[1])});return{stake,potential,bonus}}
function parseGoldBetText(raw){
  let text=String(raw||''),lines=gbMergeLines(text),legs=[];
  for(let i=0;i<lines.length;i++){
    let line=lines[i];if(!gbLooksMarket(line))continue;
    let odd=gbExtractOdd(line);if(!(odd>1)){for(let j=i+1;j<Math.min(lines.length,i+4);j++){let x=gbExtractOdd(lines[j]);if(x>1){odd=x;break}if(gbLooksMarket(lines[j]))break}}
    let t=gbCandidateTeams(lines,i),s=splitMarket(gbCleanMarket(line)||'Giocata');
    if(t.home&&odd>1)legs.push({league:t.league,home:t.home,away:t.away,market:s.market,pick:s.pick,odds:odd,date:t.date,time:t.time});
  }
  let seen=new Set();legs=legs.filter(l=>{let k=(l.home+'|'+l.away+'|'+l.odds).toLowerCase().replace(/[^a-z0-9|.]/g,'');if(seen.has(k))return false;seen.add(k);return true});
  let a=ticketAmounts(text);
  return{stake:a.stake,potential:a.potential,legs,raw:text};
}
function parseTicket(raw){let t=parseTableText(raw),a=ticketAmounts(raw);return{legs:t.length?t:parseGoldBetText(raw).legs,stake:a.stake,potential:a.potential,bonus:a.bonus}}
/* --- Excel / CSV --- */
function normHeader(v){return cleanCell(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,' ').trim()}
function parseSheetRows(rows){
  rows=Array.isArray(rows)?rows:[];if(!rows.length)return[];
  const tests={league:/^(campionato|lega|league|competizione|torneo|sport campionato)$/,home:/^(casa|squadra casa|home|home team)$/,away:/^(ospite|squadra ospite|trasferta|away|away team)$/,event:/^(evento|partita|match|incontro)$/,when:/^(data ora|data e ora|orario|date time|datetime)$/,date:/^(data|date|giorno)$/,time:/^(ora|time)$/,market:/^(tipo giocata|giocata|mercato|market|bet|tipo scommessa|scommessa)$/,pick:/^(pronostico|esito|selezione|segno|pick)$/,odds:/^(quota|quote|odd|odds|quota ingresso)$/};
  let head=-1,map={};
  for(let r=0;r<Math.min(rows.length,12);r++){let hs=(rows[r]||[]).map(normHeader),m={};for(let i=0;i<hs.length;i++)for(const k of Object.keys(tests))if(m[k]==null&&tests[k].test(hs[i]))m[k]=i;if((m.home!=null||m.event!=null)&&m.odds!=null){head=r;map=m;break}}
  let out=[];
  if(head<0){rows.forEach(r=>{let x=parseCells((r||[]).map(String));if(x)out.push(x)});return out}
  for(let r=head+1;r<rows.length;r++){
    let row=(rows[r]||[]).map(cleanCell);if(!row.some(Boolean))continue;
    let g=k=>map[k]!=null?cleanCell(row[map[k]]):'';
    let home=g('home'),away=g('away');if(!home&&g('event')){let p=g('event').split(TEAM_SEP);home=cleanCell(p[0]);away=cleanCell(p.slice(1).join(' - '))}
    let odds=num(g('odds'));let mk=g('market'),pk=g('pick');if(!pk){let s=splitMarket(mk);mk=s.market;pk=s.pick}
    let w=parseWhen(g('when')||[g('date'),g('time')].join(' '));if(!w.date&&g('date'))w.date=toIso(g('date'));
    if(home&&odds>1)out.push({league:g('league').replace(/^calcio\s*[-–]\s*/i,''),home,away,market:mk,pick:pk,odds,date:w.date,time:w.time||g('time')});
  }
  return out;
}
/* --- OCR screenshot (GoldBet) --- */
async function gbImageBitmap(file){if(window.createImageBitmap)return await createImageBitmap(file);return await new Promise((resolve,reject)=>{let img=new Image(),u=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(u);resolve(img)};img.onerror=reject;img.src=u})}
function gbCanvasFromImage(img,sy,sh,scale){scale=scale||2.2;let w=img.width||img.naturalWidth,h=img.height||img.naturalHeight;sy=Math.max(0,Math.min(h-1,Math.round(sy||0)));sh=Math.max(1,Math.min(h-sy,Math.round(sh||h)));let cw=Math.round(w*scale),ch=Math.round(sh*scale),c=document.createElement('canvas');c.width=cw;c.height=ch;let ctx=c.getContext('2d',{willReadFrequently:true});ctx.fillStyle='#fff';ctx.fillRect(0,0,cw,ch);ctx.drawImage(img,0,sy,w,sh,0,0,cw,ch);let id=ctx.getImageData(0,0,cw,ch),d=id.data;for(let i=0;i<d.length;i+=4){let y=.299*d[i]+.587*d[i+1]+.114*d[i+2];let v=y<175?0:y>242?255:Math.max(0,Math.min(255,(y-175)*3.8));d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(id,0,0);return c}
async function gbPrepareCanvas(file,mode){let img=await gbImageBitmap(file),w=img.width||img.naturalWidth,h=img.height||img.naturalHeight,sy=0,sh=h;if(mode==='body'){sy=Math.floor(h*.28);sh=Math.floor(h*.67)}else if(mode==='lower'){sy=Math.floor(h*.40);sh=Math.floor(h*.55)}let scale=Math.min(2.4,Math.max(1.45,1850/w)),c=gbCanvasFromImage(img,sy,sh,scale);if(img.close)try{img.close()}catch(_){}return c}
async function gbDetectBlocks(file){let img=await gbImageBitmap(file),w=img.width||img.naturalWidth,h=img.height||img.naturalHeight,c=document.createElement('canvas');c.width=w;c.height=h;let ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,w,h);let data=ctx.getImageData(0,0,w,h).data,from=Math.floor(h*.27),to=Math.floor(h*.93),stepX=Math.max(2,Math.floor(w/500)),rows=[];for(let y=from;y<to;y++){let grey=0,total=0;for(let x=Math.floor(w*.02);x<Math.floor(w*.98);x+=stepX){let i=(y*w+x)*4,r=data[i],g=data[i+1],b=data[i+2],mx=Math.max(r,g,b),mn=Math.min(r,g,b);if(mx<246&&mn>170&&(mx-mn)<22)grey++;total++}if(total&&grey/total>.42)rows.push(y)}let runs=[];for(let y of rows){let last=runs[runs.length-1];if(last&&y<=last[1]+2)last[1]=y;else runs.push([y,y])}runs=runs.filter(r=>r[1]-r[0]>=4);let starts=[];for(let r of runs){let y=r[0];if(!starts.length||y-starts[starts.length-1]>Math.max(28,h*.018))starts.push(y)}let blocks=[];for(let i=0;i<starts.length;i++){let y0=Math.max(from,starts[i]-3),y1=i+1<starts.length?starts[i+1]-3:Math.min(to,Math.floor(h*.90));if(y1-y0>Math.max(55,h*.035)&&y1-y0<Math.max(260,h*.18))blocks.push([y0,y1])}if(img.close)try{img.close()}catch(_){}return blocks}
async function gbPrepareBlockCanvas(file,range){let img=await gbImageBitmap(file),w=img.width||img.naturalWidth,scale=Math.min(3.0,Math.max(1.8,2200/w)),c=gbCanvasFromImage(img,range[0],range[1]-range[0],scale);if(img.close)try{img.close()}catch(_){}return c}
function mergeLegs(list){let out=[],norm=v=>String(v||'').toLowerCase().replace(/[^a-z0-9]/g,'');list.forEach(l=>{let hit=out.find(x=>(norm(x.home)===norm(l.home)&&norm(x.away)===norm(l.away))||(norm(x.home)===norm(l.home)&&Math.abs(x.odds-l.odds)<.001));if(!hit)out.push(l);else if(((l.market||'')+(l.pick||'')).length>((hit.market||'')+(hit.pick||'')).length)Object.assign(hit,l)});return out}
async function readTicketImage(file){
  let imp=modal&&modal.imp;if(!imp||!file)return;
  imp.loading=true;imp.error='';imp.progress=.02;imp.fileName=file.name||'screenshot';imp.legs=[];renderBetModal();
  const prog=(p,label)=>{imp.progress=p;let bar=document.querySelector('#rgOverlay .rg-imp-progress i'),txt=document.querySelector('#rgOverlay .rg-imp-progress b');if(bar)bar.style.width=Math.max(4,Math.round(p*100))+'%';if(txt)txt.textContent=(label||'Lettura ticket…')+' '+Math.round(p*100)+'%'};
  try{
    if(!window.Tesseract||!window.Tesseract.recognize)throw new Error('Motore OCR non disponibile. Controlla la connessione e riprova.');
    let parsed=[],amounts={stake:NaN,potential:NaN};
    let head=await window.Tesseract.recognize(await gbPrepareCanvas(file,'full'),'eng',{tessedit_pageseg_mode:'3',preserve_interword_spaces:'1',logger:m=>{if(m&&m.status==='recognizing text'&&Number.isFinite(m.progress))prog(.02+m.progress*.18,'Lettura ticket…')}});
    let ht=head&&head.data&&head.data.text||'';imp.raw=ht;let p0=parseTicket(ht);parsed.push(...p0.legs);amounts=ticketAmounts(ht);
    let blocks=await gbDetectBlocks(file);
    if(blocks.length){for(let bi=0;bi<blocks.length;bi++){let base=.20+(bi/blocks.length)*.76,span=.76/blocks.length;let res=await window.Tesseract.recognize(await gbPrepareBlockCanvas(file,blocks[bi]),'eng',{tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',logger:m=>{if(m&&m.status==='recognizing text'&&Number.isFinite(m.progress))prog(Math.min(.97,base+m.progress*span),'Partita '+(bi+1)+'/'+blocks.length+'…')}});parsed.push(...parseGoldBetText(res&&res.data&&res.data.text||'').legs)}}
    else{for(const mode of ['body','lower']){let res=await window.Tesseract.recognize(await gbPrepareCanvas(file,mode),'eng',{tessedit_pageseg_mode:'6',preserve_interword_spaces:'1'});parsed.push(...parseGoldBetText(res&&res.data&&res.data.text||'').legs)}}
    imp.legs=mergeLegs(parsed);if(amounts.stake>0)imp.stake=amounts.stake;if(amounts.potential>0)imp.potential=amounts.potential;impBonus(imp,amounts.bonus);
    if(!imp.legs.length)imp.error='Non sono riuscita a riconoscere le selezioni. Prova con uno screenshot completo e nitido, oppure usa Copia/Incolla.';
    else if(blocks.length&&imp.legs.length<blocks.length)imp.error='Ho visto '+blocks.length+' blocchi partita ma ne ho letti '+imp.legs.length+': controlla le righe prima di importare.';
  }catch(err){imp.error=err&&err.message?err.message:'Errore durante la lettura dello screenshot.'}
  finally{imp.loading=false;imp.progress=1;if(modal&&modal.imp===imp)renderBetModal()}
}
async function readTicketSheet(file){
  let imp=modal&&modal.imp;if(!imp||!file)return;imp.fileName=file.name||'file';imp.error='';
  try{let ext=(file.name||'').toLowerCase();
    if(!window.XLSX||/\.(csv|tsv|txt)$/.test(ext)){let raw=await file.text();imp.legs=parseTableText(raw);let a=ticketAmounts(raw);if(a.stake>0)imp.stake=a.stake}
    else{let wb=window.XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false}),name=wb.SheetNames&&wb.SheetNames[0];if(!name)throw new Error('Il file non contiene fogli leggibili.');imp.legs=parseSheetRows(window.XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false,blankrows:false,dateNF:'dd/mm/yyyy'}))}
    if(!imp.legs.length)imp.error='Nessuna riga valida trovata. Servono almeno Casa/Ospite (o Evento) e Quota.';
  }catch(err){imp.error=(err&&err.message)||'Impossibile leggere il file.'}
  renderBetModal();
}
function analyzePaste(){let imp=modal.imp,r=parseTicket(imp.raw);imp.legs=r.legs;if(r.stake>0)imp.stake=r.stake;if(r.potential>0)imp.potential=r.potential;impBonus(imp,r.bonus);imp.error=imp.legs.length?'':'Nessuna selezione riconosciuta. Ogni riga deve avere almeno squadre e quota (es. "Torino - Bari | 1X2 | 1 | 2,00").';renderBetModal()}
/* bonus: letto dal ticket, oppure differenza tra vincita potenziale del ticket e stake×quota */
function impBonus(imp,b){if(b>0){imp.bonus=r2(b);return}let q=impQuota(imp),st=num(imp.stake)||0,pot=num(imp.potential)||0;if(imp.legs.length>1&&pot>0&&st>0&&pot-st*q>0.05)imp.bonus=r2(pot-st*q)}
function impQuota(imp){return imp.legs.reduce((p,l)=>p*(num(l.odds)||1),1)}
function renderImporter(){
  let d=modal.draft,imp=modal.imp,q=impQuota(imp),stake=num(imp.stake)||0,nL=imp.legs.length;
  let tab=k=>`<button type="button" class="${imp.mode===k?'on':''}" data-m="imp-tab" data-v="${k}">${k==='paste'?'Copia / incolla':k==='file'?'Excel / CSV':'Screenshot GoldBet'}</button>`;
  let input=imp.mode==='paste'?`<p class="rg-hint">Incolla la bolletta copiata dal sito del book, una tabella Excel o righe separate da <b>|</b>, tab o <b>;</b>. Riconosce squadre, torneo, data/ora, mercato, pronostico, quota e (se c'è) l'importo giocato.</p>
      <textarea class="rg-imp-raw" data-imp="raw" placeholder="| Calcio - Serie A | Torino | Bari | 20:45 - 05/10 | 1X2: 1 | 2,00 |&#10;Empoli - Frosinone | Esito finale: X | 3,00&#10;&#10;oppure incolla direttamente il testo del ticket (es. GoldBet)">${esc(imp.raw)}</textarea>
      <div class="rg-imp-row"><button type="button" class="rg-btn" data-m="imp-parse">${ico('search')}Analizza bolletta</button><small>Si analizza anche da sola quando incolli.</small></div>`
    :imp.mode==='file'?`<p class="rg-hint">Legge il primo foglio di un file Excel/CSV con colonne tipo Campionato, Casa, Ospite (o Evento), Data/Ora, Giocata/Mercato, Pronostico, Quota.</p><div class="rg-imp-row"><label class="rg-btn">${ico('up')}Scegli file<input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" data-impfile="sheet" hidden></label><small>${esc(imp.fileName||'XLSX · XLS · CSV')}</small></div>`
    :`<p class="rg-hint">Carica lo screenshot completo del ticket GoldBet: viene diviso in blocchi partita e letto con l'OCR (squadre, giocata, quota, importo).</p><div class="rg-imp-row"><label class="rg-btn">${ico('up')}Scegli immagine<input type="file" accept="image/png,image/jpeg,image/webp" data-impfile="ocr" hidden></label><small>${esc(imp.fileName||'PNG · JPG · WEBP')}</small></div>${imp.loading?`<div class="rg-imp-progress"><span><i style="width:${Math.max(4,Math.round(imp.progress*100))}%"></i></span><b>Lettura ticket… ${Math.round(imp.progress*100)}%</b></div>`:''}`;
  let rows=nL?`<div class="rg-imp-res">
      <div class="rg-imp-sum"><span>Selezioni trovate <b>${nL}</b></span><span>Quota ${nL>1?'totale':''} <b>${q.toFixed(2)}</b></span>
        <label>${nL>1?'Importo bolletta / stake singola':'Stake'} €<input inputmode="decimal" data-imp="stake" value="${esc(String(imp.stake).replace('.',','))}"></label>
        <label title="Bonus multipla del book: si aggiunge alla vincita">Bonus €<input inputmode="decimal" data-imp="bonus" value="${esc(String(imp.bonus||'').replace('.',','))}" placeholder="0,00"></label>
        <span>Vincita pot. multipla <b>${money(q*stake+(num(imp.bonus)||0))}</b></span></div>
      <div class="rg-imp-head"><span>#</span><span>Casa</span><span>Ospite</span><span>Torneo</span><span>Mercato</span><span>Pronostico</span><span>Quota</span><span></span></div>
      ${imp.legs.map((l,i)=>`<div class="rg-imp-leg"><span class="n">${i+1}</span>
        <input value="${esc(l.home)}" data-ir="${i}" data-irf="home" placeholder="Casa"><input value="${esc(l.away)}" data-ir="${i}" data-irf="away" placeholder="Ospite"><input value="${esc(l.league)}" data-ir="${i}" data-irf="league" placeholder="Torneo"><input value="${esc(l.market)}" data-ir="${i}" data-irf="market" placeholder="Mercato"><input value="${esc(l.pick)}" data-ir="${i}" data-irf="pick" placeholder="Pronostico"><input class="q" inputmode="decimal" value="${esc(String(l.odds).replace('.',','))}" data-ir="${i}" data-irf="odds">
        <button type="button" data-m="imp-del" data-i="${i}" title="Rimuovi">${ico('x')}</button>
        ${l.date||l.time?`<small class="rg-imp-when">${l.date?dateShort(l.date):''} ${esc(l.time||'')}</small>`:''}</div>`).join('')}
    </div>`:'';
  let actions=nL===1?`<button type="button" class="rg-btn primary" data-m="imp-apply" data-v="singola">${ico('check')}Usa come singola</button>`
    :nL>1?`<button type="button" class="rg-btn" data-m="imp-apply" data-v="singole" title="Crea una singola per ogni riga, tutte con lo stesso stake">Crea ${nL} singole</button><button type="button" class="rg-btn primary" data-m="imp-apply" data-v="multipla">${ico('check')}Importa come multipla</button>`:'';
  openModalShell(`<div class="rg-modal-head"><div><small>${d.type==='singola'?'SINGOLA':d.type==='multipla'?'MULTIPLA':'SISTEMA'} · IMPORTA BOLLETTA</small><h3>Importa la bolletta giocata</h3></div><button type="button" class="rg-x" data-m="imp-close" title="Torna alla bet">${ico('x')}</button></div>
    <div class="rg-modal-body"><div class="rg-seg big">${tab('paste')}${tab('file')}${tab('ocr')}</div>${input}${imp.error?`<div class="rg-imp-err">${esc(imp.error)}</div>`:''}${rows}</div>
    <div class="rg-modal-foot"><button type="button" class="rg-btn ghost" data-m="imp-close">← Torna alla bet</button>${actions}</div>`,true);
  if(imp.mode==='paste'&&!nL)setTimeout(()=>{let t=document.querySelector('#rgOverlay .rg-imp-raw');if(t&&document.activeElement!==t){t.focus();t.setSelectionRange(t.value.length,t.value.length)}},0);
}
/* "Serie B" senza paese ma con squadre brasiliane/argentine -> aggiunge il paese al torneo */
function fixLeague(league,home,away){league=String(league||'').trim();if(!league||COUNTRY_FLAGS.some(([re])=>re.test(league)))return league;let t=[home,away].filter(Boolean);if(t.some(x=>BR_TEAM.test(x)))return 'Brasile - '+league;if(t.some(x=>AR_TEAM.test(x)))return 'Argentina - '+league;return league}
function legFromImp(l){return{home:l.home,away:l.away,league:fixLeague(l.league,l.home,l.away),market:l.market||'',pick:l.pick||'',odds:String(num(l.odds)||''),status:'open',date:l.date||modal.draft.date,time:l.time||''}}
function applyImport(kind){
  let d=modal.draft,imp=modal.imp,legs=imp.legs.filter(l=>l.home&&num(l.odds)>1);
  if(!legs.length){alert('Nessuna selezione valida: ogni riga deve avere almeno la squadra di casa e una quota maggiore di 1.');return}
  let stake=num(imp.stake);
  if(kind==='singola'){let l=legs[0];Object.assign(d,{type:'singola',home:l.home,away:l.away,league:fixLeague(l.league,l.home,l.away)||d.league,market:l.market||'',pick:l.pick||'',odds:String(num(l.odds)),legs:[]});if(l.date)d.date=l.date;if(l.time)d.time=l.time;if(stake>0)d.stake=stake;modal.imp=null;renderBetModal('[data-f="stake"]');return}
  if(kind==='multipla'){d.type=d.type==='sistema'?'sistema':'multipla';d.legs=legs.map(legFromImp);if(stake>0)d.stake=stake;if(num(imp.bonus)>0)d.bonus=String(r2(num(imp.bonus))).replace('.',',');let first=legs.find(l=>l.date);if(first&&first.date)d.date=first.date;modal.imp=null;renderBetModal();return}
  if(kind==='singole'){
    if(!(stake>0)){alert('Inserisci lo stake da usare per ogni singola.');return}
    if(!confirm(`Creare ${legs.length} singole da ${money(stake)} ciascuna (totale ${money(stake*legs.length)}) su ${bookName(d.book)}?`))return;
    let base=Date.now(),tags=String(d.tags||'').split(',').map(s=>s.trim()).filter(Boolean);
    legs.forEach((l,i)=>data.entries.push(normEntry({id:uid('bet'),kind:'bet',createdAt:base+i,date:l.date||d.date,time:l.time||d.time,sport:d.sport,league:fixLeague(l.league,l.home,l.away),home:l.home,away:l.away,market:l.market,pick:l.pick,type:'singola',book:d.book,odds:num(l.odds),stake,freebet:d.freebet,status:'open',tags,note:d.note})));
    save();closeModal();
  }
}

/* ---------- CSV / backup ---------- */
const CSV_COLS=['tipo_riga','data','ora','sport','torneo','casa','ospite','mercato','pronostico','tipo','sistema','book','quota','stake','freebet','bonus','esito','rientro','pl','tag','note','selezioni','da_book','a_book','importo'];
function csvCell(v){let s=String(v==null?'':v);return /[;"\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
function numIt(v){return v===''||v==null?'':String(r2(v)).replace('.',',')}
function exportCsv(){
  let rows=[CSV_COLS.join(';')];
  chrono(filtered()).forEach(e=>{
    let r={};
    if(e.kind==='bet'){let pl=betPL(e);Object.assign(r,{tipo_riga:'bet',data:e.date,ora:e.time,sport:e.sport,torneo:e.league,casa:e.home,ospite:e.away,mercato:e.market,pronostico:e.pick,tipo:e.type,sistema:e.system,book:bookName(e.book),quota:numIt(betOdds(e)),stake:numIt(e.stake),freebet:e.freebet?'si':'',bonus:n(e.bonus)?numIt(e.bonus):'',esito:e.status,rientro:e.ret?numIt(e.ret):'',pl:pl==null?'':numIt(pl),tag:e.tags.join(', '),note:e.note,selezioni:e.legs.length?JSON.stringify(e.legs):''})}
    else if(e.kind==='transfer')Object.assign(r,{tipo_riga:'trasferimento',data:e.date,ora:e.time,da_book:bookName(e.from),a_book:bookName(e.to),importo:numIt(e.amount),note:e.note});
    else Object.assign(r,{tipo_riga:n(e.amount)>=0?'deposito':'prelievo',data:e.date,ora:e.time,book:bookName(e.book),importo:numIt(Math.abs(n(e.amount))),note:e.note});
    rows.push(CSV_COLS.map(c=>csvCell(r[c])).join(';'));
  });
  download('﻿'+rows.join('\r\n'),'registro-scommesse-'+todayIso()+'.csv','text/csv;charset=utf-8');
}
function backupJson(){download(JSON.stringify(data,null,1),'registro-scommesse-backup-'+todayIso()+'.json','application/json')}
function download(text,name,type){let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
function parseCsv(text){let sep=(text.split(/\r?\n/)[0].match(/;/g)||[]).length>=(text.split(/\r?\n/)[0].match(/,/g)||[]).length?';':',';let rows=[],row=[],cell='',q=false;for(let i=0;i<text.length;i++){let c=text[i];if(q){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++}else q=false}else cell+=c}else if(c==='"')q=true;else if(c===sep){row.push(cell);cell=''}else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell=''}else cell+=c}if(cell||row.length){row.push(cell);rows.push(row)}return rows.filter(r=>r.some(x=>String(x).trim()))}
function bookIdByName(name){name=String(name||'').trim();if(!name)return '';let b=data.books.find(x=>x.name.toLowerCase()===name.toLowerCase());if(!b){b={id:uid('bk'),name,color:'#5b6b7f',start:0};data.books.push(b)}return b.id}
function mapStatus(s){s=String(s||'').trim().toLowerCase();if(STATUS[s])return s;if(/^(v|w|vinta|vinto|win|won)$/.test(s))return 'win';if(/^(p|l|persa|perso|loss|lost)$/.test(s))return 'loss';if(/void|rimb|annull/.test(s))return 'void';if(/cash/.test(s))return 'cashout';return 'open'}
async function onImportFile(ev){
  let f=ev.target.files&&ev.target.files[0];ev.target.value='';if(!f)return;
  try{
    let text=await f.text();
    if(/\.json$/i.test(f.name)||text.trim().startsWith('{')){let j=normalize(JSON.parse(text));if(!confirm(`Ripristinare il backup? Sostituirà l'intero registro attuale (${data.entries.length} righe) con ${j.entries.length} righe.`))return;data=j;save();return}
    let rows=parseCsv(text.replace(/^﻿/,''));if(rows.length<2)throw new Error('File vuoto');
    let h=rows[0].map(x=>x.trim().toLowerCase()),col=k=>h.indexOf(k),get=(r,k)=>{let i=col(k);return i>=0?String(r[i]||'').trim():''};
    if(col('data')<0)throw new Error('Manca la colonna "data". Usa il formato dell\'export del Registro.');
    let added=[];
    rows.slice(1).forEach(r=>{
      let kind=get(r,'tipo_riga').toLowerCase()||'bet';
      if(kind==='trasferimento')added.push(normEntry({id:uid('tr'),kind:'transfer',date:get(r,'data'),time:get(r,'ora'),from:bookIdByName(get(r,'da_book')),to:bookIdByName(get(r,'a_book')),amount:num(get(r,'importo')),note:get(r,'note')}));
      else if(kind==='deposito'||kind==='prelievo'){let a=Math.abs(num(get(r,'importo'))||0);added.push(normEntry({id:uid('mv'),kind:'move',date:get(r,'data'),time:get(r,'ora'),book:bookIdByName(get(r,'book')),amount:kind==='prelievo'?-a:a,note:get(r,'note')}))}
      else{let legs=[];try{legs=get(r,'selezioni')?JSON.parse(get(r,'selezioni')):[]}catch(_){}let sp=get(r,'sport').toLowerCase();added.push(normEntry({id:uid('bet'),kind:'bet',date:get(r,'data'),time:get(r,'ora'),sport:SPORTS[sp]?sp:'calcio',league:get(r,'torneo'),home:get(r,'casa'),away:get(r,'ospite'),market:get(r,'mercato'),pick:get(r,'pronostico'),type:(get(r,'tipo')||'singola').toLowerCase(),system:get(r,'sistema'),book:bookIdByName(get(r,'book')),odds:num(get(r,'quota'))||0,stake:num(get(r,'stake'))||0,freebet:/^(si|sì|1|true|x)$/i.test(get(r,'freebet')),bonus:num(get(r,'bonus'))||0,status:mapStatus(get(r,'esito')),ret:num(get(r,'rientro'))||0,tags:get(r,'tag'),note:get(r,'note'),legs}))}
    });
    added=added.filter(e=>e.kind!=='bet'||n(e.stake)>0);
    if(!added.length)throw new Error('Nessuna riga valida trovata.');
    if(!confirm(`Importare ${added.length} righe nel registro? Verranno aggiunte a quelle esistenti.`))return;
    added.forEach((e,i)=>e.createdAt=Date.now()+i);data.entries.push(...added);save();
  }catch(err){alert('Import non riuscito: '+(err&&err.message||err))}
}

/* ---------- eventi ---------- */
document.addEventListener('click',e=>{
  let b=e.target.closest('#moneyBoard [data-rg]');if(!b)return;let a=b.dataset.rg,id=b.dataset.id;
  if(a==='new-bet')openBet(null);
  else if(a==='new-transfer')openTransfer(null);
  else if(a==='new-move')openMove(null);
  else if(a==='edit'){let x=data.entries.find(y=>y.id===id);if(!x)return;if(x.kind==='bet')openBet(id);else if(x.kind==='transfer')openTransfer(id);else openMove(id)}
  else if(a==='dup')openBet(id,true);
  else if(a==='del'){let x=data.entries.find(y=>y.id===id);if(!x)return;if(!confirm('Eliminare questa riga dal registro?'))return;data.entries=data.entries.filter(y=>y.id!==id);save()}
  else if(a==='settle'){let x=data.entries.find(y=>y.id===id);if(!x)return;let s=b.dataset.s;
    if(s==='cashout'||(s==='win'&&x.type==='sistema')){openCashout(id,s);return}
    x.status=s;if(s==='open'){x.ret=0;if(x.type==='multipla')x.legs.forEach(l=>{if(l.status!=='void')l.status='open'})}
    else if(x.type==='multipla'&&s==='win')x.legs.forEach(l=>{if(l.status==='open')l.status='win'});
    save()}
  else if(a==='leg'){let x=data.entries.find(y=>y.id===id);if(!x)return;let l=x.legs[Number(b.dataset.i)];if(!l)return;l.status=b.dataset.s;if(x.type==='multipla'&&x.status!=='cashout')x.status=multiStatus(x);save()}
  else if(a==='toggle-legs'){ui.expanded[id]=!ui.expanded[id];paint()}
  else if(a==='toggle-filters'){ui.filtersOpen=!ui.filtersOpen;paint()}
  else if(a==='clear-filters'){Object.keys(ui.f).forEach(k=>ui.f[k]='');paint()}
  else if(a==='tag'){ui.f.tag=b.dataset.t;ui.filtersOpen=true;paint()}
  else if(a==='last'){ui.last=b.dataset.v;ui.limit=150;saveUi();paint()}
  else if(a==='sort'){ui.sort=b.dataset.v;saveUi();paint()}
  else if(a==='panel'){ui.panel=ui.panel===b.dataset.p?'':b.dataset.p;saveUi();paint()}
  else if(a==='full'){ui.full=!ui.full;paint()}
  else if(a==='more'){ui.limit+=150;paint()}
  else if(a==='export')exportCsv();
  else if(a==='backup')backupJson();
  else if(a==='import'){let f=document.getElementById('rgImportFile');if(f)f.click()}
  else if(a==='sync'){cloudLoad(true).then(()=>{if(cloud.status==='sincronizzato')cloudPut()})}
  else if(a==='add-book'){let name=prompt('Nome del book');if(name&&name.trim()){data.books.push({id:uid('bk'),name:name.trim(),color:'#5b6b7f',start:0});save()}}
  else if(a==='del-book'){let used=data.entries.some(x=>x.book===id||x.from===id||x.to===id);if(used){alert('Questo book è usato da alcune righe del registro: non può essere eliminato. Puoi rinominarlo.');return}if(confirm('Eliminare il book?')){data.books=data.books.filter(x=>x.id!==id);save()}}
});
document.addEventListener('change',e=>{
  let t=e.target;if(!t.closest||!t.closest('#moneyBoard'))return;
  if(t.dataset.rgf!=null){ui.f[t.dataset.rgf]=t.value;ui.limit=150;paint();return}
  if(t.id==='rgStartBank'){let v=num(t.value);if(v>=0){data.startBank=v;save()}else paint();return}
  if(t.dataset.rgb){let bk=bookById(t.dataset.id);if(!bk)return;let f=t.dataset.rgb;if(f==='name'){if(t.value.trim())bk.name=t.value.trim()}else if(f==='color')bk.color=t.value;else if(f==='start'){let v=num(t.value);bk.start=Number.isFinite(v)?v:0}save()}
});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&modal){closeModal();return}
  if(e.key==='Enter'&&modal&&e.target.closest&&e.target.closest('#rgOverlay')&&e.target.tagName==='INPUT'&&!(e.target.list)){e.preventDefault();let s=document.querySelector('#rgOverlay [data-m="save"]');if(s)s.click();return}
  if(e.key==='Enter'&&e.target.id==='rgStartBank'){e.target.blur()}
  if(e.key==='Escape'&&ui.full&&root()&&root().classList.contains('show')){ui.full=false;paint()}
});
window.addEventListener('focus',()=>{if(root()&&root().classList.contains('show'))cloudLoad(true)});

/* API pubblica: easybet.js chiama render() ogni volta che ridisegna la vista. */
let booted=false;
function render(){let r=root();if(!r)return;r.classList.add('show');['masanielloBoard','kellyBoard'].forEach(id=>{let x=document.getElementById(id);if(x)x.classList.remove('show')});
  if(!booted){booted=true;paint();cloudLoad(false);return}
  if(!r.querySelector('#rgBody'))paint();
}
window.EasyBetMoney={render,paint,get data(){return data},exportCsv};
window.EasyBetRegistro=window.EasyBetMoney;
})();
