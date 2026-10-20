import {NETWORKS,ACTIONS,validateCatalog,siteOpening,sourceOpen,planParcels,navigationUrl,metres} from './carrier-planner.mjs';
import {parseRouteIntent} from './route-intent.mjs';
import {applyRouteFollowup} from './route-followup.mjs';
import {rankRoadPlans} from './road-routing.mjs';
import {MAX_PARCELS,describeParcel,validateParcelSelections,routeDemandPartition,originOptions,defaultOrigin,resolveOrigin} from './parcel-wizard.mjs';
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
 let nextId=8100;for(const s of catalog.sites){s.appId=s.legacyId??s.appId??nextId++;byId.set(s.id,s);if(byLegacy.has(s.appId))throw new Error('Duplicate pin '+s.appId);byLegacy.set(s.appId,s);}
 const original=bridge.locations();
 const present=new Set(original.map(l=>l.id));
 const additions=catalog.sites.filter(s=>!present.has(s.appId)).map(s=>({id:s.appId,kind:s.kind,realName:s.name,address:s.address,services:s.memberships.filter(m=>m.active===true).map(m=>NETWORKS[m.network]).join(' / ')||'IN SOSPESO - da verificare',hasPoste:s.memberships.some(m=>m.active===true&&m.network==='poste'),hasLis:false,coords:s.coords,schedule:{}}));
 let selectedNetwork='verified', timer=null;
 const list=document.getElementById('locations-list');
 const panel=document.createElement('section');panel.id='carrier-panel';panel.className='px-3 py-2 border-b border-slate-200 bg-slate-50 shrink-0 text-xs';
 panel.innerHTML=`<label class="flex items-center gap-2 mb-2 text-slate-600">Rete / formato <select id="carrier-filter" class="flex-1 min-w-0 border rounded px-2 py-1 bg-white"><option value="verified">Solo punti con riscontro ufficiale (consigliato)</option><option value="all">Tutte (anche dati storici)</option><option value="brt_digital">BRT Digital (QR) · candidati da verificare</option>${catalog.coverage.map(c=>`<option value="${c.network}">${escape(c.label)}${c.count?' · '+c.count:' · da verificare'}</option>`).join('')}</select></label>
 <details id="parcel-organizer" class="group">
   <summary class="cursor-pointer font-bold text-blue-700 py-2">Organizza i miei pacchi / corrieri</summary>
   <div id="parcel-wizard-content" class="pt-2 pb-3 space-y-3 max-h-[54vh] md:max-h-[64vh] overflow-y-auto overscroll-contain">
     <p class="text-[10px] text-slate-500">Bisceglie · dati consultati il ${escape(catalog.observedAt)}. Copertura parziale: le reti non verificate non vengono inventate.</p>
     <p id="parcel-request-banner" class="hidden rounded-lg bg-blue-50 border border-blue-100 p-2 text-[11px] font-medium text-blue-900"></p>
     <div id="parcel-progress" class="grid grid-cols-3 gap-1 text-center text-[10px] font-semibold" aria-label="Fasi di ricerca">
       <span data-wizard-step="1" class="rounded-md border p-1.5 bg-blue-600 text-white border-blue-600">1. Pacchi</span>
       <span data-wizard-step="2" class="rounded-md border p-1.5 border-slate-200 text-slate-500">2. Partenza</span>
       <span data-wizard-step="3" class="rounded-md border p-1.5 border-slate-200 text-slate-500">3. Risultati</span>
     </div>
     <section id="parcel-stage-parcels" class="space-y-2" aria-label="Pacchi e corrieri">
       <h4 class="font-bold text-slate-800 text-sm">Quali pacchi devi gestire?</h4>
       <p class="text-slate-600">Di base stai spedendo un pacco. Specifica soltanto eventuali eccezioni (BRT Digital, un reso particolare o un ritiro già assegnato).</p>
       <div id="parcel-rows" class="space-y-2"></div>
       <button type="button" id="parcel-add" class="w-full rounded-lg border border-blue-200 bg-blue-50 px-2 py-2 text-blue-800 font-semibold">+ Aggiungi un altro pacco (max 4)</button>
       <p id="parcel-parcel-error" role="alert" class="hidden rounded border border-amber-300 bg-amber-50 p-2 text-amber-900"></p>
       <button type="button" id="parcel-next-location" class="w-full rounded-lg bg-blue-600 text-white py-2.5 font-bold">Continua: scegli la partenza →</button>
       <button type="button" id="parcel-quick-go" class="w-full rounded-lg border border-blue-200 bg-blue-50 text-blue-800 py-2.5 font-bold">Trova subito il giro (1 o 2 soste)</button>
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
       <div id="parcel-destination-shortcuts" class="flex flex-wrap gap-2" aria-label="Destinazione rapida"></div>
       <details id="parcel-advanced" class="border rounded-lg bg-white p-2>
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
 const organizer=panel.querySelector('#parcel-organizer'),rows=panel.querySelector('#parcel-rows'),result=panel.querySelector('#parcel-result');
 let wizardStep=1, geolocationPoll=null, quickGpsInterval=null, activeChatRequest=null;

 function setWizardStep(step){
  wizardStep=step;
  for(const [number,id] of [[1,'parcel-stage-parcels'],[2,'parcel-stage-location'],[3,'parcel-stage-results']]){
   panel.querySelector('#'+id).classList.toggle('hidden',number!==step);
  }
  for(const indicator of panel.querySelectorAll('[data-wizard-step]')){
   const number=Number(indicator.dataset.wizardStep);
   indicator.className='rounded-md border p-1.5 '+(number===step?'bg-blue-600 text-white border-blue-600':number<step?'bg-blue-50 border-blue-200 text-blue-800':'border-slate-200 text-slate-500');
  }
  if(step===2)stateSelects();
  panel.querySelector('#parcel-wizard-content').scrollTop=0;
 }

 function reportWizardError(id,message){
  const el=panel.querySelector('#'+id);
  el.textContent=message;
  el.classList.toggle('hidden',!message);
 }

 function collectedParcels(){
  return [...rows.children].map(row=>({
   network:row.querySelector('.parcel-network').value,
   action:row.querySelector('.parcel-action').value,
   assignedPointId:row.querySelector('.parcel-assigned').value||null,
   brtFormat:row.querySelector('.parcel-network').value==='brt'
     ?(row.querySelector('.parcel-action').value==='return_qr'?'digital':row.querySelector('.parcel-brt-format').value)
     :undefined
  }));
 }

 function renumberParcels(){
  for(const [i,row] of [...rows.children].entries()){
   row.querySelector('.parcel-number').textContent='Pacco '+(i+1);
   row.querySelector('.parcel-remove').classList.toggle('hidden',rows.children.length===1);
  }
  const add=panel.querySelector('#parcel-add');
  add.disabled=rows.children.length>=MAX_PARCELS;
  add.classList.toggle('opacity-50',add.disabled);
  reportWizardError('parcel-parcel-error','');
 }

 function updateOriginUI(options=originOptions(bridge.state())){
  const selected=panel.querySelector('#parcel-origin').value;
  const container=panel.querySelector('#parcel-origin-shortcuts');
  container.replaceChildren();
  const main=options.filter(o=>o.kind==='gps'||(o.kind==='place'&&['casa','palestra','lavoro'].includes(o.label.trim().toLowerCase()))).slice(0,5);
  for(const choice of main){
   const button=document.createElement('button');button.type='button';
   button.className='rounded-full border px-3 py-1.5 font-medium '+(selected===choice.value?'border-blue-600 bg-blue-600 text-white':'border-slate-300 bg-white text-slate-700');
   button.setAttribute('aria-pressed',String(selected===choice.value));
   button.textContent=choice.kind==='gps'?'La mia posizione':choice.label;
   button.addEventListener('click',()=>{panel.querySelector('#parcel-origin').value=choice.value;updateOriginUI();});
   container.append(button);
  }
  const other=document.createElement('button');other.type='button';other.className='rounded-full border border-slate-300 px-3 py-1.5 bg-white text-slate-700';
  other.textContent='Altro luogo...';other.addEventListener('click',()=>panel.querySelector('#parcel-origin').focus());container.append(other);
  const point=resolveOrigin(selected,bridge.state()),hint=panel.querySelector('#parcel-origin-hint');
  hint.textContent=point?'Partenza impostata. La distanza sara calcolata da questo punto.':
    selected==='gps'?'Posizione attuale non ancora rilevata. Premi Rileva posizione e autorizza il GPS.':
    'Questo luogo non ha coordinate. Configuralo in I miei luoghi oppure scegli un altro punto.';
  panel.querySelector('#parcel-gps-request').classList.toggle('hidden',selected!=='gps');
 }

 function stateSelects(){
  const state=bridge.state(),options=originOptions(state);
  const origin=panel.querySelector('#parcel-origin'),priorOrigin=origin.value;
  origin.innerHTML=options.map(o=>`<option value="${escape(o.value)}">${escape(o.label)}${o.available?'':' · da configurare / rilevare'}</option>`).join('');
  origin.value=options.some(o=>o.value===priorOrigin)?priorOrigin:defaultOrigin(state);
  const destination=panel.querySelector('#parcel-destination'),priorDestination=destination.value;
  const destinations=[{value:'none',label:'Nessun arrivo (solo punti di ritiro)'},...options.filter(o=>o.kind==='place')];
  destination.innerHTML=destinations.map(o=>`<option value="${escape(o.value)}">${escape(o.label)}${o.available===false?' · da configurare':''}</option>`).join('');
  destination.value=destinations.some(o=>o.value===priorDestination)?priorDestination:'none';
  const shortcuts=panel.querySelector('#parcel-destination-shortcuts');shortcuts.replaceChildren();
  for(const option of destinations.filter(o=>o.kind==='place'&&['casa','palestra'].includes(o.label.trim().toLowerCase()))){
   const btn=document.createElement('button');btn.type='button';
   btn.className='rounded-full px-3 py-1.5 border border-blue-200 bg-blue-50 text-blue-800 font-semibold';
   btn.textContent='Verso '+option.label+(option.available?'':' (configura posizione)');
   btn.addEventListener('click',()=>{destination.value=option.value;reportWizardError('parcel-location-error','');updateStepSummary();});
   shortcuts.append(btn);
  }
  updateOriginUI(options);
 }

 function selectionSummary(){
  return collectedParcels().map((d,i)=>'Pacco '+(i+1)+': '+describeParcel(d)).join(' | ');
 }
 function updateStepSummary(){
  panel.querySelector('#parcel-selection-summary').textContent=selectionSummary();
  const option=panel.querySelector('#parcel-origin').selectedOptions[0]?.textContent||'Da scegliere';
  panel.querySelector('#parcel-results-summary').textContent=selectionSummary()+' | Partenza: '+option;
 }
 stateSelects();
 organizer.addEventListener('toggle',()=>{if(organizer.open){stateSelects();updateStepSummary();}});
 panel.querySelector('#parcel-origin').addEventListener('change',()=>{updateOriginUI();reportWizardError('parcel-location-error','');});
 panel.querySelector('#parcel-gps-request').addEventListener('click',()=>{
  const hint=panel.querySelector('#parcel-origin-hint');
  hint.textContent='Rilevamento GPS in corso: autorizza la posizione nel browser...';
  panel.querySelector('#parcel-origin').value='gps';
  if(!navigator.geolocation){hint.textContent='Il browser non supporta il GPS: scegli Casa, Palestra o un luogo salvato.';return;}
  bridge.locate();
  if(geolocationPoll)clearInterval(geolocationPoll);
  let attempts=0;
  geolocationPoll=setInterval(()=>{
   attempts++;
   if(resolveOrigin('gps',bridge.state())){
    clearInterval(geolocationPoll);geolocationPoll=null;
    stateSelects();panel.querySelector('#parcel-origin').value='gps';updateOriginUI();
   }else if(attempts>=24){
    clearInterval(geolocationPoll);geolocationPoll=null;
    hint.textContent='Posizione non rilevata. Controlla il permesso GPS del browser o scegli un luogo salvato.';
   }
  },500);
 });

 panel.querySelector('#parcel-next-location').addEventListener('click',()=>{
  const validation=validateParcelSelections(collectedParcels());
  if(!validation.ok){
   reportWizardError('parcel-parcel-error',validation.message);
   if(validation.index>=0)rows.children[validation.index]?.scrollIntoView({block:'nearest'});
   return;
  }
  reportWizardError('parcel-parcel-error','');
  stateSelects();updateStepSummary();setWizardStep(2);
 });
 panel.querySelector('#parcel-back-packages').addEventListener('click',()=>setWizardStep(1));
 panel.querySelector('#parcel-edit-packages').addEventListener('click',()=>setWizardStep(1));
 panel.querySelector('#parcel-edit-location').addEventListener('click',()=>setWizardStep(2));
 function addRow(network='brt',action='dropoff',brtFormat='printed'){
  if(rows.children.length>=MAX_PARCELS)return;
  const row=document.createElement('div');
  row.className='parcel-row border border-slate-200 rounded-xl p-3 bg-white space-y-2';
  row.innerHTML=`<div class="flex items-center justify-between gap-2">
     <strong class="parcel-number text-slate-800">Pacco</strong>
     <button type="button" class="parcel-remove text-red-600 underline text-[11px]">Rimuovi</button>
   </div>
   <label class="block font-medium text-slate-700">Corriere
     <select class="parcel-network block w-full mt-1 border rounded-lg p-2 bg-white" aria-label="Corriere del pacco">
       <option value="dhl_unspecified">DHL (specifica Express o eCommerce)</option>
       ${Object.entries(NETWORKS).map(([v,t])=>`<option value="${v}">${escape(v==='amazon'?'Amazon (pacco da consegnare)':t)}</option>`).join('')}
     </select>
   </label>
   <details class="parcel-operation-details rounded-lg border border-slate-200 bg-slate-50 p-2">
     <summary class="cursor-pointer text-[11px] text-slate-600 font-medium">Operazione diversa dalla spedizione? (facoltativo)</summary>
     <label class="block font-medium text-slate-700 mt-2">Tipo di operazione
       <select class="parcel-action block w-full mt-1 border rounded-lg p-2 bg-white" aria-label="Operazione del pacco">
         ${Object.entries(ACTIONS).map(([v,t])=>`<option value="${v}">${escape(t)}</option>`).join('')}
       </select>
     </label>
   </details>
   <label class="parcel-brt-format-wrap block font-semibold text-blue-800">È BRT Digital?
     <select class="parcel-brt-format block w-full mt-1 border border-blue-200 rounded-lg p-2 bg-blue-50" aria-label="BRT Digital oppure etichetta stampata">
       <option value="">Seleziona tipo di etichetta...</option>
       <option value="digital">Sì · BRT Digital / QR, senza stampare</option>
       <option value="printed">No · etichetta tradizionale stampata</option>
     </select>
   </label>
   <p class="parcel-brt-note rounded bg-amber-50 text-amber-900 text-[11px] p-2 hidden"></p>
   <label class="parcel-assigned-wrap hidden block text-[11px] font-medium text-slate-700">Dove è già stato consegnato?
     <select class="parcel-assigned block w-full border rounded-lg p-2 mt-1 bg-white" aria-label="Punto assegnato nell'avviso"></select>
   </label>
   <p class="parcel-network-warning text-[11px] text-amber-900 hidden"></p>`;
  row.querySelector('.parcel-network').value=network;
  row.querySelector('.parcel-action').value=action||'dropoff';
  row.querySelector('.parcel-brt-format').value=brtFormat||'printed';
  const update=()=>{
   const net=row.querySelector('.parcel-network').value;
   const actionField=row.querySelector('.parcel-action');
   // Default shipment does not imply that arbitrary Amazon Hub sites accept parcels.
   for(const option of actionField.options)option.disabled=false;
   const operation=actionField.value;
   const isPickup=operation==='pickup',isBrt=net==='brt';
   const mode=operation==='return_qr'?'digital':row.querySelector('.parcel-brt-format').value;
   row.querySelector('.parcel-brt-format-wrap').classList.toggle('hidden',!isBrt||isPickup||operation==='return_qr');
   const note=row.querySelector('.parcel-brt-note');
   note.classList.toggle('hidden',!isBrt||isPickup||mode!=='digital');
   note.textContent='Edicolandia NON accetta BRT Digital / QR (segnalazione utente). Gli altri punti sono candidati da verificare.';
   row.querySelector('.parcel-assigned-wrap').classList.toggle('hidden',!isPickup);
   row.querySelector('.parcel-operation-details').open=operation!=='dropoff';
   const assigned=row.querySelector('.parcel-assigned');
   const previous=assigned.value;
   assigned.innerHTML='<option value="">Seleziona il punto indicato nell\'avviso...</option>'+catalog.sites
     .filter(s=>s.memberships.some(m=>m.network===net&&m.active===true))
     .map(s=>`<option value="${escape(s.id)}">${escape(s.name)} — ${escape(s.address)}</option>`).join('');
   if(previous&&[...assigned.options].some(o=>o.value===previous))assigned.value=previous;
   const warning=row.querySelector('.parcel-network-warning');
   const coverage=catalog.coverage.find(c=>c.network===net);
   const notVerified=net==='amazon'||net==='dhl_ecommerce'||net==='dhl_unspecified'||!coverage||!coverage.count||coverage.status==='not_verified'||coverage.status==='legacy';
   warning.classList.toggle('hidden',!notVerified);
   warning.textContent=net==='amazon'?(operation==='pickup'?'Ritiro Amazon: seleziona il punto indicato nell’avviso.':'Pacco Amazon da consegnare: lo tengo nel giro, ma non considero i Locker punti di spedizione generici. Per includerlo serve il corriere o il punto abilitato dalle istruzioni Amazon.'):
     net==='dhl_ecommerce'?'DHL Finder include partner PuntoPoste: verifica che il punto sia abilitato per la tua specifica etichetta DHL eCommerce; QR NON attestato.':
     net==='dhl_unspecified'?'DHL Express e DHL eCommerce usano reti diverse: seleziona quella sull’etichetta.':
     notVerified?'La rete '+(NETWORKS[net]||net)+' non ha ancora punti ricontrollati in questo catalogo: le combinazioni potrebbero risultare non disponibili.':'';
   reportWizardError('parcel-parcel-error','');
  };
  for(const cls of ['parcel-network','parcel-action','parcel-brt-format']){
   row.querySelector('.'+cls).addEventListener('change',()=>{if(cls==='parcel-network'&&row.querySelector('.parcel-network').value==='brt'&&!row.querySelector('.parcel-brt-format').value)row.querySelector('.parcel-brt-format').value='printed';update();});
  }
  row.querySelector('.parcel-remove').addEventListener('click',()=>{
   if(rows.children.length<=1)return;
   row.remove();renumberParcels();
  });
  rows.appendChild(row);update();renumberParcels();
 }
 addRow('brt','dropoff','');
 panel.querySelector('#parcel-add').addEventListener('click',()=>addRow());
 panel.querySelector('#parcel-quick-go').addEventListener('click',()=>{
  const validation=validateParcelSelections(collectedParcels());
  if(!validation.ok){setWizardStep(1);reportWizardError('parcel-parcel-error',validation.message);return;}
  panel.querySelector('#parcel-max-stops').value=String(activeChatRequest?.maxStops??2);
  stateSelects();updateStepSummary();setWizardStep(2);
  const selectedDestination=panel.querySelector('#parcel-destination').value;
  if(activeChatRequest?.destination==='choose'&&selectedDestination==='none'){
   reportWizardError('parcel-location-error','Scegli la destinazione: Casa oppure Palestra.');
   return;
  }
  if(activeChatRequest?.destination&&activeChatRequest.destination!=='choose'&&selectedDestination==='none'){
   reportWizardError('parcel-location-error','La destinazione richiesta deve essere configurata e selezionata.');
   return;
  }
  if(panel.querySelector('#parcel-origin').value==='gps'&&!resolveOrigin('gps',bridge.state())){
   reportWizardError('parcel-location-error','Autorizza il GPS del browser: il percorso deve partire dalla posizione reale.');
   if(quickGpsInterval)clearInterval(quickGpsInterval);
   bridge.locate(); // Only in response to an explicit user click.
   let checks=0;
   quickGpsInterval=setInterval(()=>{
    checks++;
    if(resolveOrigin('gps',bridge.state())){
     clearInterval(quickGpsInterval);quickGpsInterval=null;
     stateSelects();panel.querySelector('#parcel-origin').value='gps';
     panel.querySelector('#parcel-calculate').click();
    }else if(checks>=24){
     clearInterval(quickGpsInterval);quickGpsInterval=null;
     reportWizardError('parcel-location-error','GPS non disponibile: consenti la posizione a PosteFinder oppure scegli un luogo di partenza salvato.');
    }
   },500);
   return;
  }
  panel.querySelector('#parcel-calculate').click();
 });
 panel.querySelector('#parcel-calculate').addEventListener('click',()=>{
  const demands=collectedParcels(),validation=validateParcelSelections(demands);
  if(!validation.ok){reportWizardError('parcel-parcel-error',validation.message);setWizardStep(1);return;}
  const state=bridge.state(),origin=resolveOrigin(panel.querySelector('#parcel-origin').value,state);
  const target=panel.querySelector('#parcel-destination').value;
  if(activeChatRequest?.destination==='choose'&&target==='none'){reportWizardError('parcel-location-error','Scegli Casa oppure Palestra per questo giro.');return;}
  if(activeChatRequest?.destination&&activeChatRequest.destination!=='choose'&&target==='none'){reportWizardError('parcel-location-error','Seleziona la destinazione richiesta.');return;}
  const destination=target==='none'?null:resolveOrigin(target,state);
  if(!origin){
   reportWizardError('parcel-location-error',panel.querySelector('#parcel-origin').value==='gps'
     ?'Posizione attuale non rilevata: premi Rileva posizione oppure scegli Casa, Palestra o un altro luogo salvato.'
     :'Il luogo scelto non ha coordinate. Configuralo in I miei luoghi oppure cambia la partenza.');
   return;
  }
  if(target!=='none'&&!destination){
   reportWizardError('parcel-location-error','Il luogo di arrivo non ha coordinate. Configuralo in I miei luoghi oppure scegli Nessun arrivo.');
   return;
  }
  reportWizardError('parcel-location-error','');
  updateStepSummary();setWizardStep(3);
  const liveIds=new Set(bridge.locations().map(l=>l.id));
  const exclusions=catalog.sites.filter(s=>state.removedIds.includes(s.appId)||!liveIds.has(s.appId)).map(s=>s.id);
  const plan=planParcels(catalog,demands,{origin,destination,openOnly:panel.querySelector('#parcel-open').checked,radiusKm:Number(panel.querySelector('#parcel-radius').value),maxStops:Number(panel.querySelector('#parcel-max-stops').value),maxResults:8,excludedSiteIds:exclusions});
  result.replaceChildren();
  if(plan.status!=='ok'&&plan.status!=='provisional'){
   const p=document.createElement('p');p.className='rounded border border-amber-200 bg-amber-50 p-2';p.textContent=plan.message;
   if(plan.missing?.length)p.textContent+=' Da coprire: '+plan.missing.map(d=>NETWORKS[d.network]).join(', ');
   result.appendChild(p);
   if(activeChatRequest)bridge.message('Non posso proporre un percorso affidabile entro il limite scelto: '+p.textContent+' Non considero confermati i punti non verificati.');
   return;
  }
  const summary=document.createElement('p');summary.className='font-semibold text-slate-700';
  summary.textContent='Risultati sul catalogo disponibile (non tutta la rete). Orari fonte alla partenza: '+new Date(plan.evaluatedAt).toLocaleString('it-IT',{timeZone:'Europe/Rome'});
  result.append(summary);
  if(plan.status==='provisional'){
   const caution=document.createElement('p');caution.className='rounded border border-amber-300 bg-amber-50 p-2 font-semibold text-amber-900';
   caution.textContent='ATTENZIONE: BRT Digital NON verificato nei punti proposti. Prima di partire, conferma che accettino il QR; Edicolandia è esclusa (segnalazione utente).';
   result.append(caution);
  }
  const cardList=document.createElement('div');cardList.className='space-y-2';result.append(cardList);
  const paintPlans=(plans,onRoad=false)=>{
   cardList.replaceChildren();
   for(const [i,p] of plans.slice(0,3).entries()){
    const el=document.createElement('article');el.className='rounded-lg border border-blue-200 bg-white p-3 space-y-1';
    const heading=document.createElement('strong');heading.className='block text-sm';
    const km=(onRoad?p.roadDistanceMetres:p.distanceMetres)/1000;
    heading.textContent=(i+1)+'. '+p.stops.length+(p.stops.length===1?' sosta':' soste')+' · '+km.toFixed(2)+(onRoad?' km su strada (stima)':' km in linea d’aria');
    el.append(heading);
    if(onRoad){
     const duration=document.createElement('p');duration.className='text-blue-800 font-medium text-xs';
     duration.textContent='Tempo di guida stimato: circa '+Math.max(1,Math.round(p.roadDurationSeconds/60))+' min (senza traffico live)';
     el.append(duration);
    }
    const extra=onRoad?p.roadExtraMetres:p.extraMetres;
    if(extra!==null&&extra!==undefined){
     const note=document.createElement('p');note.className='text-xs text-slate-600';
     note.textContent='Deviazione rispetto al tragitto diretto: +'+(extra/1000).toFixed(2)+(onRoad?' km su strada (stima)':' km geometrici');
     el.append(note);
    }
    if(p.stops.length===2){
     const near=document.createElement('p');near.className='text-xs text-slate-600';
     near.textContent='Distanza tra i due punti: circa '+Math.round(metres(p.stops[0].coords,p.stops[1].coords))+' m in linea d’aria.';
     el.append(near);
    }
    for(const [j,stop] of p.stops.entries()){
     const detail=document.createElement('p');detail.className='text-xs';
     const name=document.createElement('button');name.type='button';name.className='text-blue-700 underline font-bold';
     name.textContent=(j+1)+'. '+stop.name;name.addEventListener('click',()=>bridge.focus(byId.get(stop.id).appId));
     detail.append(name,document.createElement('br'),document.createTextNode(stop.address),document.createElement('br'));
     const tasks=document.createElement('span');tasks.className='text-[10px]';
     tasks.textContent=p.assignments.filter(a=>a.siteId===stop.id).map(a=>(NETWORKS[a.network]||a.network)+' · '+(ACTIONS[a.action]||a.action)+(a.network==='brt'&&a.brtFormat==='digital'?' · Digital / QR'+(a.provisional?' (DA CONFERMARE)':''):'')).join(' ; ');
     detail.append(tasks);el.append(detail);
    }
    const cautions=document.createElement('p');cautions.className='text-[10px] text-amber-800';
    cautions.textContent=p.warnings.filter(w=>!onRoad||!w.startsWith('Distanze in linea d')).join(' ');
    el.append(cautions);
    const link=document.createElement('a');
    link.className='block text-center rounded bg-blue-600 text-white py-2 mt-2 font-semibold';
    link.target='_blank';link.rel='noopener noreferrer';link.href=navigationUrl(p,{origin,destination});
    link.textContent='Apri il giro in Google Maps';
    el.append(link);cardList.append(el);
   }
  };
  paintPlans(plan.plans);
  if(activeChatRequest){
   const best=plan.plans[0];
   const stopText=best.stops.map((v,i)=>(i+1)+'. '+v.name+' — '+v.address).join('\n');
   const warning=plan.status==='provisional'?'**BRT Digital: punti candidati, QR da confermare prima di partire.**\n\n':'';
   bridge.message(warning+'Ho trovato un giro di '+best.stops.length+' '+(best.stops.length===1?'sosta':'soste')+' partendo dal luogo selezionato, passando dai seguenti punti:\n'+stopText+'\n\nLa distanza iniziale è **indicativa, in linea d’aria**, non una stima di guida. [Apri su Google Maps]('+navigationUrl(best,{origin,destination})+'). Per verificare la distanza su strada, usa il pulsante nel riepilogo.');
  }
  const roadPanel=document.createElement('div');roadPanel.className='border-t border-slate-200 pt-2 mt-2 space-y-1';
  const roadButton=document.createElement('button');roadButton.type='button';
  roadButton.className='w-full rounded border border-blue-300 bg-white text-blue-800 font-bold py-2 px-2';
  roadButton.textContent='Ottimizza per tempi stradali (OSRM)';
  const roadDisclosure=document.createElement('p');roadDisclosure.className='text-[10px] text-slate-600';
  roadDisclosure.textContent='Facoltativo: premendo, condividi con il servizio routing esterno OSRM le coordinate di partenza, dei punti e di arrivo. Tempo stimato senza traffico; se non disponibile resta il confronto in linea d’aria.';
  const roadStatus=document.createElement('p');roadStatus.className='text-[11px] text-blue-800';roadStatus.setAttribute('role','status');
  roadPanel.append(roadButton,roadDisclosure,roadStatus);result.append(roadPanel);
  roadButton.addEventListener('click',async()=>{
   roadButton.disabled=true;roadStatus.textContent='Confronto dei tempi stradali in corso...';
   const controller=new AbortController();
   const cancel=setTimeout(()=>controller.abort(),8500);
   try{
    const ranked=await rankRoadPlans(plan.plans,{origin,destination,signal:controller.signal});
    paintPlans(ranked.plans,true);
    roadStatus.textContent='Ordinati per tempo di guida stimato OSRM (senza traffico e senza attesa nei negozi). Confronta il percorso finale in Google Maps.';
    if(activeChatRequest){
     const best=ranked.plans[0];
     bridge.message('Confronto su strade completato: '+best.stops.length+' '+(best.stops.length===1?'sosta':'soste')+', circa '+(best.roadDistanceMetres/1000).toFixed(2)+' km e '+Math.max(1,Math.round(best.roadDurationSeconds/60))+' min di guida stimata. [Apri in Google Maps]('+navigationUrl(best,{origin,destination})+'). Non include traffico in tempo reale né tempi di consegna.');
    }
   }catch(err){
    roadStatus.textContent='Stima stradale non disponibile: '+(err?.name==='AbortError'?'tempo scaduto':err?.message||'connessione non riuscita')+'. Restano validi i suggerimenti geometrici.';
   }finally{clearTimeout(cancel);roadButton.disabled=false;}
  });
  if(plan.plans[0].stops.length>3&&destination){
   const note=document.createElement('p');note.textContent='Con quattro soste più arrivo, Google Maps mobile può limitare le tappe intermedie: verifica che siano tutte presenti.';result.append(note);
  }
 });
 panel.querySelector('#carrier-filter').addEventListener('change',e=>{selectedNetwork=e.target.value;bridge.refresh();if(selectedNetwork!=='all'&&selectedNetwork!=='verified'&&selectedNetwork!=='brt_digital'&&!catalog.sites.some(s=>s.memberships.some(m=>m.network===selectedNetwork))){organizer.open=true;setWizardStep(1);reportWizardError('parcel-parcel-error','Per questa rete non ho ancora punti verificati: puoi aggiungere il pacco, ma la ricerca non inventera luoghi compatibili.');}});
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
   el.innerHTML=`<div class="flex flex-wrap gap-1">${nets.map(n=>`<span class="rounded border border-blue-100 bg-blue-50 text-blue-800 px-1">${escape(n)}</span>`).join('')}</div><p class="mt-1">Fonti consultate: ${escape([...new Set(s.memberships.map(m=>m.observedAt))].join(', '))} · non verifica in tempo reale</p>${s.conflicts.length?'<p class="text-amber-800">Dati discordanti: controlla le fonti.</p>':''}<details class="mt-1"><summary>Orari, limiti e fonti per corriere</summary>${s.memberships.map(m=>`<div class="mt-2"><a class="underline font-bold" target="_blank" rel="noopener noreferrer" href="${escape(sourceLink(m.sourceDetailsUrl||m.sourceUrl))}">${escape(NETWORKS[m.network])} · ${escape(m.pointId)}</a><p>${Object.entries(dayLabels).map(([d,t])=>t+' '+(m.hours[d].length?m.hours[d].map(([a,b])=>hh(a)+'–'+hh(b)).join(', '):'chiuso')).join('<br>')}</p><p>${escape(m.conditions.join(' '))}</p>${m.userReport?'<p class="text-amber-800">'+escape(m.userReport)+'</p>':''}<p>Limite peso fonte: ${m.limits?.maxWeightKg??'?'} kg${m.limits?.maxDimensionsCm?' · '+m.limits.maxDimensionsCm.join('×')+' cm':''}${m.cutoffMinute!=null?' · cutoff '+hh(m.cutoffMinute):''}</p>${m.freshnessNote?'<p>'+escape(m.freshnessNote)+'</p>':''}</div>`).join('')}${s.conflicts.map(c=>'<p class="text-amber-800 mt-1">'+escape(c.note)+'</p>').join('')}</details>`;
   const pendingMemberships=s.memberships.filter(m=>m.verificationStatus==='pending_recheck');
   if(pendingMemberships.length){
     const notice=document.createElement('p');notice.className='rounded mt-1 p-1 bg-amber-50 text-amber-900 font-semibold';
     notice.textContent='IN SOSPESO — '+pendingMemberships.map(m=>NETWORKS[m.network]+': '+(m.verificationNote||'non verificato oggi')).join(' ');
     el.querySelector('details')?.before(notice);
   }
   if(s.id==='amazon-melezio'){
     const note=document.createElement('p');
     note.className='rounded mt-1 p-1 bg-blue-50 text-blue-900 font-medium';
     note.textContent='Amazon Locker melezio: locker Amazon per ritiro ordini confermato presso ENI PV9033, Via Imbriani 258, H24. Il locker e un punto AUTONOMO rispetto al servizio DHL Express ENI; ingresso preciso del locker da verificare. Il vecchio Counter Eni Cafe non e confermato.';
     el.querySelector('details')?.before(note);
   }
   if(['street_approx','nearby_proxy','shared_area_approx'].includes(s.coordinatePrecision)){
     const pinNote=document.createElement('p');
     pinNote.className='rounded mt-1 p-1 bg-amber-50 text-amber-900 font-medium';
     pinNote.textContent='Posizione indicativa sulla mappa: il segnaposto e riferito all area del punto, non all ingresso esatto. Verifica indirizzo e civico ('+s.address+').';
     el.querySelector('details')?.before(pinNote);
   }
   if(s.memberships.some(m=>m.network==='amazon')){
     const amzNote=document.createElement('p');amzNote.className='rounded mt-1 p-1 bg-blue-50 text-blue-900';
     amzNote.textContent='Amazon Hub: sede dal selettore ufficiale per RITIRO ordini. Resi possibili SOLO se il singolo ordine propone questa sede e modalita.';
     el.querySelector('details')?.before(amzNote);
   }
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
 // Compact, query-filtered official carrier memberships for Gemini general questions.
 // No GPS, private places, account data, keys or unverified services.
 bridge.assistantCatalog=(question='')=>{
  const q=String(question).toLowerCase(),selected=new Set();
  if(/dhl/.test(q)){
   if(/express/.test(q))selected.add('dhl_express');
   else if(/e[\s-]*commerce/.test(q))selected.add('dhl_ecommerce');
   else{selected.add('dhl_express');selected.add('dhl_ecommerce');}
  }
  if(/\bbrt\b|bartolini/.test(q))selected.add('brt');
  if(/\bin[\s-]*post\b/.test(q))selected.add('inpost');
  if(/\bups\b/.test(q))selected.add('ups');
  if(/\bgls\b/.test(q))selected.add('gls');
  if(/\bposte\b|\bpunto poste\b|\bsda\b/.test(q))selected.add('poste');
  if(/\bamazon\b/.test(q))selected.add('amazon');
  const hidden=new Set(bridge.state().removedIds),output=[];
  for(const site of catalog.sites){
   if(hidden.has(site.appId))continue;
   const memberships=site.memberships.filter(m=>m.active===true&&(selected.size===0||selected.has(m.network)));
   if(!memberships.length)continue;
   output.push({
    id:site.id,name:site.name,address:site.address,coordinatePrecision:site.coordinatePrecision,
    memberships:memberships.map(m=>({network:m.network,carrier:NETWORKS[m.network],pointId:m.pointId,
     status:sourceOpen(m)===true?'within_source_hours':sourceOpen(m)===false?'outside_source_hours':'hours_or_recency_uncertain',
     services:m.services,brtDigitalStatus:m.brtDigitalStatus||null,
     observedAt:m.observedAt,hours:m.hours,limitations:(m.conditions||[]).slice(0,3),
     sourceUrl:m.sourceDetailsUrl||m.sourceUrl,providerCapabilities:m.providerCapabilities||null}))
   });
  }
  return {scope:'Bisceglie (BT), copertura parziale',catalogObservedAt:catalog.observedAt,
   warning:'CONDITIONAL non significa accettazione certa; QR ignoto non si inventa. Ritiro assegnato non si sposta. Dati non in tempo reale.',
   selectedNetworks:[...selected],sites:output};
 };
 bridge.install({beforeRefresh:audit,decorate,
  baseFilter:l=>bridge.state().filter==='poste'&&byLegacy.has(l.id)?byLegacy.get(l.id).memberships.some(m=>m.network==='poste'):null,
  filter:l=>selectedNetwork==='all'||Boolean(byLegacy.get(l.id)?.memberships.some(m=>m.active===true&&(selectedNetwork==='verified'||(selectedNetwork==='brt_digital'?(m.network==='brt'&&m.brtDigitalStatus!=='not_supported_reported'):m.network===selectedNetwork)))),
  status:schedule=>{
   const s=auditSchedules.get(schedule);if(!s)return {isOpen:false,text:'Orari non verificati',class:'status-warning',score:-1};
   const desired=selectedNetwork==='brt_digital'?'brt':selectedNetwork;
   if(desired!=='all'&&desired!=='verified'){
    const member=s.memberships.find(m=>m.network===desired);
    const state=sourceOpen(member);
    const label=state===true?'Aperto per '+(NETWORKS[desired]||desired)+' (da orario fonte)':state===false?'Fuori orario '+(NETWORKS[desired]||desired):'Orari da verificare per '+(NETWORKS[desired]||desired);
    return {isOpen:state===true,text:label,class:state===true?'status-open':state===false?'status-closed':'status-warning',score:state===true?3:state===false?0:-1};
   }
   const state=siteOpening(s);return {isOpen:state.open===true,text:state.label,class:state.open===true?'status-open':state.open===false?'status-closed':'status-warning',score:state.open===true?3:state.open===false?0:-1};
  },
  chat:text=>{
   // A short answer such as "express" or "reso Amazon" updates the existing three-package trip.
   // Never replace that trip with a fresh carrier-only search.
   if(activeChatRequest&&rows.children.length){
    const follow=applyRouteFollowup(text,collectedParcels(),catalog.sites);
    if(follow.handled){
     bridge.consumeMessage();bridge.message(text,'user');
     activeChatRequest.parcels=follow.parcels;
     if(follow.destination)activeChatRequest.destination=follow.destination;
     if(follow.maxStops)activeChatRequest.maxStops=follow.maxStops;
     for(const [i,d] of follow.parcels.entries()){
      const row=rows.children[i];if(!row)continue;
      const network=row.querySelector('.parcel-network');network.value=d.network;
      network.dispatchEvent(new Event('change',{bubbles:true}));
      const action=row.querySelector('.parcel-action');action.value=d.action||'';
      action.dispatchEvent(new Event('change',{bubbles:true}));
      const format=row.querySelector('.parcel-brt-format');format.value=d.brtFormat||'';
      format.dispatchEvent(new Event('change',{bubbles:true}));
      row.querySelector('.parcel-assigned').value=d.assignedPointId||'';
     }
     const options=originOptions(bridge.state());
     if(follow.destination){
      const saved=options.find(o=>o.kind==='place'&&o.label.trim().toLowerCase()===follow.destination);
      panel.querySelector('#parcel-destination').value=saved?.value||'none';
     }
     if(follow.maxStops)panel.querySelector('#parcel-max-stops').value=String(follow.maxStops);
     const validation=validateParcelSelections(collectedParcels());
     const summary=collectedParcels().map((p,i)=>'Pacco '+(i+1)+': '+describeParcel(p)).join('\n');
     panel.querySelector('#parcel-request-banner').textContent=collectedParcels().length+' pacchi nel giro · '+(activeChatRequest.destination==='choose'?'Casa/Palestra da scegliere':activeChatRequest.destination||'arrivo libero')+' · massimo '+(activeChatRequest.maxStops||2)+' soste.';
     const destinationMissing=activeChatRequest.destination==='choose'&&panel.querySelector('#parcel-destination').value==='none';
     const next=validation.ok?(destinationMissing?'Scegli Casa oppure Palestra per questo giro.':'I dati necessari ci sono: calcolo il giro, usando soltanto i punti censiti.') : validation.message;
     bridge.message(follow.message+'\n\n**Situazione aggiornata (non ho eliminato pacchi):**\n'+summary+'\n\n'+next);
     organizer.open=true;stateSelects();updateStepSummary();setWizardStep(validation.ok?2:1);bridge.showOrganizer();
     if(validation.ok&&!destinationMissing){
      const origin=resolveOrigin(panel.querySelector('#parcel-origin').value,bridge.state());
      const destField=panel.querySelector('#parcel-destination').value;
      if(origin&&(destField==='none'||resolveOrigin(destField,bridge.state())))panel.querySelector('#parcel-quick-go').click();
     }
     return true;
    }
   }
   const parsed=parseRouteIntent(text);
   if(!parsed.recognized)return false; // General courier questions stay in Gemini chat.
   bridge.consumeMessage();bridge.message(text,'user');
   if(parsed.parcels.length>4){
    bridge.message('Puoi organizzare al massimo quattro pacchi in un solo giro. Suddividi la richiesta e riprova.');
    return true;
   }
   activeChatRequest=parsed;
   organizer.open=true;stateSelects();rows.replaceChildren();
   for(const d of parsed.parcels)addRow(d.network,d.action,d.brtFormat||'');
   renumberParcels();stateSelects();
   const opts=originOptions(bridge.state());
   const findSaved=name=>opts.find(o=>o.kind==='place'&&o.label.trim().toLowerCase()===name);
   const origin=parsed.origin==='gps'?opts.find(o=>o.value==='gps'):findSaved(parsed.origin);
   if(origin)panel.querySelector('#parcel-origin').value=origin.value;
   const dest=parsed.destination==='casa'||parsed.destination==='palestra'?findSaved(parsed.destination):null;
   panel.querySelector('#parcel-destination').value=dest?.value||'none';
   panel.querySelector('#parcel-max-stops').value=String(parsed.maxStops);
   const destinationName=parsed.destination==='choose'?'Casa oppure Palestra (scegli sotto)':parsed.destination==='casa'?'Casa':parsed.destination==='palestra'?'Palestra':'nessuna selezionata';
   const title='Ho riconosciuto '+parsed.parcels.length+' pacchi · partenza '+(origin?.label||parsed.origin)+' · arrivo '+destinationName+' · massimo '+parsed.maxStops+' soste.';
   const banner=panel.querySelector('#parcel-request-banner');banner.textContent=title;banner.classList.remove('hidden');
   const issues=[...parsed.issues];
   if(parsed.destination==='choose')issues.push('Scegli Casa oppure Palestra come destinazione.');
   if(parsed.destination&&parsed.destination!=='choose'&&!dest?.available)issues.push('La destinazione salvata '+parsed.destination+' non ha ancora coordinate utilizzabili.');
   if(parsed.origin!=='gps'&&!origin?.available)issues.push('La partenza salvata '+parsed.origin+' non ha coordinate utilizzabili.');
   if(parsed.parcels.some(p=>p.network==='amazon'&&p.action!=='pickup'))issues.push('Il pacco Amazon resta nell’elenco; intanto ottimizzo il giro dei corrieri verificabili. Per includere Amazon servirà una rete o un punto di consegna abilitato.');
   if(parsed.parcels.some(p=>p.network==='brt'&&p.brtFormat==='digital'))
    issues.push('BRT Digital: Edicolandia esclusa; gli altri punti sono soltanto candidati da confermare.');
   setWizardStep(1);updateStepSummary();
   bridge.message(title+'\n\n'+issues.join('\n')+'\n\nCompleta i campi necessari e premi **Trova subito il giro**. Il percorso è calcolato dal database locale, anche senza Gemini API key.');
   bridge.showOrganizer();return true;
  }
 });
 bridge.replaceLocations([...original,...additions]);bridge.refresh();
 timer=setInterval(()=>{if(organizer.open&&wizardStep===2)stateSelects();},30000);
 window.addEventListener('pagehide',()=>{clearInterval(timer);if(geolocationPoll)clearInterval(geolocationPoll);if(quickGpsInterval)clearInterval(quickGpsInterval);},{once:true});
}
