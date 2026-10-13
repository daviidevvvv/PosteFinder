import {NETWORKS,ACTIONS,validateCatalog,siteOpening,planParcels,navigationUrl,interpretCarrierText} from './carrier-planner.mjs';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hh=n=>String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0');
const dayLabels={mon:'Lun',tue:'Mar',wed:'Mer',thu:'Gio',fri:'Ven',sat:'Sab',sun:'Dom'};
const sourceLink=url=>/^https:\/\//.test(url||'')?url:'#';
if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
try {await start();}catch(error){console.warn('PosteFinder: modulo corrieri non caricato',error?.message);}
async function start(){
 const bridge=window.PosteFinderCarriers;if(!bridge)return;
 const r=await fetch(new URL('../data/carrier-catalog.json',import.meta.url),{cache:'no-cache'});
 if(!r.ok)throw new Error('Catalogo corrieri HTTP '+r.status);
 const catalog=await r.json();validateCatalog(catalog);
 const byId=new Map(), byLegacy=new Map(), auditSchedules=new WeakMap();
 let nextId=8100;for(const s of catalog.sites){s.appId=s.legacyId??nextId++;byId.set(s.id,s);byLegacy.set(s.appId,s);}
 const original=bridge.locations();
 const present=new Set(original.map(l=>l.id));
 const additions=catalog.sites.filter(s=>!present.has(s.appId)).map(s=>({id:s.appId,kind:s.kind,realName:s.name,address:s.address,services:s.memberships.map(m=>NETWORKS[m.network]).join(' / '),hasPoste:false,hasLis:false,coords:s.coords,schedule:{}}));
 let selectedNetwork='all', timer=null;
 const list=document.getElementById('locations-list');
 const panel=document.createElement('section');panel.id='carrier-panel';panel.className='px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0 text-xs';
 panel.innerHTML=`<label class="flex items-center gap-2 mb-2 text-slate-600">Rete / formato <select id="carrier-filter" class="flex-1 min-w-0 border rounded px-2 py-1 bg-white"><option value="all">Tutte (anche dati storici)</option><option value="brt_digital">BRT Digital (QR) · candidati da verificare</option>${catalog.coverage.map(c=>`<option value="${c.network}">${escape(c.label)}${c.count?' · '+c.count:' · da verificare'}</option>`).join('')}</select></label>
 <details id="parcel-organizer" class="group">
   <summary class="cursor-pointer font-bold text-blue-700 py-2">Organizza i miei pacchi / corrieri</summary>
   <div id="parcel-wizard-content" class="pt-2 pb-3 space-y-3 max-h-[54vh] md:max-h-[64vh] overflow-y-auto overscroll-contain">
     <p class="text-[10px] text-slate-500">Bisceglie · dati consultati il ${escape(catalog.observedAt)}. Copertura parziale: le reti non verificate non vengono inventate.</p>
     <div id="parcel-progress" class="grid grid-cols-3 gap-1 text-center text-[10px] font-semibold" aria-label="Fasi di ricerca">
       <span data-wizard-step="1" class="rounded-md border p-1.5 bg-blue-600 text-white border-blue-600">1. Pacchi</span>
       <span data-wizard-step="2" class="rounded-md border p-1.5 border-slate-200 text-slate-500">2. Partenza</span>
       <span data-wizard-step="3" class="rounded-md border p-1.5 border-slate-200 text-slate-500">3. Risultati</span>
     </div>
     <section id="parcel-stage-parcels" class="space-y-2" aria-label="Pacchi e corrieri">
       <h4 class="font-bold text-slate-800 text-sm">Quali pacchi devi gestire?</h4>
       <p class="text-slate-600">Per ogni pacco scegli il corriere e poi il tipo di servizio. BRT Digital e BRT con etichetta stampata sono differenti.</p>
       <div id="parcel-rows" class="space-y-2"></div>
       <button type="button" id="parcel-add" class="w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-blue-800 font-semibold">+ Aggiungi un altro pacco (max 4)</button>
       <p id="parcel-parcel-error" role="alert" class="hidden rounded border border-amber-300 bg-amber-50 p-2 text-amber-900"></p>
       <button type="button" id="parcel-next-location" class="w-full rounded-lg bg-blue-600 text-white py-2.5 font-bold">Continua: scegli la partenza →</button>
     </section>
     <section id="parcel-stage-location" class="hidden space-y-2" aria-label="Posizione di partenza e arrivo">
       <h4 class="font-bold text-slate-800 text-sm">Da dove vuoi partire?</h4>
       <p id="parcel-selection-summary" class="text-[11px] rounded bg-blue-50 text-blue-900 p-2"></p>
       <div id="parcel-origin-shortcuts" role="group" aria-label="Partenze rapide" class="flex flex-wrap gap-1.5"></div>
       <label class="block font-medium text-slate-700">Posizione o luogo salvato
         <select id="parcel-origin" class="block w-full mt-1 border rounded-lg p-2 bg-white"></select>
       </label>
       <button type="button" id="parcel-gps-request" class="rounded border border-blue-200 bg-white px-2 py-1.5 text-blue-700 font-semibold">Rileva posizione attuale con GPS</button>
       <p id="parcel-origin-hint" role="status" class="text-[11px] text-slate-600"></p>
       <label class="block font-medium text-slate-700">Dove devi arrivare? (facoltativo)
         <select id="parcel-destination" class="block w-full mt-1 border rounded-lg p-2 bg-white"></select>
       </label>
       <details id="parcel-advanced" class="border rounded-lg bg-white p-2">
         <summary class="cursor-pointer font-semibold text-slate-700">Orari e distanza · opzioni avanzate</summary>
         <div class="space-y-2 pt-2">
           <div class="grid grid-cols-2 gap-2">
             <label>Raggio <select id="parcel-radius" class="block w-full border rounded p-1.5 bg-white"><option value="3">3 km</option><option value="5">5 km</option><option value="10" selected>10 km</option><option value="20">20 km</option></select></label>
             <label>Massimo soste <select id="parcel-max-stops" class="block w-full border rounded p-1.5 bg-white"><option>1</option><option>2</option><option selected>3</option><option>4</option></select></label>
           </div>
           <label class="flex items-start gap-1.5"><input type="checkbox" id="parcel-open" checked class="mt-0.5"> Solo nella fascia di apertura prudenziale adesso</label>
           <p class="text-[10px] text-slate-500">Le distanze sono in linea d'aria; traffico e apertura all'arrivo non sono calcolati.</p>
         </div>
       </details>
       <p id="parcel-location-error" class="hidden rounded border border-amber-300 bg-amber-50 p-2 text-amber-900" role="alert"></p>
       <div class="grid grid-cols-3 gap-2">
         <button type="button" id="parcel-back-packages" class="rounded border border-slate-300 py-2 font-semibold">← Indietro</button>
         <button type="button" id="parcel-calculate" class="col-span-2 rounded bg-blue-600 text-white py-2 font-bold">Trova i punti →</button>
       </div>
     </section>
     <section id="parcel-stage-results" class="hidden space-y-2" aria-label="Risultati e percorsi">
       <h4 class="font-bold text-slate-800 text-sm">Dove puoi andare</h4>
       <p id="parcel-results-summary" class="text-[11px] rounded bg-blue-50 text-blue-900 p-2"></p>
       <div class="grid grid-cols-2 gap-2">
         <button type="button" id="parcel-edit-packages" class="rounded border border-slate-300 p-2 font-semibold">← Modifica pacchi</button>
         <button type="button" id="parcel-edit-location" class="rounded border border-slate-300 p-2 font-semibold">← Cambia partenza</button>
       </div>
       <div id="parcel-result" role="status" aria-live="polite" class="space-y-2"></div>
     </section>
     <details class="text-slate-500 border-t pt-2"><summary class="cursor-pointer">Fonti, copertura e limiti</summary>${catalog.coverage.map(c=>`<p class="mt-1"><b>${escape(c.label)}:</b> ${escape(c.note)} <a target="_blank" rel="noopener noreferrer" href="${escape(sourceLink(c.sourceUrl))}" class="underline">Fonte</a></p>`).join('')}</details>
   </div>
 </details>`;
 list.parentElement.insertBefore(panel,list.previousElementSibling);
 const organizer=panel.querySelector('#parcel-organizer'), rows=panel.querySelector('#parcel-rows'), result=panel.querySelector('#parcel-result');
 const stateSelects=()=>{
   const state=bridge.state(),options=[['gps','Posizione attuale (Trovami)'],['reference','Riferimento della mappa'],...state.places.map(p=>['place:'+p.id,p.name])];
   for(const id of ['parcel-origin','parcel-destination']){
    const select=panel.querySelector('#'+id), prior=select.value;
    const opts=id==='parcel-destination'?[['none','Nessun arrivo'],...options.slice(2)]:options;
    select.innerHTML=opts.map(([v,t])=>`<option value="${escape(v)}">${escape(t)}</option>`).join('');
    if(opts.some(([v])=>v===prior))select.value=prior;
   }
 };
 stateSelects();organizer.addEventListener('toggle',()=>{if(organizer.open)stateSelects();});
 function addRow(network='brt',action='dropoff',brtFormat='digital'){
  if(rows.children.length>=4)return;
  const row=document.createElement('div');row.className='parcel-row border border-slate-200 rounded-lg p-2 bg-white';
  row.innerHTML=`<div class="flex gap-1 mb-1"><select class="parcel-network min-w-0 flex-1 border rounded p-1" aria-label="Corriere"><option value="dhl_unspecified">DHL: scegli Express o eCommerce</option>${Object.entries(NETWORKS).map(([v,t])=>`<option value="${v}">${escape(t)}</option>`).join('')}</select><button type="button" class="parcel-remove px-2 text-red-600" aria-label="Rimuovi pacco">×</button></div>
  <select class="parcel-action w-full border rounded p-1 mb-1" aria-label="Operazione">${Object.entries(ACTIONS).map(([v,t])=>`<option value="${v}">${escape(t)}</option>`).join('')}</select>
  <label class="parcel-label flex items-start gap-1 text-[10px]"><input class="parcel-confirm mt-0.5" type="checkbox">Etichetta/QR emessi per questa rete; ho verificato limiti e istruzioni del venditore.</label>
  <select class="parcel-assigned hidden w-full border rounded p-1 text-[10px]" aria-label="Punto assegnato nell'avviso"></select>`;
  // The BRT Digital Parcel Label (QR) is not the same as a printed label.
  const formatWrap=document.createElement('label');
  formatWrap.className='parcel-brt-format-wrap block mb-1 text-[11px]';
  formatWrap.textContent='Formato etichetta BRT';
  const formatSelect=document.createElement('select');
  formatSelect.className='parcel-brt-format block w-full border rounded p-1 bg-white';
  formatSelect.setAttribute('aria-label','Formato etichetta BRT');
  for(const [v,label] of [['digital','BRT Digital / QR (senza stampa)'],['printed','BRT tradizionale (etichetta stampata)']]){
    const opt=document.createElement('option');opt.value=v;opt.textContent=label;formatSelect.append(opt);
  }
  formatWrap.append(formatSelect);row.querySelector('.parcel-action').after(formatWrap);
  const formatNote=document.createElement('p');
  formatNote.className='parcel-brt-note text-[10px] text-amber-800 mb-1';
  formatNote.textContent='Edicolandia NON accetta BRT Digital. Per gli altri punti il servizio QR e da confermare prima di partire.';
  formatWrap.after(formatNote);
  row.querySelector('.parcel-network').value=network;row.querySelector('.parcel-action').value=action;formatSelect.value=brtFormat;
  const update=()=>{
   const net=row.querySelector('.parcel-network').value,isPickup=row.querySelector('.parcel-action').value==='pickup',isBrt=net==='brt';
   row.querySelector('.parcel-brt-format-wrap').classList.toggle('hidden',!isBrt||isPickup||row.querySelector('.parcel-action').value==='return_qr');
   row.querySelector('.parcel-brt-note').classList.toggle('hidden',!isBrt||isPickup);
   row.querySelector('.parcel-label').classList.toggle('hidden',isPickup);
   const select=row.querySelector('.parcel-assigned');select.classList.toggle('hidden',!isPickup);
   select.innerHTML='<option value="">Punto indicato nell\'avviso di consegna...</option>'+catalog.sites.filter(s=>s.memberships.some(m=>m.network===net)).map(s=>`<option value="${s.id}">${escape(s.name)} — ${escape(s.address)}</option>`).join('');
   row.querySelector('.parcel-confirm').checked=false;
  };
  row.querySelector('.parcel-network').addEventListener('change',update);row.querySelector('.parcel-action').addEventListener('change',update);row.querySelector('.parcel-brt-format').addEventListener('change',update);
  row.querySelector('.parcel-remove').addEventListener('click',()=>{if(rows.children.length>1)row.remove();});rows.appendChild(row);update();
 }
 addRow('dhl_express');addRow('brt');panel.querySelector('#parcel-add').addEventListener('click',()=>addRow());
 function point(value,state){if(value==='gps')return state.gps;if(value==='reference')return state.reference;if(value.startsWith('place:'))return state.places.find(p=>String(p.id)===value.slice(6))?.coords??null;return null;}
 panel.querySelector('#parcel-calculate').addEventListener('click',()=>{
  const state=bridge.state(),origin=point(panel.querySelector('#parcel-origin').value,state),target=panel.querySelector('#parcel-destination').value;
  const destination=target==='none'?null:point(target,state);
  if(target!=='none'&&!destination){result.textContent='Il luogo di arrivo non ha coordinate: configurale dalla matita del luogo.';return;}
  const demands=[...rows.children].map(row=>({network:row.querySelector('.parcel-network').value,action:row.querySelector('.parcel-action').value,labelConfirmed:row.querySelector('.parcel-confirm').checked,assignedPointId:row.querySelector('.parcel-assigned').value||null,brtFormat:row.querySelector('.parcel-network').value==='brt'?(row.querySelector('.parcel-action').value==='return_qr'?'digital':row.querySelector('.parcel-brt-format').value):undefined}));
  const liveIds=new Set(bridge.locations().map(l=>l.id));
  const exclusions=catalog.sites.filter(s=>state.removedIds.includes(s.appId)||!liveIds.has(s.appId)).map(s=>s.id);
  const plan=planParcels(catalog,demands,{origin,destination,openOnly:panel.querySelector('#parcel-open').checked,radiusKm:Number(panel.querySelector('#parcel-radius').value),maxStops:Number(panel.querySelector('#parcel-max-stops').value),excludedSiteIds:exclusions});
  result.replaceChildren();
  if(plan.status!=='ok'&&plan.status!=='provisional'){
   const p=document.createElement('p');p.className='rounded border border-amber-200 bg-amber-50 p-2';p.textContent=plan.message;
   if(plan.missing?.length)p.textContent+=' Da coprire: '+plan.missing.map(d=>NETWORKS[d.network]).join(', ');result.appendChild(p);return;
  }
  const summary=document.createElement('p');summary.className='font-semibold text-slate-700';summary.textContent='Risultati sui punti censiti, non su tutta la rete. Riferimento orari: '+new Date(plan.evaluatedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'});result.append(summary);
  if(plan.status==='provisional'){
    const caution=document.createElement('p');caution.className='rounded border border-amber-300 bg-amber-50 p-2 font-semibold text-amber-900';
    caution.textContent='ATTENZIONE: i punti BRT Digital qui sono CANDIDATI NON VERIFICATI. Chiedi conferma prima di partire. Edicolandia esclusa: non accetta BRT Digital / QR (segnalazione utente).';
    result.append(caution);
  }
  for(const [i,p] of plan.plans.entries()){
   const el=document.createElement('article');el.className='rounded-lg border border-blue-200 bg-white p-2 space-y-1';
   el.innerHTML=`<b>${i+1}. ${p.stops.length} ${p.stops.length===1?'sosta':'soste'} · ${(p.distanceMetres/1000).toFixed(2)} km in linea d'aria</b>${p.extraMetres!==null?`<p>Deviazione geometrica indicativa: ${(p.extraMetres/1000).toFixed(2)} km</p>`:''}${p.stops.map((s,j)=>`<p><button type="button" data-site="${s.id}" class="text-blue-700 underline font-bold">${j+1}. ${escape(s.name)}</button><br>${escape(s.address)}<br><span class="text-[10px]">${p.assignments.filter(a=>a.siteId===s.id).map(a=>escape(NETWORKS[a.network])+' · '+escape(ACTIONS[a.action])+(a.network==='brt'&&a.brtFormat==='digital'?' · BRT Digital'+(a.provisional?' (DA CONFERMARE)':''):'')).join('; ')}</span></p>`).join('')}<p class="text-[10px] text-amber-800">${p.warnings.map(escape).join(' ')}</p><a class="block text-center rounded bg-blue-600 text-white py-1 mt-1" target="_blank" rel="noopener noreferrer" href="${escape(navigationUrl(p,{origin,destination}))}">Apri percorso stradale in Google Maps</a>`;
   el.querySelectorAll('[data-site]').forEach(b=>b.addEventListener('click',()=>bridge.focus(byId.get(b.dataset.site).appId)));result.appendChild(el);
  }
  if(plan.plans[0].stops.length>3&&destination){const note=document.createElement('p');note.textContent='Con quattro soste piu arrivo, Google Maps mobile puo limitare i punti intermedi: verifica che siano tutti presenti.';result.append(note);}
 });
 panel.querySelector('#carrier-filter').addEventListener('change',e=>{selectedNetwork=e.target.value;bridge.refresh();if(selectedNetwork!=='all'&&selectedNetwork!=='brt_digital'&&!catalog.sites.some(s=>s.memberships.some(m=>m.network===selectedNetwork))){organizer.open=true;result.textContent='Per questa rete non ho ancora punti verificati nella raccolta. Non significa che non esistano: consulta la fonte in Copertura.';}});
 function audit(){
  for(const l of bridge.locations()){
   const s=byLegacy.get(l.id);if(!s)continue;
   l.realName=s.name;l.address=s.address;l.coords=[...s.coords];l.schedule={...s.memberships[0].hours};auditSchedules.set(l.schedule,s);
  }
 }
 function decorate(data){
  for(const l of data){
   const card=document.getElementById('loc-'+l.id);if(!card)continue;
   card.querySelectorAll('.carrier-source').forEach(el=>el.remove());
   const s=byLegacy.get(l.id),el=document.createElement('div');el.className='carrier-source text-[10px] mt-2 text-slate-500';
   if(!s){el.textContent='Dato storico: corrieri e orari non ricontrollati.';card.append(el);continue;}
   const nets=s.memberships.map(m=>NETWORKS[m.network]);
   el.innerHTML=`<div class="flex flex-wrap gap-1">${nets.map(n=>`<span class="rounded border border-blue-100 bg-blue-50 text-blue-800 px-1">${escape(n)}</span>`).join('')}</div><p class="mt-1">Fonti consultate ${escape(catalog.observedAt)} · non verifica in tempo reale</p>${s.conflicts.length?'<p class="text-amber-800">Dati discordanti: controlla le fonti.</p>':''}<details class="mt-1"><summary>Orari, limiti e fonti per corriere</summary>${s.memberships.map(m=>`<div class="mt-2"><a class="underline font-bold" target="_blank" rel="noopener noreferrer" href="${escape(sourceLink(m.sourceDetailsUrl||m.sourceUrl))}">${escape(NETWORKS[m.network])} · ${escape(m.pointId)}</a><p>${Object.entries(dayLabels).map(([d,t])=>t+' '+(m.hours[d].length?m.hours[d].map(([a,b])=>hh(a)+'–'+hh(b)).join(', '):'chiuso')).join('<br>')}</p><p>${escape(m.conditions.join(' '))}</p>${m.userReport?'<p class="text-amber-800">'+escape(m.userReport)+'</p>':''}<p>Limite peso fonte: ${m.limits?.maxWeightKg??'?'} kg${m.limits?.maxDimensionsCm?' · '+m.limits.maxDimensionsCm.join('×')+' cm':''}${m.cutoffMinute!=null?' · cutoff '+hh(m.cutoffMinute):''}</p>${m.freshnessNote?'<p>'+escape(m.freshnessNote)+'</p>':''}</div>`).join('')}${s.conflicts.map(c=>'<p class="text-amber-800 mt-1">'+escape(c.note)+'</p>').join('')}</details>`;
   const brt=s.memberships.find(m=>m.network==='brt');
   if(brt){
     const flag=document.createElement('p');
     flag.className='rounded mt-1 p-1 font-bold '+(brt.brtDigitalStatus==='not_supported_reported'?'bg-red-50 text-red-800':'bg-amber-50 text-amber-800');
     flag.textContent=brt.brtDigitalStatus==='not_supported_reported'?'BRT Digital / QR: NON ACCETTATO qui (segnalazione utente). Solo BRT con etichetta stampata.':brt.brtDigitalStatus==='confirmed'?'BRT Digital / QR: accettazione confermata':'BRT Digital / QR: da verificare con il negozio';
     el.querySelector('details')?.before(flag);
   }
   el.addEventListener('click',e=>e.stopPropagation());card.append(el);
  }
 }
 bridge.install({beforeRefresh:audit,decorate,
  baseFilter:l=>bridge.state().filter==='poste'&&byLegacy.has(l.id)?true:null,
  filter:l=>selectedNetwork==='all'||Boolean(byLegacy.get(l.id)?.memberships.some(m=>selectedNetwork==='brt_digital'?(m.network==='brt'&&m.brtDigitalStatus!=='not_supported_reported'):m.network===selectedNetwork)),
  status:schedule=>{
   const s=auditSchedules.get(schedule);if(!s)return {isOpen:false,text:'Orari non verificati',class:'status-warning',score:-1};
   const state=siteOpening(s);return {isOpen:state.open===true,text:state.label,class:state.open===true?'status-open':state.open===false?'status-closed':'status-warning',score:state.open===true?3:state.open===false?0:-1};
  },
  chat:text=>{
   const parsed=interpretCarrierText(text);if(!parsed.networks.length&&!parsed.amazon)return false;
   bridge.consumeMessage();bridge.message(text,'user');organizer.open=true;stateSelects();rows.replaceChildren();
   const networks=parsed.networks.length?parsed.networks:['amazon'];networks.slice(0,4).forEach(n=>addRow(n,parsed.action,parsed.brtFormat));
   if(parsed.towardHome){const home=bridge.state().places.find(p=>p.id===-101||p.name.toLowerCase()==='casa');if(home)panel.querySelector('#parcel-destination').value='place:'+home.id;}
   const message=parsed.needsClarification?'Prima serve il servizio esatto: DHL Express e DHL eCommerce sono reti diverse; per Amazon conta il corriere indicato nelle istruzioni del reso. Ho aperto Organizza pacchi: conferma la rete, l\'operazione e l\'etichetta.':'Ho impostato i corrieri in Organizza pacchi, nella barra laterale. Conferma operazione, etichetta e partenza, poi premi Trova la combinazione. Il calcolo confronta le fonti verificate e le soste senza inventare compatibilita.';
   bridge.message(message);result.textContent=message;bridge.showOrganizer();return true;
  }
 });
 bridge.replaceLocations([...original,...additions]);bridge.refresh();
 timer=setInterval(()=>{if(organizer.open)stateSelects();},60000);
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
}
