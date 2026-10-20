import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRouteIntent} from '../src/route-intent.mjs';
import {buildRoadTableUrl,scoreRoadPlans,rankRoadPlans} from '../src/road-routing.mjs';
import {makeCatalog} from '../src/carrier-catalog.mjs';
import {readFileSync} from 'node:fs';
import {planParcels,navigationUrl} from '../src/carrier-planner.mjs';

test('One colloquial message becomes three separate packages, GPS to Casa/Palestra and two stops',()=>{
 const result=parseRouteIntent('Ho 1 pacco DHL, 1 Bartolini Digital e 1 Amazon. Dove vado in una botta o al massimo due soste vicine da qua a casa o palestra?');
 assert.equal(result.recognized,true);
 assert.deepEqual(result.parcels.map(p=>p.network),['dhl_unspecified','brt','amazon']);
 assert.equal(result.parcels[1].brtFormat,'digital');
 assert.equal(result.parcels[2].action,'');
 assert.equal(result.origin,'gps');
 assert.equal(result.destination,'choose');
 assert.equal(result.maxStops,2);
 assert.ok(result.issues.some(i=>i.includes('DHL')));
 assert.ok(result.issues.some(i=>i.includes('Amazon')));
 assert.ok(result.parcels.every(p=>!Object.hasOwn(p,'labelConfirmed')));
});
test('Casa o in palestra is a two-destination choice, not just Palestra',()=>{
 const p=parseRouteIntent('Ho 1 pacco DHL express, 1 Bartolini Digital e 1 Amazon. Parto da qui, devo andare a casa o in palestra. Trovami il giro con massimo 2 soste.');
 assert.equal(p.destination,'choose');
 assert.equal(p.parcels.length,3);
});
test('Explicit DHL Express and gym destination are preserved',()=>{
 const r=parseRouteIntent('Parto da qui: devo spedire 1 DHL Express e 1 Bartolini con etichetta stampata, andando in palestra, massimo 2 soste.');
 assert.deepEqual(r.parcels.map(p=>p.network),['dhl_express','brt']);
 assert.deepEqual(r.parcels.map(p=>p.action),['dropoff','dropoff']);
 assert.equal(r.parcels[1].brtFormat,'printed');
 assert.equal(r.destination,'palestra');
 assert.equal(r.maxStops,2);
});
test('DHL eCommerce cannot be conflated with Express, multiple packages retain count',()=>{
 const r=parseRouteIntent('Devo portare 2 pacchi DHL eCommerce e 1 BRT Digital tornando a casa');
 assert.deepEqual(r.parcels.map(p=>p.network),['dhl_ecommerce','dhl_ecommerce','brt']);
 assert.equal(r.destination,'casa');
});
test('Amazon return handled by explicit carrier is not a phantom extra parcel',()=>{
 const r=parseRouteIntent('Ho 1 reso Amazon con DHL Express, da qui a casa');
 assert.deepEqual(r.parcels.map(p=>p.network),['dhl_express']);
 assert.equal(r.parcels[0].action,'return_label');
});
test('One stop only is distinguished from two stops',()=>{
 assert.equal(parseRouteIntent('Spedisco un pacco BRT Digital in una sola sosta andando a casa').maxStops,1);
 assert.equal(parseRouteIntent('Spedisco un pacco BRT Digital in una botta o al massimo due soste andando a casa').maxStops,2);
});
test('Carrier information question passes to Gemini rather than starting a route',()=>{
 const r=parseRouteIntent('Qual è la differenza fra DHL e Bartolini?');
 assert.equal(r.recognized,false);
});
test('Cannot silently invent an assigned Amazon pickup, QR acceptance, or a label',()=>{
 const r=parseRouteIntent('Devo ritirare Amazon e mandare BRT digital, verso casa');
 assert.equal(r.parcels.find(p=>p.network==='amazon').assignedPointId,null);
 assert.ok(!Object.hasOwn(r.parcels.find(p=>p.network==='brt'),'labelConfirmed'));
});
test('Missing saved positions are not embedded in parsed phrases or in source',()=>{
 const r=parseRouteIntent('Porto DHL Express dal GPS fino a Palestra');
 assert.equal(r.origin,'gps');assert.equal(r.destination,'palestra');
 assert.ok(!('coords' in r));
});

const origin=[41.21,16.41],destination=[41.23,16.43];
const s1={id:'a',name:'Test A',address:'indirizzo A',coords:[41.215,16.415]};
const s2={id:'b',name:'Test B',address:'indirizzo B',coords:[41.22,16.42]};
const planA={stops:[s1],distanceMetres:800},planB={stops:[s2],distanceMetres:650};
const matrix={
 durations:[[0,30,10,25],[30,0,15,15],[10,15,0,10],[25,15,10,0]],
 distances:[[0,2500,500,2400],[2500,0,1200,1200],[500,1200,0,600],[2400,1200,600,0]]
};
test('OSRM request uses lon-lat and HTTPS without storing sensitive places',()=>{
 const u=buildRoadTableUrl([origin,s1.coords,destination]);
 assert.match(u,/^https:\/\/router.project-osrm.org\/table\/v1\/driving\//);
 assert.ok(u.includes('16.41,41.21;16.415,41.215;16.43,41.23'));
 assert.ok(u.endsWith('?annotations=duration,distance'));
 assert.throws(()=>buildRoadTableUrl([origin,s1.coords],'http://example.com'));
});
test('OSRM matrix orders route alternatives by road driving time, not geometric distance',()=>{
 const ranked=scoreRoadPlans([planA,planB],origin,destination,matrix);
 assert.deepEqual(ranked.map(p=>p.stops[0].id),['b','a']);
 assert.equal(ranked[0].roadDurationSeconds,20);
 assert.equal(ranked[0].roadDistanceMetres,1100);
 assert.equal(ranked[0].roadExtraMetres,0);
 assert.equal(ranked[1].roadDurationSeconds,45);
});
test('Road ranking is opt-in; calls only injected fetch on explicit invocation',async()=>{
 let calls=0;
 const result=await rankRoadPlans([planA,planB],{
  origin,destination,fetchImpl:async(url,options)=>{
   calls++;assert.match(url,/annotations=duration,distance/);
   assert.equal(options.method,'GET');
   return {ok:true,json:async()=>({code:'Ok',...matrix})};
  }
 });
 assert.equal(calls,1);
 assert.equal(result.plans[0].stops[0].id,'b');
 assert.equal(result.metric,'driving_time_estimate');
});
test('Unreachable roads are not replaced with made-up road distances',()=>{
 const broken=structuredClone(matrix);
 broken.durations[0][2]=null;
 const r=scoreRoadPlans([planA,planB],origin,destination,broken);
 assert.deepEqual(r.map(p=>p.stops[0].id),['a']);
});
test('Trip planner honors maximum two physical stops even when shortlist expands',()=>{
 const c=makeCatalog(JSON.parse(readFileSync(new URL('../data/carrier-inputs.json',import.meta.url),'utf8')));
 const demands=[{network:'brt',action:'dropoff',brtFormat:'digital',labelConfirmed:true},{network:'dhl_express',action:'dropoff',labelConfirmed:true}];
 const p=planParcels(c,demands,{origin:[41.237,16.502],destination:[41.231,16.494],at:'2026-10-20T09:30:00Z',maxStops:2,maxResults:8});
 assert.ok(['ok','provisional'].includes(p.status));
 assert.ok(p.plans.length>0);
 assert.ok(p.plans.every(v=>v.stops.length<=2));
 assert.ok(p.plans.every(v=>v.stops.every(s=>s.id!=='edicolandia')));
 assert.match(navigationUrl(p.plans[0],{origin:[41.237,16.502],destination:[41.231,16.494]}),/waypoints|destination/);
});
