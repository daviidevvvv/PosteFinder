import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeCatalog} from '../src/carrier-catalog.mjs';
import {normalizeOfficialSources,amazonHours,dhlHours,glsHours} from '../src/official-normalize.mjs';
import {validateCatalog,canServe,planParcels,siteOpening,sourceOpen} from '../src/carrier-planner.mjs';
import {validateParcelSelections,routeDemandPartition} from '../src/parcel-wizard.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const mapping=read('research/official-site-mapping-bisceglie-2026-10-13.json');
const geoPaths=['research/geocodes-batch-a-20261013.json','research/geocodes-batch-b-20261013.json','research/geocodes-batch-c-20261013.json'];
const allGeo=new Map(geoPaths.flatMap(read).map(x=>[x.id,x]));
const input=normalizeOfficialSources(read('data/carrier-inputs.json'),{
 amazon:read('research/official-amazon-bisceglie-2026-10-13.json'),
 dhl:read('research/official-dhl-finder-bisceglie-2026-10-13.json'),
 gls:read('research/official-gls-bisceglie-2026-10-13.json'),
 posteLockers:read('research/official-poste-lockers-bisceglie-2026-10-14.json'),
 mapping,geocodes:[...allGeo.values()],
 html:readFileSync(new URL('../index.html',import.meta.url),'utf8')
});
const c=makeCatalog(input);
const site=id=>c.sites.find(s=>s.id===id);
const count=network=>c.sites.flatMap(s=>s.memberships).filter(m=>m.network===network).length;
const at='2026-10-13T10:15:00Z';
const coords=[41.238,16.505];

test('Bisceglie only: 60 independently accessible places and 128 explicit network memberships',()=>{
 assert.equal(validateCatalog(c),true);
 assert.equal(c.sites.length,60);
 assert.equal(c.sites.reduce((total,s)=>total+s.memberships.length,0),128);
 assert.equal(count('amazon'),28);
 assert.equal(count('dhl_ecommerce'),30);
 assert.equal(count('poste'),25);
 assert.equal(count('gls'),20);
 assert.equal(count('brt'),10);
 assert.equal(count('inpost'),9);
 assert.equal(count('dhl_express'),6);
 assert.ok(c.sites.every(s=>/Bisceglie/i.test(s.address)));
 assert.ok(c.sites.every(s=>s.memberships.length>0));
});
test('Each carrier code and stable app pin ID is unique, old dynamic IDs unchanged',()=>{
 const codes=new Set(),pinIds=new Set();
 for(const s of c.sites){
  assert.ok(Number.isSafeInteger(s.appId??s.legacyId));
  assert.ok((s.appId??s.legacyId)<=1000000,'Firestore profile preference IDs must be <= 1000000');
  const id=s.legacyId??s.appId;assert.ok(!pinIds.has(id));pinIds.add(id);
  for(const m of s.memberships){
   const key=m.network+':'+m.pointId;
   assert.ok(!codes.has(key),key);codes.add(key);
  }
 }
 assert.equal(site('edicolandia').legacyId,5);
 assert.equal(site('nexus').appId,8101);
 assert.equal(site('brescia').appId,8102);
 assert.equal(site('eni-09033').appId,8110);
 assert.equal(site('amazon-milvia').legacyId,401);
 assert.ok(c.sites.every(s=>!/veridiana|peppinay/i.test(s.name)));
});



test('Live Poste map: locker Y3840 is at provider coordinates and supports eligible Paperless shipments',()=>{
 const report=read('research/official-poste-lockers-bisceglie-2026-10-14.json');
 assert.equal(report.results.length,2);
 const [small,large]=report.results;
 assert.equal(small.httpStatus,200);assert.equal(large.httpStatus,200);
 assert.equal(small.status,'SUCCESS');assert.equal(large.status,'SUCCESS');
 assert.equal(small.bisceglie.length,1);assert.equal(large.bisceglie.length,1);
 assert.deepEqual(small.bisceglie[0],large.bisceglie[0]);
 const observed=small.bisceglie[0];
 assert.equal(observed.frazionario,'Y3840');
 assert.equal(observed.tipoPunto,'PuntoPosteLocker');
 assert.equal(observed.citta,'Bisceglie');
 const s=site('ip322-locker');
 assert.equal(s.kind,'locker_punto_poste');
 assert.deepEqual(s.coords,[Number(observed.lat),Number(observed.lon)]);
 assert.equal(s.coordinatePrecision,'official_provider');
 assert.match(s.name,/Locker/i);
 const poste=s.memberships.find(m=>m.network==='poste');
 assert.equal(poste.pointId,'Y3840');
 assert.equal(poste.sourceUrl,'https://www.poste.it/prenotazione/vieni-in-poste?vieni-in-poste');
 assert.equal(poste.observedAt,'2026-10-14');
 assert.equal(poste.sourceMethod,'official_poste_live_map');
 assert.equal(poste.paperlessAvailableForEligibleShipment,true);
 assert.ok(poste.providerCapabilities.includes('Paperless: spedisci senza etichetta'));
 assert.equal(poste.services.return_qr,'unknown','Paperless shipment does not prove an arbitrary return QR');
 assert.deepEqual(poste.hours.mon,[[1,1439]]);
 assert.equal(canServe(s,{network:'poste',action:'return_label',labelConfirmed:true},{at:'2026-10-14T10:00:00Z'}),true);
 assert.equal(s.legacyId,null);
});
test('Famila historical locker is not promoted as currently confirmed by Poste maps',()=>{
 const report=read('research/official-poste-lockers-bisceglie-2026-10-14.json');
 for(const search of report.results){
  assert.equal(search.bisceglie.some(x=>/famila/i.test(x.nomePunto+x.indirizzoPunto)),false);
 }
 assert.equal(c.sites.some(s=>s.name.includes('Famila')&&s.kind==='locker_punto_poste'),false,
  'The old Famila static record must not be inserted as a verified live carrier site');
});
test('All Amazon Locker names from the official snapshot are shown as actual locker pins, not hidden in a nearby shop',()=>{
 const amazon=read('research/official-amazon-bisceglie-2026-10-13.json');
 const observed=amazon.queries.flatMap(x=>x.results);
 const aliases=read('research/official-site-mapping-bisceglie-2026-10-13.json').amazon;
 const confirmed=new Set();
 for(let i=0;i<observed.length;i++){
  if(!/Amazon Locker/i.test(observed[i].name))continue;
  const s=site(aliases[i]);confirmed.add(s.id);
  assert.equal(s.kind,'locker_amazon',observed[i].name+' should have an Amazon Locker icon and be included in Locker filter');
  assert.match(s.name,/Amazon Locker/i,'Locker must be searchable by display name');
  assert.ok(s.memberships.some(m=>m.network==='amazon'));
 }
 assert.deepEqual([...confirmed].sort(),['amazon-maristella','amazon-melezio','amazon-milvia']);
});
test('InPost: preserve 14 October history; 20 October 8 active and 1 pending',()=>{
 const previous=read('research/official-inpost-lockers-bisceglie-2026-10-14.json');
 const current=read('research/official-inpost-bisceglie-2026-10-20.json');
 assert.equal(previous.points.length,8);
 assert.equal(previous.points.filter(x=>x.type==='locker').length,6);
 assert.equal(previous.points.filter(x=>x.type==='point').length,2);
 assert.equal(current.points.length,8);
 assert.equal(current.points.filter(x=>x.type==='locker').length,5);
 assert.equal(current.points.filter(x=>x.type==='point').length,3);
 const members=c.sites.flatMap(s=>s.memberships.filter(m=>m.network==='inpost').map(m=>({id:s.id,kind:s.kind,code:m.pointId,active:m.active})));
 const actual=new Set(members.map(x=>x.code));
 assert.equal(actual.size,9);
 for(const p of previous.points)assert.ok(actual.has(p.code),'Never silently delete historical code '+p.code);
 assert.deepEqual(new Set(members.filter(m=>m.active).map(m=>m.code)),new Set(current.points.map(p=>p.code)));
 assert.equal(members.filter(m=>m.active&&m.kind==='locker_inpost').length,5);
 assert.equal(members.filter(m=>m.active&&m.kind!=='locker_inpost').length,3);
 assert.deepEqual(current.changesVs20261014.unverifiedRemoval,['ITBLQ149474B']);
});
test('Ciuffo Wash historical outdoor InPost locker remains visible only under All as IN SOSPESO',()=>{
 const s=site('inpost-ciuffo-wash');
 assert.ok(s,'Ciuffo Wash should appear as a live map marker');
 assert.equal(s.kind,'locker_inpost');
 assert.equal(s.address,'Via Mosca 4, Bisceglie');
 assert.match(s.name,/Ciuffo Wash/);
 assert.equal(s.coordinatePrecision,'street_approx');
 assert.match(s.coordinateNote,/NON posizione verificata/);
 assert.deepEqual(s.memberships.map(m=>m.network),['inpost']);
 const m=s.memberships[0];
 assert.equal(m.pointId,'ITBLQ149474B');
 assert.equal(m.observedAt,'2026-10-14');
 assert.equal(m.sourceUrl,'https://inpost.it/locker-bisceglie-itblq149474b-via-mosca');
 assert.equal(m.services.pickup,'assigned_only');
 assert.equal(m.services.return_qr,'unknown','QR returns must not be inferred from H24 listing');
 assert.equal(m.active,false,'Missing current listing is not proof of closure, but must not be recommended');
 assert.equal(sourceOpen(m,at),null);
 assert.equal(s.appId,8114,'Appending Ciuffo must preserve the pre-existing InPost and BRT favorite IDs');
 const ui=readFileSync(new URL('../src/carrier-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/street_approx/);
 assert.match(ui,/IN SOSPESO/);
});
test('Amazon Locker melezio is separately visible from ENI DHL Express and searchable as a locker',()=>{
 const locker=site('amazon-melezio'), eni=site('eni-09033');
 assert.ok(locker,'Dedicated Amazon Locker melezio must exist');
 assert.ok(eni,'Original ENI DHL ServicePoint must remain');
 assert.match(locker.name,/Amazon Locker melezio/i);
 assert.match(locker.address,/Imbriani 258, Bisceglie/i);
 assert.equal(locker.kind,'locker_amazon');
 assert.equal(locker.coordinatePrecision,'shared_area_approx');
 assert.deepEqual(locker.coords,eni.coords,'Locker and station share approximate area, not an asserted same entrance');
 assert.notEqual(locker.appId,eni.appId,'Map pins must be separate');
 assert.ok(Number.isSafeInteger(locker.appId)&&locker.appId<=1000000);
 assert.deepEqual(locker.memberships.map(m=>m.network),['amazon']);
 assert.deepEqual(eni.memberships.map(m=>m.network),['dhl_express']);
 const m=locker.memberships[0];
 assert.match(m.sourceAddresses[0],/ENI Station pv.9033/);
 assert.equal(m.services.pickup,'assigned_only');
 assert.equal(m.services.return_label,'unknown');
 assert.equal(m.providerPointId,null);
 assert.equal(sourceOpen(m,at),true);
 assert.ok(m.sourceUrl.startsWith('https://www.amazon.it/ulp/view'));
 const demand={network:'amazon',action:'pickup',assignedPointId:'amazon-melezio'};
 assert.equal(validateParcelSelections([demand]).ok,true);
 assert.equal(canServe(locker,demand,{at}),true);
 const ui=readFileSync(new URL('../src/carrier-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/shared_area_approx/,'Approximate locker pin must show a visible warning');
});
test('Amazon returns are never inferred from a pickup listing',()=>{
 const d={network:'amazon',action:'return_label',labelConfirmed:true};
 assert.equal(validateParcelSelections([d]).ok,true,'Choosing a parcel operation alone is allowed without extra modal confirmation');
 assert.equal(routeDemandPartition([d]).pending.length,1,'But no Amazon Hub dropoff can be inferred from pickup-only membership');
 const r=planParcels(c,[d],{origin:coords,at});
 assert.equal(r.status,'label_required');
 assert.equal(site('amazon-maristella').memberships.find(m=>m.network==='amazon').services.return_qr,'unknown');
});
test('Same seller is one shop with separate networks, not four duplicate pins',()=>{
 const edico=site('edicolandia');
 assert.equal(c.sites.filter(s=>s.id==='edicolandia').length,1);
 const net=new Set(edico.memberships.map(m=>m.network));
 for(const n of ['brt','dhl_express','poste','dhl_ecommerce','gls','amazon'])assert.ok(net.has(n));
 const brt=edico.memberships.find(m=>m.network==='brt');
 assert.equal(brt.brtDigitalStatus,'not_supported_reported');
 assert.equal(canServe(edico,{network:'brt',action:'return_qr',brtFormat:'digital',labelConfirmed:true},{at,allowProvisionalBrtDigital:true,openOnly:false}),false);
});
test('One closed courier never overrides a different courier open at the same shop',()=>{
 const s=site('edicolandia'), t='2026-10-13T11:30:00Z'; // Tuesday 13:30 Italy
 const dhl={network:'dhl_express',action:'return_label',labelConfirmed:true};
 const brt={network:'brt',action:'return_label',labelConfirmed:true,brtFormat:'printed'};
 assert.equal(sourceOpen(s.memberships.find(m=>m.network==='brt'),t),false);
 assert.equal(sourceOpen(s.memberships.find(m=>m.network==='dhl_express'),t),true);
 assert.equal(canServe(s,dhl,{at:t}),true);
 assert.equal(canServe(s,brt,{at:t}),false);
 assert.equal(siteOpening(s,t).open,true);
 assert.match(siteOpening(s,t).label,/Alcune reti aperte/);
});
test('DHL Finder partner is not conflated with DHL Express, QR not invented',()=>{
 const s=site('tabaccheria-n8');
 const poste=s.memberships.find(m=>m.network==='poste'),ec=s.memberships.find(m=>m.network==='dhl_ecommerce');
 assert.equal(poste.pointId,'Z2860');
 assert.equal(ec.pointId,'8058-Z2860');
 assert.equal(ec.services.return_label,'conditional');
 assert.equal(ec.services.return_qr,'unknown');
 assert.ok(!s.memberships.some(m=>m.network==='dhl_express'));
 assert.equal(sourceOpen(poste,at),true);
});
test('Official GLS listings are counted but label-free return is never fabricated',()=>{
 const s=site('caffe-frisari');
 const networks=s.memberships.map(m=>m.network);
 assert.ok(networks.includes('amazon'));
 assert.ok(networks.includes('gls'));
 assert.equal(s.memberships.find(m=>m.network==='gls').services.return_qr,'unknown');
 const pin=site('autolavaggio-pansini');
 assert.equal(pin.coordinatePrecision,'nearby_proxy');
 assert.equal(canServe(pin,{network:'gls',action:'dropoff',labelConfirmed:true},{at,openOnly:false}),false);
});
test('Each carrier observation retains its verification date, including 20 October Trentadue',()=>{
 for(const net of ['brt','dhl_express'])for(const m of c.sites.flatMap(s=>s.memberships).filter(m=>m.network===net))
  assert.equal(m.observedAt,'2026-10-12');
 for(const m of c.sites.flatMap(s=>s.memberships).filter(m=>m.network==='inpost'))
  assert.equal(m.observedAt,m.pointId==='ITPBT09528P'?'2026-10-20':m.pointId==='ITBLQ149474B'?'2026-10-14':'2026-10-12');
 for(const net of ['amazon','gls','dhl_ecommerce'])for(const m of c.sites.flatMap(s=>s.memberships).filter(m=>m.network===net))
  assert.equal(m.observedAt,'2026-10-13');
 for(const m of c.sites.flatMap(s=>s.memberships).filter(m=>m.network==='poste'))
  assert.equal(m.observedAt,m.pointId==='Y3840'?'2026-10-14':'2026-10-13');
});
test('Source parsers cover Amazon ranges, DHL compact intervals, GLS split hours',()=>{
 const am=amazonHours(['Mon-Sat: 05:00 - 23:00','Sun: 06:00 - 14:00']);
 assert.deepEqual(am.mon,[[300,1380]]);
 const ec=dhlHours(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
   .map(day=>({day,hours:day==='Sunday'?'closed':'07:00 - 13:0015:00 - 21:00'})));
 assert.deepEqual(ec.tue,[[420,780],[900,1260]]);
 const gls=glsHours(['Lunedì 09:30 - 12:30','Lunedì 17:00 - 20:00']);
 assert.deepEqual(gls.mon,[[570,750],[1020,1200]]);
 assert.deepEqual(gls.sun,[]);
});
test('Geocoded points are explicitly marked approximate, never credited to courier',()=>{
 for(const s of c.sites.filter(s=>s.coordinatePrecision==='street_approx')){
  assert.match(s.coordinateNote,/approssimative/);
  assert.ok(s.memberships.every(m=>m.sourceUrl&&!m.sourceUrl.includes('openstreetmap.org')));
 }
});
