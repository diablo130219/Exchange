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
function crest(name,campionato){return `<span class="ebbp-crest ebbp-js-crest placeholder" data-team="${esc(name||'')}" data-league="${esc(campionato||'')}"><img alt="" style="display:none"><span>${esc(initials(name))}</span></span>`}
function hydratePickerCrests(){
  document.querySelectorAll('#ebBetPicker .ebbp-js-crest').forEach(el=>{
    if(el.dataset.loaded==='1'||el.dataset.loading==='1')return;
    let team=el.dataset.team||'', league=el.dataset.league||''; if(!team)return;
    el.dataset.loading='1';
    fetch('/api/team-crest?name='+encodeURIComponent(team)+(league?'&country='+encodeURIComponent(league):''),{cache:'no-store'})
      .then(r=>r.ok?r.json():null).then(d=>{if(d&&d.url){let img=el.querySelector('img');img.src=d.url;img.style.display='block';el.classList.remove('placeholder');el.dataset.loaded='1'}})
      .catch(()=>{}).finally(()=>{delete el.dataset.loading});
  });
}
function marketBadge(m){return `<div class="ebbp-marketbox"><span>Giocata</span><b>${esc(m.tipoGiocata||'—')}</b>${m.quotaIngresso?`<small>@ ${esc(m.quotaIngresso)}</small>`:''}</div>`}
function rowMarkup(m){return `<button class="ebbp-row" data-ebbp-id="${esc(m.id)}"><div class="ebbp-timecol"><span class="ebbp-time">${esc(m.ora||'—')}</span></div><div class="ebbp-maincol"><div class="ebbp-teamrow"><div class="ebbp-team">${crest(m.casa,m.campionato)}<strong>${esc(m.casa||'—')}</strong></div><span class="ebbp-vs">VS</span><div class="ebbp-team away"><strong>${esc(m.trasferta||'—')}</strong>${crest(m.trasferta,m.campionato)}</div></div><div class="ebbp-league">${esc(m.campionato||'')}</div></div><div class="ebbp-sidecol">${marketBadge(m)}</div></button>`}
function paintList(){let box=document.getElementById('ebBetPickerList');if(!box)return;if(state.loading){box.innerHTML='<div class="ebbp-empty">Caricamento partite…</div>';return}if(!state.filtered.length){box.innerHTML='<div class="ebbp-empty">Nessuna partita del Betting classico trovata.</div>';return}let groups={};state.filtered.forEach(m=>{let k=m.data||'Senza data';(groups[k]||(groups[k]=[])).push(m)});box.innerHTML=Object.keys(groups).sort().map(k=>`<section class="ebbp-day"><h4>${esc(dateIt(k))}</h4>${groups[k].map(rowMarkup).join('')}</section>`).join('');setTimeout(hydratePickerCrests,0)}
function shell(){let o=document.createElement('div');o.id='ebBetPicker';o.className='ebbp-overlay';o.innerHTML=`<div class="ebbp-modal"><div class="ebbp-head"><div><small>BETTING CLASSICO</small><h3>${esc(state.title)}</h3></div><button type="button" data-ebbp-close>×</button></div><div class="ebbp-search"><input id="ebBetPickerSearch" placeholder="Cerca squadra, campionato o strategia…" autocomplete="off"></div><div id="ebBetPickerList" class="ebbp-list"></div></div>`;document.body.appendChild(o);o.addEventListener('click',e=>{if(e.target===o||e.target.closest('[data-ebbp-close]')){close();return}let b=e.target.closest('[data-ebbp-id]');if(b){let m=state.items.find(x=>String(x.id)===String(b.dataset.ebbpId));if(m&&typeof state.onSelect==='function'){let cb=state.onSelect;close();cb(m)}}});let s=o.querySelector('#ebBetPickerSearch');s.addEventListener('input',()=>filter(s.value));setTimeout(()=>s.focus(),0);paintList()}
function open(opts){opts=opts||{};close();state.onSelect=typeof opts.onSelect==='function'?opts.onSelect:null;state.title=opts.title||'Scegli partita dal Betting classico';state.items=[];state.filtered=[];state.loading=true;shell();fetch('/api/matches?ts='+Date.now(),{cache:'no-store',credentials:'same-origin'}).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.json()}).then(payload=>{let rows=Array.isArray(payload)?payload:(Array.isArray(payload&&payload.matches)?payload.matches:[]);let today=isoToday();state.items=rows.filter(m=>(m.bettingArea||'live')==='classic').map(norm).filter(m=>!m.data||String(m.data)>=today).sort(sortItems);state.filtered=state.items.slice();state.loading=false;paintList()}).catch(()=>{state.loading=false;state.items=[];state.filtered=[];let box=document.getElementById('ebBetPickerList');if(box)box.innerHTML='<div class="ebbp-empty">Impossibile caricare le partite. Riprova tra poco.</div>'})}
window.EasyBetBettingPicker={open,close};
})();
