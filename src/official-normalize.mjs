// Normalize immutable snapshots from OFFICIAL courier locators, never from business-directory guesses.
// Courier existence/services/hours come from Amazon, DHL Finder and GLS. Nominatim is COORDINATES ONLY.
const DAYS=['mon','tue','wed','thu','fri','sat','sun'];
const AMZ_DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const LONG_DAYS=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const GLS_DAYS=['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
const OFFICIAL_DATE='2026-10-13';

const copy=value=>JSON.parse(JSON.stringify(value));
function minutes(hhmm){
 const bits=String(hhmm).split(':').map(Number);
 if(bits.length!==2||bits[0]>24||bits[1]>59)throw Error('Invalid clock: '+hhmm);
 return bits[0]*60+bits[1];
}
function timeRanges(raw){
 if(/open 24 hours/i.test(raw))return [[0,1440]];
 if(/closed/i.test(raw))return [];
 const out=[];
 const re=/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/g;let m;
 while((m=re.exec(raw)))out.push([minutes(m[1]),minutes(m[2])]);
 if(!out.length)throw Error('Unrecognized hours: '+raw);
 return out;
}
function emptyHours(){return Object.fromEntries(DAYS.map(d=>[d,[]]));}
function cleanWeek(h){
 for(const d of DAYS){
  const intervals=h[d].slice().sort((a,b)=>a[0]-b[0]);
  const output=[];
  for(const item of intervals){
   if(item[0]>=item[1])throw Error('Invalid nonpositive hours '+d+': '+JSON.stringify(item));
   if(output.length&&item[0]<=output[output.length-1][1]){
    output[output.length-1][1]=Math.max(item[1],output[output.length-1][1]);
   }else output.push(item.slice());
  }
  h[d]=output;
 }
 return h;
}
function pack(h){
 cleanWeek(h);
 return DAYS.map(d=>d+'='+h[d].map(([a,b])=>a+'-'+b).join('/')).join(';');
}
function readAmazonDays(label){
 const indices=new Set();
 for(const piece of label.split(',')){
  const bits=piece.trim().split('-').map(s=>s.trim());
  const a=AMZ_DAYS.indexOf(bits[0]),b=bits.length===2?AMZ_DAYS.indexOf(bits[1]):a;
  if(a<0||b<a)throw Error('Unknown Amazon weekday '+label);
  for(let i=a;i<=b;i++)indices.add(DAYS[i]);
 }
 return [...indices];
}
export function amazonHours(rows){
 const h=emptyHours();
 for(const line of rows){
  const sep=line.indexOf(':');if(sep<0)throw Error('Amazon week line without colon: '+line);
  const days=readAmazonDays(line.slice(0,sep));
  const times=timeRanges(line.slice(sep+1));
  for(const day of days)h[day]=times.map(pair=>pair.slice());
 }
 return cleanWeek(h);
}
export function dhlHours(rows){
 const h=emptyHours();
 for(const r of rows){
  const i=LONG_DAYS.indexOf(r.day);
  if(i<0)throw Error('Unknown DHL weekday '+r.day);
  h[DAYS[i]]=timeRanges(r.hours);
 }
 if(rows.length!==7)throw Error('Incomplete DHL week');
 return cleanWeek(h);
}
export function glsHours(rows){
 const h=emptyHours();
 for(const text of rows){
  const m=/^(Lunedì|Martedì|Mercoledì|Giovedì|Venerdì|Sabato|Domenica)\s+(\d\d:\d\d)\s+-\s+(\d\d:\d\d)$/.exec(text);
  if(!m)throw Error('Unknown GLS hour line: '+text);
  const idx=GLS_DAYS.indexOf(m[1]);
  h[DAYS[idx]].push([minutes(m[2]),minutes(m[3])]);
 }
 return cleanWeek(h);
}
function conservativeOverlap(a,b){
 const out=emptyHours();
 for(const day of DAYS){
  for(const [x,y] of a[day])for(const [p,q] of b[day]){
   const lo=Math.max(x,p),hi=Math.min(y,q);
   if(lo<hi)out[day].push([lo,hi]);
  }
 }
 return cleanWeek(out);
}
function numericKey(id){
 let hash=2166136261;
 for(const char of id){hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;}
 return 100000+hash%800000; // <= 899999: required by Firestore favorites/removedIds schema
}
function staticCoordinates(html){
 const out=new Map();let current=null;
 for(const line of String(html).split('\n')){
  const m=/^\s*\{\s*id:\s*(\d+)\s*,/.exec(line);
  if(m)current=Number(m[1]);
  if(current!==null){
   const p=/\bcoords:\s*\[\s*([\d.]+)\s*,\s*([\d.]+)\s*\]/.exec(line);
   if(p){out.set(current,[Number(p[1]),Number(p[2])]);current=null;}
  }
 }
 return out;
}
function sourceCounts(input){
 return Object.fromEntries([...new Set(input.observations.map(o=>o.network))]
   .map(network=>[network,new Set(input.observations.filter(o=>o.network===network).map(o=>o.pointId)).size]));
}
export function normalizeOfficialSources(base,{amazon,dhl,gls,posteLockers,mapping,geocodes,html}){
 if(base.schemaVersion!==1||mapping.date!==OFFICIAL_DATE)throw Error('Snapshot schema mismatch');
 if(amazon.queries.length!==2||amazon.queries.some(q=>q.results.length!==20)
    ||dhl.results.length!==30||gls.results.length!==20)throw Error('Unexpected source snapshot length; explicit mapping needs review');
 if(mapping.amazon.length!==40||mapping.dhl.length!==30||mapping.gls.length!==20)throw Error('Explicit alias map count mismatch');
 if(![amazon,dhl,gls].every(s=>s.observedAt===OFFICIAL_DATE))throw Error('Observation dates differ');
 // Poste live official map is a separately dated, narrower filter: PuntoPosteLocker ONLY.
 if(posteLockers?.observedAt!=='2026-10-14'||posteLockers.results?.length!==2||
    posteLockers.results.some(x=>x.httpStatus!==200||x.status!=='SUCCESS'||x.bisceglie.length!==1))
  throw Error('Poste official map evidence missing/partial; do not invent coordinates or completeness');
 const posteLocal=posteLockers.results[0].bisceglie[0];
 if(posteLocal.frazionario!=='Y3840'||posteLocal.tipoPunto!=='PuntoPosteLocker'||
    posteLocal.cap!=='76011'||posteLocal.citta!=='Bisceglie'||
    JSON.stringify(posteLocal)!==JSON.stringify(posteLockers.results[1].bisceglie[0]))
  throw Error('Poste local point inconsistent between search windows');
 const posteCoords=[Number(posteLocal.lat),Number(posteLocal.lon)];
 if(!posteCoords.every(Number.isFinite)||posteCoords[0]<41.2||posteCoords[0]>41.28||
    posteCoords[1]<16.4||posteCoords[1]>16.56)
  throw Error('Poste official point coordinates out of Bisceglie area');
 const input=copy(base),originalObserved=input.observedAt;
 input.observations=input.observations.map(o=>({...o,observedAt:o.observedAt||originalObserved}));
 input.observedAt=OFFICIAL_DATE;
 input.scope='Bisceglie (76011): sources official Amazon Hub, DHL Finder, GLS Point + earlier BRT, DHL Express and InPost';
 input.disclaimer+='; '+
  'NEW: Amazon Hub locations are verified only for choosing an Amazon pickup address; a return requires approval for the specific order. DHL Finder includes partner PuntoPoste sites: their services apply only to compatible DHL eCommerce or Poste labels. Road geocodes are approximate; navigate to street address.';
 const existingById=new Map(input.physicalSites.map(s=>[s.id,s]));
 const oldGeo=staticCoordinates(html);
 const coordsById=new Map(geocodes.filter(e=>e.coords&&e.precision).map(g=>[g.id,g]));
 if(oldGeo.size<25)throw Error('Static map legacy coordinates were not parsed; stop before bad geocoding');
 // Preserve old 8100-series IDs for the previous 20 dynamic pins and keep all legacy IDs stable.
 let nextOldId=8100;
 for(const site of input.physicalSites)if(site.legacyId==null)site.appId=nextOldId++;
 const reserved=new Set(input.physicalSites.map(s=>s.legacyId??s.appId));
 for(const spec of mapping.newSites){
  if(existingById.has(spec.id))continue;
  let coord=null,precision='unknown',note=spec.note||'';
  if(spec.legacyId!=null){
   coord=oldGeo.get(spec.legacyId);precision='legacy_map';
  }else if(spec.geoId&&coordsById.has(spec.geoId)){
   const geocode=coordsById.get(spec.geoId);coord=geocode.coords;precision='street_approx';
   note=(note?note+'. ':'')+'Coordinate stradali approssimative da OpenStreetMap; ingresso non verificato.';
  }else if(spec.posteOfficialPointId){
   // Trust official Poste locator coordinates, NOT historic nearby merchant pin.
   if(spec.posteOfficialPointId!==posteLocal.frazionario)throw Error('Poste locker ID mismatch for '+spec.id);
   coord=[...posteCoords];precision='official_provider';
   note=(note?note+'. ':'')+'Coordinate del localizzatore ufficiale Poste del 14/10/2026.';
  }else if(spec.coordinateSiteId){
   // Co-located shops and autonomous lockers are different courier points.
   const nearby=existingById.get(spec.coordinateSiteId);
   if(!nearby||!Array.isArray(nearby.coords)||nearby.coords.length!==2)
    throw Error('Unknown co-located site for '+spec.id);
   coord=[...nearby.coords];precision='shared_area_approx';
   note=(note?note+'. ':'')+'Posizione indicativa presso '+nearby.name+'; ingresso del locker da verificare.';
  }else if(spec.fallbackLegacyId!=null){
   coord=oldGeo.get(spec.fallbackLegacyId);precision='nearby_proxy';
   note=(note?note+'. ':'')+'Pin di riferimento vicino, non ingresso verificato.';
  }
  if(!Array.isArray(coord)||coord.length!==2)throw Error('No defensible coordinates for '+spec.id);
  const appId=spec.legacyId??numericKey(spec.id);
  if(reserved.has(appId))throw Error('Duplicate stable pin ID for '+spec.id);
  reserved.add(appId);
  const site={id:spec.id,legacyId:spec.legacyId??null,appId,
   name:spec.name,address:spec.address,city:'Bisceglie',coords:coord,
   kind:spec.kind||'punto',conflicts:[],coordinatePrecision:precision};
  if(note)site.coordinateNote=note;
  if(spec.note)site.conflicts.push({type:'identity_or_geocode',note:spec.note});
  input.physicalSites.push(site);existingById.set(site.id,site);
 }
 const seen=new Set(input.observations.map(o=>o.network+':'+o.pointId));
 const add=observation=>{
  if(!existingById.has(observation.site))throw Error('Unknown normalized site: '+observation.site);
  const key=observation.network+':'+observation.pointId;
  if(seen.has(key))throw Error('Duplicate normalized carrier point: '+key);
  seen.add(key);input.observations.push(observation);
 };
 const enforceBisceglie=(address,label)=>{
  if(!/bisceglie/i.test(address))throw Error('Out-of-scope carrier record '+label+' '+address);
 };
 const amzSource='https://www.amazon.it/ulp/view';
 const dhlSource='https://www.dhl.com/global-en/microsites/ec/dhl-finder.html';
 const glsSource='https://store.gls-italy.com/it/depot/?q=76011';
 input.networkDefaults.amazon={
  services:{dropoff:'unknown',return_label:'unknown',return_qr:'unknown',pickup:'assigned_only'},
  conditions:['Confermato SOLO come indirizzo ritiro Amazon. Compatibilita ordine verificata nel checkout; resi ammessi solo se proposti dal percorso restituzione Amazon.'],
  defaultSourceUrl:amzSource
 };
 input.networkDefaults.poste={
  services:{dropoff:'unknown',return_label:'unknown',return_qr:'unknown',pickup:'assigned_only'},
  conditions:['PuntoPoste/FERMOPOSTA: servizi elencati nel DHL Finder e validi solo con etichetta corretta. QR senza stampa NON confermato.'],
  defaultSourceUrl:dhlSource
 };
 input.networkDefaults.dhl_ecommerce={
  services:{dropoff:'unknown',return_label:'unknown',return_qr:'unknown',pickup:'unknown'},
  conditions:['DHL Finder include sedi DHL eCommerce e partner. Usare SOLO per etichetta DHL eCommerce specifica se il venditore/trasportatore abilita il punto. QR non confermato. Non confondere con DHL Express.'],
  defaultSourceUrl:dhlSource
 };
 input.networkDefaults.gls={
  services:{dropoff:'conditional',return_label:'unknown',return_qr:'unknown',pickup:'assigned_only'},
  conditions:['GLS Point elencato nel localizzatore ufficiale. Verificare che la specifica etichetta e il servizio GLS siano accettati: reso e QR non confermati dal semplice elenco.'],
  defaultSourceUrl:glsSource
 };
 // Amazon 40 visible results, two overlapping search windows, same physical shop = ONE Amazon membership.
 const grouped=new Map();
 for(const [index,record] of amazon.queries.flatMap(q=>q.results).entries()){
  enforceBisceglie(record.address,'Amazon '+index);
  const id=mapping.amazon[index];if(!existingById.has(id))throw Error('Amazon map missing '+id);
  if(/veridiana|peppinay/i.test(record.name))throw Error('Retired or unconfirmed Amazon locker reappeared');
  const hours=amazonHours(record.hours);
  let group=grouped.get(id);
  if(!group){group={site:id,hours,names:new Set(),addresses:new Set(),count:0};grouped.set(id,group);}
  else group.hours=conservativeOverlap(group.hours,hours);
  group.count++;group.names.add(record.name.trim());group.addresses.add(record.address.trim());
 }
 for(const item of grouped.values()){
  add({site:item.site,network:'amazon',pointId:'AMZ-'+item.site,
   providerPointId:null,pointIdStatus:'synthetic_internal',
   sourceUrl:amzSource,observedAt:OFFICIAL_DATE,
   hoursPacked:pack(item.hours),sourceNames:[...item.names],sourceAddresses:[...item.addresses],
   sourceQueryCount:item.count,sourceMethod:'official_amazon_pickup_selector',
   serviceOverrides:{pickup:'assigned_only',dropoff:'unknown',return_label:'unknown',return_qr:'unknown'}});
  if(item.names.size>1||item.addresses.size>1){
   const site=existingById.get(item.site);
   site.conflicts.push({type:'amazon_alias',note:'Piu denominazioni nel selettore Amazon; usa il nome indicato nell ordine/avviso: '+[...item.names].join(' / ')});
  }
  if(item.site==='amazon-melezio'){
   const site=existingById.get(item.site);
   if(site.kind!=='locker_amazon'||site.coordinatePrecision!=='shared_area_approx')
    throw Error('Melezio must have its own Amazon locker icon and approximate ENI-area pin');
   site.conflicts.push({type:'address',note:'Amazon Locator per Melezio segnala erroneamente CAP 70052; citta Bisceglie, indirizzo canonico 76011.'});
  }
 }
 // DHL Finder: 8058 = official PuntoPoste/FERMOPOSTA; 8053 = DHL ServicePoint.
 // Same visible location is one physical stop with separate carrier memberships and hours.
 for(const [index,row] of dhl.results.entries()){
  enforceBisceglie(row.address,'DHL Finder '+index);
  const site=mapping.dhl[index];if(!existingById.has(site))throw Error('DHL unmatched site '+index);
  const idPart=/\/locations\/(8058|8053)-(.+)$/.exec(row.id);
  if(!idPart)throw Error('Unexpected DHL provider ID '+row.id);
  const family=idPart[1],providerId=idPart[2],services=new Set(row.services);
  const isPoste=family==='8058';
  const claimed={
   dropoff:services.has('Drop-off parcel with label')||services.has('Parcel Drop-off')?'conditional':'unknown',
   return_label:services.has('Drop-off return with label')?'conditional':'unknown',
   return_qr:'unknown',
   pickup:services.has('Click & collect')?'assigned_only':'unknown'
  };
  const packed=pack(dhlHours(row.hours));
  if(isPoste){
   add({site,network:'poste',pointId:providerId,providerPath:row.id,sourceUrl:dhlSource,
    sourceDetailsUrl:dhlSource,observedAt:OFFICIAL_DATE,hoursPacked:packed,
    sourceName:row.name,sourceAddress:row.address,sourceMethod:'official_dhl_finder_partner',
    serviceOverrides:{...claimed}});
  }
  add({site,network:'dhl_ecommerce',pointId:family+'-'+providerId,providerPointId:providerId,
   providerPath:row.id,providerFamily:isPoste?'PUNTOPOSTE_OR_FERMOPOSTA':'DHL_SERVICEPOINT',
   sourceUrl:dhlSource,observedAt:OFFICIAL_DATE,hoursPacked:packed,
   sourceName:row.name,sourceAddress:row.address,sourceMethod:'official_dhl_finder',
   serviceOverrides:{...claimed}});
 }
 // Reconfirm the locker Y3840 against Poste's OWN live map (not merely DHL's partner list).
 // The 'Paperless' service supports eligible shipments; it does NOT automatically prove
 // that every vendor's return QR can be used at this locker.
 const posteObs=input.observations.find(x=>x.site==='ip322-locker'&&x.network==='poste'&&x.pointId===posteLocal.frazionario);
 if(!posteObs)throw Error('Official Poste locker not joined to the existing PuntoPoste partner record');
 if(!posteLocal.labelServizi?.includes('Paperless: spedisci senza etichetta')||
    !posteLocal.labelServizi.includes('Resi e-commerce')||
    !posteLocal.labelServizi.includes('Ritiro pacchi')||
    !posteLocal.labelServizi.includes('Spedizione pacchi'))throw Error('Poste locker provider capabilities changed');
 const days=posteLocal.orari.flatMap(row=>{
  if(row.orario==='CHIUSO')return [];
  return row.orario.split(',').map(part=>{
   const range=part.trim().replace(/\\s*-\\s*/,' - ');
   return row.giorno+' '+range;
  });
 });
 const postHours=pack(glsHours(days));
 posteObs.sourceUrl=posteLockers.sourceUrl;
 posteObs.sourceDetailsUrl=posteLocal.deepLink;
 posteObs.sourceName=posteLocal.nomePunto;
 posteObs.sourceAddress=posteLocal.indirizzoPunto;
 posteObs.sourceMethod='official_poste_live_map';
 posteObs.observedAt=posteLockers.observedAt;
 posteObs.coords=[...posteCoords];
 posteObs.paperlessAvailableForEligibleShipment=true;
 posteObs.providerCapabilities=[...posteLocal.labelServizi];
 posteObs.hoursPacked=postHours;
 posteObs.serviceOverrides={dropoff:'conditional',return_label:'conditional',return_qr:'unknown',pickup:'assigned_only'};
 // GLS official page does not expose point IDs or civic numbers: stable local ID, never claim official point code.
 for(const [index,row] of gls.results.entries()){
  enforceBisceglie(row.address,'GLS '+index);
  const site=mapping.gls[index];if(!existingById.has(site))throw Error('GLS unmatched site '+index);
  add({site,network:'gls',pointId:'GLS-'+site,providerPointId:null,pointIdStatus:'synthetic_internal',
   sourceUrl:glsSource,observedAt:OFFICIAL_DATE,sourceName:row.name,sourceAddress:row.address,
   sourceMethod:'official_gls_locator',hoursPacked:pack(glsHours(row.hours)),
   serviceOverrides:{dropoff:'conditional',return_label:'unknown',return_qr:'unknown',pickup:'assigned_only'}});
 }
 // Source coverage counts reflect MEMBERSHIPS, not unique physical sites.
 const counts=sourceCounts(input);
 for(const c of input.coverage){
  if(['amazon','dhl_ecommerce','gls','poste'].includes(c.network)){
   c.status='partial_live';c.count=counts[c.network];
   c.sourceUrl=input.networkDefaults[c.network].defaultSourceUrl;
   c.note=c.network==='amazon'
    ? 'Punti ritiro ordini Amazon: '+c.count+' sedi uniche ricavate da due ricerche da 20 risultati; NON attestano resi Amazon.'
    :c.network==='dhl_ecommerce'
     ? '30 voci DHL Finder a Bisceglie, comprese sedi PuntoPoste/partner; etichette compatibili da verificare, QR non attestato.'
     :c.network==='poste'
      ? '25 sedi PuntoPoste/Fermoposta mostrate nel DHL Finder; il locker IP Y3840 e confermato in proprio dalla mappa ufficiale Poste il 14/10/2026 con Paperless. Il vecchio Famila 00575 NON compare nei risultati locker live: presenza attuale da verificare.'
      : '20 GLS Point dal localizzatore ufficiale; GLs non pubblica identificativo e civico in questa pagina, QR e resi non attestati.';
  }
 }
 // Track user-reported point removal and uncertain co-locations.
 input.pending.push({name:'Amazon Locker Veridiana (ex PENNY)',address:'Via Matteo Renato Imbriani 344, Bisceglie',
  status:'decommissioned_user_report',sourceUrl:amzSource,
  finding:'Rimosso fisicamente secondo segnalazione locale utente. Non presente nelle due finestre ufficiali Amazon consultate; autocomplete peppinay non prova disponibilita. Non reinserire automaticamente.'});
 if(input.physicalSites.some(s=>/veridiana|peppinay/i.test(s.id+' '+s.name)))throw Error('Decommissioned Amazon point included as active');
 for(const s of input.physicalSites){
  const matches=input.observations.filter(o=>o.site===s.id);
  if(matches.length>1&&!s.mergeBasis)s.mergeBasis='Mappatura manuale per indirizzo e identificazione esercente; stesso civico con nomi divergenti non implica la stessa attivita.';
 }
 return input;
}
