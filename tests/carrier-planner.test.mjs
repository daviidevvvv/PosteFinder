import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCatalog,planParcels,scheduleOpen,italyTime,siteOpening,canServe,metres,navigationUrl,interpretCarrierText} from '../src/carrier-planner.mjs';
import {makeCatalog,unpackHours} from '../src/carrier-catalog.mjs';
const c=makeCatalog(JSON.parse(readFileSync(new URL('../data/carrier-inputs.json',import.meta.url),'utf8')));
const at='2026-10-12T08:30:00Z',origin=[41.2400,16.5040];
const demand=(network,action='return_label')=>({network,action,labelConfirmed:true});
const site=id=>c.sites.find(s=>s.id===id);
const opts={origin,at};
test('20 physical sites / 23 carrier memberships / stable legacy ids',()=>{
 assert.equal(validateCatalog(c),true);assert.equal(c.sites.length,20);assert.equal(c.sites.reduce((n,s)=>n+s.memberships.length,0),23);
 assert.equal(site('edicolandia').legacyId,5);assert.equal(site('trentadue').legacyId,19);
});
test('DHL Express plus BRT offers one physical stop, not duplicate pins',()=>{
 const p=planParcels(c,[demand('dhl_express'),demand('brt')],opts);assert.equal(p.status,'ok');
 assert.equal(p.plans[0].stops.length,1);assert.ok(['edicolandia','trentadue'].includes(p.plans[0].stops[0].id));
 assert.equal(p.plans[0].assignments.length,2);
});
test('Edicolandia conflicting lunchtime data are not advertised as certain open',()=>{
 const t='2026-10-12T12:00:00Z';
 assert.equal(siteOpening(site('edicolandia'),t).open,false);
 assert.equal(canServe(site('edicolandia'),demand('dhl_express'),{at:t}),false);
});
test('Nexus 16:00 BRT versus 16:30 InPost uses conservative window',()=>{
 assert.equal(siteOpening(site('nexus'),'2026-10-12T14:15:00Z').open,false);
 assert.equal(siteOpening(site('nexus'),'2026-10-12T14:35:00Z').open,true);
});
test('opening endpoint is exclusive',()=>{
 assert.equal(scheduleOpen(site('nexus').memberships[0].hours,'2026-10-12T10:29:00Z'),true);
 assert.equal(scheduleOpen(site('nexus').memberships[0].hours,'2026-10-12T10:30:00Z'),false);
});
test('24-hour lockers work at 00:00 and 23:59',()=>{
 const h=site('inpost-famila').memberships[0].hours;
 assert.equal(scheduleOpen(h,'2026-10-11T22:00:00Z'),true);
 assert.equal(scheduleOpen(h,'2026-10-12T21:59:00Z'),true);
});
test('unknown hours are unknown, not inferred closed',()=>assert.equal(scheduleOpen(null,at),null));
test('Rome timezone handles daylight-saving transition',()=>{
 assert.equal(italyTime('2026-10-24T14:00:00Z').minute,16*60);
 assert.equal(italyTime('2026-10-26T14:00:00Z').minute,15*60);
});
test('overnight window carries to next day only before closing',()=>{
 const h=Object.fromEntries(['mon','tue','wed','thu','fri','sat','sun'].map(d=>[d,[]]));h.mon=[[1320,120]];
 assert.equal(scheduleOpen(h,'2026-10-12T21:30:00Z'),true);
 assert.equal(scheduleOpen(h,'2026-10-12T23:30:00Z'),true);
 assert.equal(scheduleOpen(h,'2026-10-13T00:00:00Z'),false);
});
test('DHL eCommerce is never silently substituted with Express',()=>{
 const p=planParcels(c,[demand('dhl_ecommerce')],opts);assert.equal(p.status,'incomplete_coverage');assert.equal(p.missing[0].network,'dhl_ecommerce');
});
test('Amazon requires actual label carrier',()=>assert.equal(planParcels(c,[demand('amazon')],opts).status,'label_required'));
test('correct label confirmation is mandatory',()=>assert.equal(planParcels(c,[{network:'brt',action:'dropoff'}],opts).status,'label_required'));
test('delivered pickup cannot move to another shop',()=>{
 assert.equal(planParcels(c,[demand('brt','pickup')],opts).status,'assigned_point_required');
 const p=planParcels(c,[{...demand('brt','pickup'),assignedPointId:'nexus'}],opts);
 assert.equal(p.plans[0].stops[0].id,'nexus');
});
test('no GPS means no invented distance from city center',()=>assert.equal(planParcels(c,[demand('brt')],{at}).status,'origin_required'));
test('stale observations cannot produce current verified routes',()=>assert.equal(planParcels(c,[demand('brt')],{...opts,at:'2027-01-01T09:00:00Z'}).status,'incomplete_coverage'));
test('recorded holiday closure is respected',()=>assert.equal(canServe(site('edicolandia'),demand('dhl_express'),{at:'2026-11-01T09:00:00Z'}),false));
test('BRT QR never becomes VERIFIED without point-specific support',()=>{
 assert.equal(canServe(site('trentadue'),demand('brt','return_qr'),{at}),false);
 const result=planParcels(c,[demand('brt','return_qr')],opts);
 assert.equal(result.status,'provisional');
 assert.ok(result.plans.length>0);
 assert.ok(result.plans.every(p=>p.stops.every(s=>s.id!=='edicolandia')));
 assert.ok(result.plans[0].assignments[0].provisional);
});
test('Edicolandia refuses BRT Digital for shipping, returns and QR',()=>{
 for(const action of ['dropoff','return_label','return_qr']){
  const d={...demand('brt',action),brtFormat:'digital'};
  assert.equal(canServe(site('edicolandia'),d,{at,allowProvisionalBrtDigital:true}),false);
 }
 assert.equal(canServe(site('edicolandia'),{...demand('brt','dropoff'),brtFormat:'printed'},{at}),true);
 assert.equal(canServe(site('edicolandia'),demand('dhl_express','return_qr'),{at}),true);
});
test('BRT Digital plus DHL yields one PROVISIONAL stop, never Edicolandia',()=>{
 const p=planParcels(c,[{...demand('brt','dropoff'),brtFormat:'digital'},demand('dhl_express')],opts);
 assert.equal(p.status,'provisional');
 assert.equal(p.plans[0].stops.length,1);
 assert.equal(p.plans[0].stops[0].id,'trentadue');
});
test('Only point-specific support can make a verified BRT Digital route',()=>{
 const copy=structuredClone(c),brt=copy.sites.find(s=>s.id==='trentadue').memberships.find(m=>m.network==='brt');
 brt.brtDigitalStatus='confirmed';brt.services.return_qr='confirmed';
 const verified=planParcels(copy,[{...demand('brt','dropoff'),brtFormat:'digital'}],opts);
 assert.equal(verified.status,'ok');
 assert.equal(verified.plans[0].stops[0].id,'trentadue');
});
test('BRT digital and printed parser modes remain distinct',()=>{
 assert.equal(interpretCarrierText('Devo spedire BRT digital').brtFormat,'digital');
 assert.equal(interpretCarrierText('Devo spedire BRT con etichetta stampata').brtFormat,'printed');
 assert.equal(interpretCarrierText('Devo spedire un pacco BRT').brtFormat,null);
});
test('DHL Express QR explicitly documented',()=>assert.equal(canServe(site('edicolandia'),demand('dhl_express','return_qr'),{at}),true));
test('weight and rotated package dimensions are checked when supplied',()=>{
 assert.equal(canServe(site('edicolandia'),{...demand('brt'),weightKg:21},{at}),false);
 assert.equal(canServe(site('inpost-famila'),{...demand('inpost'),dimensionsCm:[64,38,41]},{at}),true);
 assert.equal(canServe(site('inpost-famila'),{...demand('inpost'),dimensionsCm:[65,38,41]},{at}),false);
});
test('several carriers need two stops and retain correct assignments',()=>{
 const p=planParcels(c,[demand('brt'),demand('dhl_express'),demand('inpost')],opts);
 assert.equal(p.status,'ok');assert.equal(p.plans[0].stops.length,2);assert.equal(p.plans[0].assignments.length,3);
});
test('closed / excluded points cannot sneak into route',()=>{
 const p=planParcels(c,[demand('brt'),demand('dhl_express')],{...opts,excludedSiteIds:['edicolandia','trentadue']});
 assert.equal(p.plans[0].stops.length,2);assert.ok(p.plans[0].stops.every(s=>!['edicolandia','trentadue'].includes(s.id)));
});
test('stop bound is explicit rather than false coverage claim',()=>assert.equal(planParcels(c,[demand('dhl_express'),demand('inpost')],{...opts,maxStops:1}).status,'stop_limit'));
test('unbounded or malformed options are rejected',()=>assert.throws(()=>planParcels(c,[demand('brt')],{...opts,radiusKm:100000})));
test('home endpoint contributes to complete geometric route',()=>{
 const destination=[41.23,16.49];const p=planParcels(c,[demand('brt'),demand('dhl_express')],{...opts,destination}).plans[0];
 assert.equal(p.distanceMetres,Math.round(metres(origin,p.stops[0].coords)+metres(p.stops[0].coords,destination)));
 assert.ok(p.extraMetres>=0);const u=new URL(navigationUrl(p,{origin,destination}));assert.equal(u.searchParams.get('destination'),destination.join(','));
});
test('natural-language parser preserves DHL ambiguity',()=>{
 const q=interpretCarrierText('Ho un pacco DHL e uno Bartolini da lasciare andando verso casa');assert.equal(q.needsClarification,true);assert.ok(q.networks.includes('dhl_unspecified'));assert.equal(q.towardHome,true);
});
test('source dataset has no private account fields',()=>{
 const raw=JSON.stringify(c);assert.ok(!/apiKey|gemini_api_key|user_favorites/.test(raw));
});
test('normalization rejects incomplete or duplicate weeks',()=>{assert.throws(()=>unpackHours('mon=0-1440'));assert.throws(()=>unpackHours('mon,mon,tue,wed,thu,fri,sat,sun=0-1440'));});
test('Edicolandia user report non digital is retained',()=>{assert.equal(site('edicolandia').memberships[0].services.return_qr,'not_supported_reported');assert.ok(site('edicolandia').memberships[0].userReport.includes('NON accetta BRT Digital'));});

test('Removed Amazon Veridiana ex PENNY is not an active static map location',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(!/\\bid:\\s*402\\s*,\\s*kind:\\s*["']locker_amazon/.test(html),'obsolete Veridiana pin is still active');
 assert.match(html,/Amazon Locker Veridiana .*DISATTIVATO/);
});
test('ENI Amazon Melezio lead is informational, never a falsely verified carrier membership',()=>{
 const eno=site('eni-09033');
 assert.deepEqual(eno.memberships.map(m=>m.network),['dhl_express']);
 const ui=readFileSync(new URL('../src/carrier-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/Amazon Locker Melezio/);
 assert.match(ui,/NON e confermata dal selettore ufficiale Amazon/);
});
