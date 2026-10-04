(function(){
'use strict';
let state={items:[],filtered:[],onSelect:null,title:'Scegli partita dal Betting classico',loading:false};
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function isoToday(){let d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),dd=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${dd}`}
function dateIt(s){if(!s)return 'Senza data';let m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s));if(!m)return s;let d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]));return d.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'})}
function sortItems(a,b){let ka=(a.data||'9999-99-99')+' '+(a.ora||'99:99'),kb=(b.data||'9999-99-99')+' '+(b.ora||'99:99');return ka.localeCompare(kb)}
function norm(m){let data=m.data||m.date||'';let ora=m.ora||m.time||'';let casa=m.casa||m.home||'';let trasferta=m.trasferta||m.away||'';let tipoGiocata=m.tipoGiocata||m.strategy||'';let desc=m.desc||[casa,trasferta].filter(Boolean).join(' - ');let descWithMarket=desc+(tipoGiocata?(' · '+tipoGiocata):'');return Object.assign({},m,{data,ora,casa,trasferta,tipoGiocata,desc,descWithMarket})}
function filter(q){q=String(q||'').trim().toLowerCase();state.filtered=!q?state.items.slice():state.items.filter(m=>[m.casa,m.trasferta,m.campionato,m.tipoGiocata,m.desc].filter(Boolean).join(' ').toLowerCase().includes(q));paintList()}
function overlay(){return document.getElementById('ebBetPicker')}
function close(){let o=overlay();if(o)o.remove()}
function initials(name){return String(name||'').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'•'}
function crestUrl(name,campionato){return '/api/team-crest?name='+encodeURIComponent(name||'')+(campionato?'&country='+encodeURIComponent(campionato):'')}
function crest(name,campionato){let init=initials(name),url=crestUrl(name,campionato);return `<span class="ebbp-crest"><img src="${url}" alt="" onerror="this.style.display='none';this.parentNode.classList.add('placeholder')"><span>${esc(init)}</span></span>`}
function marketBadge(m){
  let quota = m.quotaIngresso ? `<small>@ ${esc(m.quotaIngresso)}</small>` : '';
  return `<div class="ebbp-marketbox"><span>Giocata</span><b>${esc(m.tipoGiocata||'—')}</b>${quota}</div>`;
}
function rowMarkup(m){
  return `<button class="ebbp-row" data-ebbp-id="${esc(m.id)}">
    <div class="ebbp-timecol"><span class="ebbp-time">${esc(m.ora||'—')}</span></div>
    <div class="ebbp-maincol">
      <div class="ebbp-teams-line">
        ${crest(m.casa,m.campionato)}
        <div class="ebbp-teamname home">${esc(m.casa||'—')}</div>
        <div class="ebbp-vs">vs</div>
        <div class="ebbp-teamname away">${esc(m.trasferta||'—')}</div>
        ${crest(m.trasferta,m.campionato)}
      </div>
      <div class="ebbp-meta">${esc(m.campionato||'')} ${m.campionato&&m.tipoGiocata?'•':''} ${m.tipoGiocata?`<span class="ebbp-inline-market">${esc(m.tipoGiocata)}</span>`:''}</div>
    </div>
    <div class="ebbp-sidecol">${marketBadge(m)}</div>
  </button>`;
}
function paintList(){
  let box=document.getElementById('ebBetPickerList');if(!box)return;
  if(state.loading){box.innerHTML='<div class="ebbp-empty">Caricamento partite…</div>';return}
  if(!state.filtered.length){box.innerHTML='<div class="ebbp-empty">Nessuna partita del Betting classico trovata.</div>';return}
  let groups={};state.filtered.forEach(m=>{let k=m.data||'Senza data';(groups[k]||(groups[k]=[])).push(m)});
  box.innerHTML=Object.keys(groups).sort().map(k=>`<section class="ebbp-day"><h4>${esc(dateIt(k))}</h4>${groups[k].map(rowMarkup).join('')}</section>`).join('')
}
function shell(){
  let o=document.createElement('div');o.id='ebBetPicker';o.className='ebbp-overlay';
  o.innerHTML=`<div class="ebbp-modal"><div class="ebbp-head"><div><small>BETTING CLASSICO</small><h3>${esc(state.title)}</h3></div><button type="button" data-ebbp-close>×</button></div><div class="ebbp-search"><input id="ebBetPickerSearch" placeholder="Cerca squadra, campionato o strategia…" autocomplete="off"></div><div id="ebBetPickerList" class="ebbp-list"></div></div>`;
  document.body.appendChild(o);
  o.addEventListener('click',e=>{if(e.target===o||e.target.closest('[data-ebbp-close]')){close();return}let b=e.target.closest('[data-ebbp-id]');if(b){let m=state.items.find(x=>String(x.id)===String(b.dataset.ebbpId));if(m&&typeof state.onSelect==='function'){let cb=state.onSelect;close();cb(m)}}});
  let s=o.querySelector('#ebBetPickerSearch');s.addEventListener('input',()=>filter(s.value));setTimeout(()=>s.focus(),0);paintList()
}
function open(opts){opts=opts||{};close();state.onSelect=typeof opts.onSelect==='function'?opts.onSelect:null;state.title=opts.title||'Scegli partita dal Betting classico';state.items=[];state.filtered=[];state.loading=true;shell();fetch('/api/matches?ts='+Date.now(),{cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(payload=>{let rows=Array.isArray(payload)?payload:(Array.isArray(payload&&payload.matches)?payload.matches:[]);let today=isoToday();state.items=rows.filter(m=>(m.bettingArea||'live')==='classic').map(norm).filter(m=>!m.data||String(m.data)>=today).sort(sortItems);state.filtered=state.items.slice();state.loading=false;paintList()}).catch(()=>{state.loading=false;state.items=[];state.filtered=[];let box=document.getElementById('ebBetPickerList');if(box)box.innerHTML='<div class="ebbp-empty">Impossibile caricare le partite. Riprova tra poco.</div>'})}
window.EasyBetBettingPicker={open,close};
})();
