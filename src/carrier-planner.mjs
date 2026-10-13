// Pure, deterministic planner. No requests, geocoding or model-generated memberships.
export const NETWORKS = {
  brt: 'BRT / Bartolini', dhl_express: 'DHL Express', dhl_ecommerce: 'DHL eCommerce',
  inpost: 'InPost', ups: 'UPS', gls: 'GLS', poste: 'Poste / Punto Poste', amazon: 'Amazon: specificare il corriere'
};
export const ACTIONS = {dropoff:'Spedizione / consegna', return_label:'Reso con etichetta', return_qr:'Reso con QR (senza stampa)', pickup:'Ritiro gia assegnato'};
export function isBrtDigital(demand) {
  return demand?.network==='brt' && demand.action!=='pickup' && (demand.brtFormat==='digital'||demand.action==='return_qr');
}
const DAYS = ['sun','mon','tue','wed','thu','fri','sat'];
const clock = new Intl.DateTimeFormat('en-GB', {timeZone:'Europe/Rome',weekday:'short',hour:'2-digit',minute:'2-digit',year:'numeric',month:'2-digit',day:'2-digit',hourCycle:'h23'});
export function italyTime(at = new Date()) {
  const parts = Object.fromEntries(clock.formatToParts(new Date(at)).map(p=>[p.type,p.value]));
  return {day:parts.weekday.toLowerCase(), minute:Number(parts.hour)*60+Number(parts.minute), date:`${parts.year}-${parts.month}-${parts.day}`};
}
export function validCoords(v) { return Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180; }
export function metres(a,b) {
  if(!validCoords(a)||!validCoords(b)) return Infinity;
  const rad=Math.PI/180, dlat=(b[0]-a[0])*rad, dlon=(b[1]-a[1])*rad;
  const h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;
  return 6371000*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
export function validateHours(hours) {
  if(!hours||typeof hours!=='object') return false;
  return DAYS.every(day=>Array.isArray(hours[day])&&hours[day].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isInteger)&&p[0]>=0&&p[0]<1440&&p[1]>=0&&p[1]<=1440&&p[0]!==p[1]));
}
export function scheduleOpen(hours, at = new Date()) {
  if(!validateHours(hours)) return null;
  const t=italyTime(at), previous=DAYS[(DAYS.indexOf(t.day)+6)%7];
  return hours[t.day].some(([s,e])=>e>s ? t.minute>=s&&t.minute<e : t.minute>=s) ||
    hours[previous].some(([s,e])=>e<s && t.minute<e);
}
export function sourceFresh(member,at=new Date(),maxDays=30) {
  const value=Date.parse(member?.observedAt||'');
  const age=(new Date(at).getTime()-value)/86400000;
  return Number.isFinite(age)&&age>=-1&&age<=maxDays;
}
export function sourceOpen(member,at=new Date(),maxDays=30) {
  if(!member||member.active!==true||member.evidence!=='official'||!sourceFresh(member,at,maxDays)) return null;
  if((member.closedDates||[]).includes(italyTime(at).date)) return false;
  return scheduleOpen(member.hours,at);
}
// Conflicts stay visible; conservative policy requires all official schedules to agree.
export function siteOpening(site,at=new Date(),maxDays=30) {
  const sources=(site.memberships||[]).filter(m=>m.evidence==='official'&&m.active===true);
  const values=sources.map(m=>sourceOpen(m,at,maxDays));
  const conflict=(site.conflicts||[]).some(c=>c.type==='hours');
  const open=values.length&&values.every(v=>v===true) ? true : values.some(v=>v===false) ? false : null;
  return {open,conflict,label:open===null?'Orari da verificare':open?(conflict?'Fascia comune alle fonti':'Aperto da orario fonte'):(conflict?'Fuori dalla fascia comune':'Chiuso da orario fonte')};
}
export function validateCatalog(catalog) {
  if(catalog?.schemaVersion!==1||!Array.isArray(catalog.sites)) throw new Error('Catalogo corrieri non valido');
  const ids=new Set();
  for(const s of catalog.sites) {
    if(!s.id||ids.has(s.id)||!s.name||!s.address||!validCoords(s.coords)) throw new Error('Punto duplicato o coordinate non valide');
    ids.add(s.id);
    if(!Array.isArray(s.memberships)||!s.memberships.length) throw new Error('Servizi del punto mancanti');
    for(const m of s.memberships) {
      if(!NETWORKS[m.network]||!m.pointId||!validateHours(m.hours)||!/^https:\/\//.test(m.sourceUrl||'')||!Number.isFinite(Date.parse(m.observedAt))) throw new Error('Fonte o orari del corriere non validi');
      if(m.network==='brt'&&!['unknown','confirmed','not_supported_reported'].includes(m.brtDigitalStatus)) throw new Error('Stato BRT Digital non valido');
    }
  }
  return true;
}
export function canServe(site,demand,{at=new Date(),maxDays=30,openOnly=true,allowProvisionalBrtDigital=false}={}) {
  const m=site.memberships?.find(m=>m.network===demand.network);
  if(!m||m.active!==true||m.evidence!=='official'||!sourceFresh(m,at,maxDays)) return false;
  const digital=isBrtDigital(demand);
  const digitalStatus=m.brtDigitalStatus??'unknown';
  if(digital && (digitalStatus==='not_supported_reported'||m.services?.return_qr==='not_supported_reported')) return false;
  if(digital && digitalStatus!=='confirmed' && !allowProvisionalBrtDigital) return false;
  let support=m.services?.[demand.action];
  // Unknown BRT QR is never presented as verified; only an explicit provisional candidate.
  if(digital && demand.action==='return_qr' && support==='unknown' && (digitalStatus==='confirmed'||allowProvisionalBrtDigital)) support='conditional';
  if(!['confirmed','conditional','assigned_only'].includes(support)) return false;
  if(demand.action==='pickup') {
    if(!demand.assignedPointId||![site.id,m.pointId].includes(demand.assignedPointId)) return false;
  } else if(demand.labelConfirmed!==true) return false;
  const limit=m.limits||{};
  if(demand.weightKg!=null&&(!Number.isFinite(demand.weightKg)||demand.weightKg<=0||demand.weightKg>(limit.maxWeightKg??Infinity))) return false;
  if(demand.pieces!=null&&(!Number.isInteger(demand.pieces)||demand.pieces<1||demand.pieces>(limit.maxPieces??Infinity))) return false;
  if(demand.dimensionsCm!=null) {
    if(!Array.isArray(demand.dimensionsCm)||demand.dimensionsCm.length!==3||demand.dimensionsCm.some(v=>!Number.isFinite(v)||v<=0)) return false;
    const dims=[...demand.dimensionsCm].sort((a,b)=>a-b);
    if(limit.maxDimensionsCm && dims.some((v,i)=>v>[...limit.maxDimensionsCm].sort((a,b)=>a-b)[i])) return false;
    if(limit.maxLengthCmExclusive && dims[2]>=limit.maxLengthCmExclusive) return false;
    if(limit.maxVolumeM3Exclusive && dims.reduce((a,b)=>a*b,1)/1e6>=limit.maxVolumeM3Exclusive) return false;
  }
  return !openOnly || (sourceOpen(m,at,maxDays)===true && siteOpening(site,at,maxDays).open===true);
}
// Minimum physical stops, then geometric route length. Not a street-routing optimum.
export function planParcels(catalog,demands,options={}) {
  validateCatalog(catalog);
  const {origin,destination=null,at=new Date(),openOnly=true,radiusKm=10,maxStops=3,excludedSiteIds=[]}=options;
  if(!validCoords(origin)) return {status:'origin_required',plans:[],message:'Seleziona Trovami oppure un luogo salvato. Non uso il centro citta al posto della tua posizione.'};
  if(destination!==null&&!validCoords(destination)) return {status:'destination_required',plans:[],message:'Configura le coordinate del luogo di arrivo.'};
  if(!Array.isArray(demands)||demands.length<1||demands.length>4) return {status:'invalid_demands',plans:[],message:'Scegli da uno a quattro pacchi/corrieri.'};
  if(demands.some(d=>!NETWORKS[d.network]||!ACTIONS[d.action]||(d.network==='brt'&&d.brtFormat!=null&&!['digital','printed'].includes(d.brtFormat)))) return {status:'invalid_demands',plans:[],message:'Corriere, formato BRT o operazione non riconosciuti.'};
  if(demands.some(d=>d.network==='amazon')) return {status:'label_required',plans:[],message:'Per Amazon scegli il corriere/rete indicato nelle istruzioni del reso: un Amazon Locker non equivale a un punto resi universale.'};
  if(demands.some(d=>d.action==='pickup'&&!d.assignedPointId)) return {status:'assigned_point_required',plans:[],message:'Un ritiro gia consegnato va effettuato nel punto indicato nell\'avviso. Selezionalo: non posso sostituirlo con un altro negozio.'};
  if(demands.some(d=>d.action!=='pickup'&&d.labelConfirmed!==true)) return {status:'label_required',plans:[],message:'Conferma che etichetta/QR e limiti del pacco sono compatibili con la rete selezionata.'};
  if(!Number.isFinite(radiusKm)||radiusKm<=0||radiusKm>100||!Number.isInteger(maxStops)||maxStops<1||maxStops>4) throw new Error('Limiti di ricerca non validi');
  const maxDays=catalog.maxSourceAgeDays??30, full=(1<<demands.length)-1;
  const eligibleFor=allowProvisionalBrtDigital=>catalog.sites.filter(s=>!excludedSiteIds.includes(s.id)&&metres(origin,s.coords)<=radiusKm*1000)
    .map(site=>({site,mask:demands.reduce((mask,d,i)=>canServe(site,d,{at,maxDays,openOnly,allowProvisionalBrtDigital}) ? mask|(1<<i) : mask,0)})).filter(x=>x.mask);
  let eligible=eligibleFor(false),provisional=false;
  if(eligible.reduce((mask,x)=>mask|x.mask,0)!==full && demands.some(isBrtDigital)){
    const candidates=eligibleFor(true);
    if(candidates.reduce((mask,x)=>mask|x.mask,0)===full){eligible=candidates;provisional=true;}
    else eligible=candidates;
  }
  const combined=eligible.reduce((mask,x)=>mask|x.mask,0);
  const missing=demands.map((d,i)=>({d,i})).filter(x=>!(combined&(1<<x.i))).map(x=>x.d);
  const base={metric:'straight_line',objective:'fewest_stops_then_distance',evaluatedAt:new Date(at).toISOString(),radiusKm,openOnly,maxStops,catalogObservedAt:catalog.observedAt,partialCatalog:true};
  if(combined!==full) return {...base,status:'incomplete_coverage',plans:[],missing,message:demands.some(isBrtDigital)?'Nessun percorso BRT Digital confermato o candidato negli orari e nel raggio scelti. Edicolandia NON accetta BRT Digital: verifica gli altri punti nel localizzatore BRT.':'Copertura insufficiente nelle fonti disponibili, nel raggio e negli orari scelti. Non significa che i punti non esistano.'};
  let states=[]; const solutions=[];
  for(let i=0;i<eligible.length;i++)states.push({last:i,mask:eligible[i].mask,path:[i],distance:metres(origin,eligible[i].site.coords)});
  for(let depth=1;depth<=Math.min(maxStops,demands.length);depth++) {
    for(const state of states)if(state.mask===full)solutions.push({...state,total:state.distance+(destination?metres(eligible[state.last].site.coords,destination):0)});
    if(solutions.length)break;
    const next=new Map();
    for(const state of states)for(let j=0;j<eligible.length;j++){
      const mask=state.mask|eligible[j].mask;if(mask===state.mask)continue;
      const distance=state.distance+metres(eligible[state.last].site.coords,eligible[j].site.coords);
      const key=mask+':'+j, candidate={last:j,mask,path:[...state.path,j],distance};
      const values=next.get(key)||[];values.push(candidate);values.sort((a,b)=>a.distance-b.distance);next.set(key,values.slice(0,3));
    }
    states=[...next.values()].flat();
  }
  if(!solutions.length)return {...base,status:'stop_limit',plans:[],missing:[],message:`Nessuna combinazione trovata entro ${maxStops} soste. Aumenta il limite o dividi i pacchi.`};
  const direct=destination?metres(origin,destination):0;
  const plans=solutions.sort((a,b)=>a.total-b.total).slice(0,3).map(s=>({
    stops:s.path.map(i=>eligible[i].site),distanceMetres:Math.round(s.total),extraMetres:destination?Math.max(0,Math.round(s.total-direct)):null,
    assignments:demands.map((d,i)=>{const assigned=s.path.map(j=>eligible[j]).find(p=>p.mask&(1<<i)).site;return {demandIndex:i,network:d.network,action:d.action,brtFormat:isBrtDigital(d)?'digital':d.brtFormat,provisional:isBrtDigital(d)&&assigned.memberships.find(m=>m.network==='brt')?.brtDigitalStatus!=='confirmed',siteId:assigned.id};}),
    warnings:['Distanze in linea d\'aria: ordine indicativo, non chilometri stradali.','Orari verificati alla partenza selezionata, non all\'arrivo; verifica chiusure, tempi di viaggio, etichetta, peso e ingombri.',...(s.path.some(i=>siteOpening(eligible[i].site,at,maxDays).conflict)?['Almeno un punto ha orari discordanti: applicata la fascia comune prudenziale.']:[]),...(provisional?['BRT Digital / QR NON confermato per i punti proposti: questi sono solo CANDIDATI da contattare prima di partire. Edicolandia esclusa per segnalazione di mancata accettazione.']:[])]
  }));
  return {...base,status:provisional?'provisional':'ok',plans,missing:[]};
}
export function navigationUrl(plan,{origin,destination=null}={}) {
  const stops=plan.stops.map(s=>s.address); if(destination)stops.push(destination.join(','));
  const last=stops.pop();const q=new URLSearchParams({api:'1',destination:last,travelmode:'driving'});
  if(validCoords(origin))q.set('origin',origin.join(',')); if(stops.length)q.set('waypoints',stops.join('|'));
  return 'https://www.google.com/maps/dir/?'+q.toString();
}
export function interpretCarrierText(text) {
  const t=String(text||'').toLowerCase(), networks=[];
  if(/\bbrt\b|bartolini/.test(t))networks.push('brt');
  if(/dhl/.test(t))networks.push(/dhl\s*(e.?commerce|parcel)/.test(t)?'dhl_ecommerce':/dhl\s*express/.test(t)?'dhl_express':'dhl_unspecified');
  if(/in\s?post/.test(t))networks.push('inpost');if(/\bups\b/.test(t))networks.push('ups');if(/\bgls\b/.test(t))networks.push('gls');
  if(/poste|sda/.test(t))networks.push('poste');
  const amazon=/amazon/.test(t);
  return {networks:[...new Set(networks)],amazon,needsClarification:networks.includes('dhl_unspecified')||(amazon&&!networks.length),brtFormat:/non[ -]?digital|cartace|stampat|etichetta fisica/.test(t)?'printed':'digital',action:/ritirar|ritiro/.test(t)?'pickup':/reso|restitui/.test(t)?(/\bqr\b/.test(t)?'return_qr':'return_label'):'dropoff',towardHome:/verso casa|torn.*casa|and.*casa/.test(t)};
}
