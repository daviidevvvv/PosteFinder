import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeCatalog} from '../src/carrier-catalog.mjs';
import {normalizeOfficialSources,amazonHours,dhlHours,glsHours} from '../src/official-normalize.mjs';
import {validateCatalog,canServe,planParcels,siteOpening,sourceOpen} from '../src/carrier-planner.mjs';
import {validateParcelSelections} from '../src/parcel-wizard.mjs';

const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const mapping=read('research/official-site-mapping-bisceglie-2026-10-13.json');
const geoPaths=['research/geocodes-batch-a-20261013.json','research/geocodes-batch-b-20261013.json','research/geocodes-batch-c-20261013.json'];
const allGeo=new Map(geoPaths.flatMap(read).map(x=>[x.id,x]));
const input=normalizeOfficialSources(read('data/carrier-inputs.json'),{
 amazon:read('research/official-amazon-bisceglie-2026-10-13.json'),
 dhl:read('research/official-dhl-finder-bisceglie-2026-10-13.json'),
 gls:read('research/official-gls-bisceglie-2026-10-13.json'),
 mapping,geocodes:[...allGeo.values()],
 html:readFileSync(new URL('../index.html',import.meta.url),'utf8')
});
const c=makeCatalog(input);
const site=id=>c.sites.find(s=>s.id===id);
const count=network=>c.sites.flatMap(s=>s.memberships).filter(m=>m.network===network).length;
const at='2026-10-13T10:15:00Z';
const coords=[41.238,16.505];

test('Bisceglie only: 59 independently accessible places and 126 explicit network memberships',()=>{
 assert.equal(validateCatalog(c),true);
 assert.equal(c.sites.length,59);
 assert.equal(c.sites.reduce((total,s)=>total+s.memberships.length,0),126);
 assert.equal(count('amazon'),28);
 assert.equal(count('dhl_ecommerce'),30);
 assert.equal(count('poste'),25);
 assert.equal(count('gls'),20);
 assert.equal(count('brt'),10);
 assert.equal(count('inpost'),7);
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
 assert.equal(validateParcelSelections([d]).ok,false);
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
test('Historical BRT, InPost and DHL Express observation dates remain unchanged',()=>{
 const old=['brt','inpost','dhl_express'];
 for(const net of old)for(const m of c.sites.flatMap(s=>s.memberships).filter(m=>m.network===net))
  assert.equal(m.observedAt,'2026-10-12');
 for(const net of ['amazon','poste','gls','dhl_ecommerce'])for(const m of c.sites.flatMap(s=>s.memberships).filter(m=>m.network===net))
  assert.equal(m.observedAt,'2026-10-13');
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
