import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRouteIntent} from '../src/route-intent.mjs';
import {applyRouteFollowup} from '../src/route-followup.mjs';
import {validateParcelSelections} from '../src/parcel-wizard.mjs';
import {readFileSync} from 'node:fs';
const query='Ho 1 pacco DHL, 1 Bartolini Digital e 1 Amazon. Parto da qui, devo andare a casa o in palestra. Massimo due soste.';
const start=()=>parseRouteIntent(query).parcels;

test('saying express after the three-parcel question updates DHL without losing BRT or Amazon',()=>{
 const pending=start();assert.equal(pending.length,3);
 assert.deepEqual(pending.map(p=>p.network),['dhl_unspecified','brt','amazon']);
 const r=applyRouteFollowup('express',pending);
 assert.equal(r.handled,true);
 assert.deepEqual(r.parcels.map(p=>p.network),['dhl_express','brt','amazon']);
 assert.equal(r.parcels[1].brtFormat,'digital');
 assert.equal(r.parcels[2].action,'');
 assert.equal(validateParcelSelections(r.parcels).index,2);
 assert.match(r.message,/altri pacchi/i);
});
test('Amazon remains a parcel when clarified as a reso; only merchant network changes on next reply',()=>{
 let p=applyRouteFollowup('Express',start()).parcels;
 let next=applyRouteFollowup('è un reso',p);
 assert.equal(next.handled,true);
 assert.equal(next.parcels.length,3);
 assert.equal(next.parcels[2].network,'amazon');
 assert.equal(next.parcels[2].action,'return_label');
 next=applyRouteFollowup('Poste',next.parcels);
 assert.equal(next.handled,true);
 assert.deepEqual(next.parcels.map(v=>v.network),['dhl_express','brt','poste']);
 assert.equal(next.parcels[2].action,'return_label');
 assert.equal(validateParcelSelections(next.parcels).ok,true);
});
test('Amazon pickup never invents a locker; can select only a unique active officially catalogued one',()=>{
 const p=applyRouteFollowup('ritiro Amazon',start()).parcels;
 assert.equal(p[2].action,'pickup');
 assert.equal(validateParcelSelections(p).index,0,'DHL still unresolved');
 let q=applyRouteFollowup('Melezio',p,[{
  id:'amazon-melezio',name:'Amazon Locker melezio',
  memberships:[{network:'amazon',active:true}]
 }]);
 assert.equal(q.handled,true);
 assert.equal(q.parcels[2].assignedPointId,'amazon-melezio');
 assert.equal(q.parcels.length,3);
});
test('An Amazon reso with its courier is not counted twice',()=>{
 const original=[{network:'amazon',action:'',assignedPointId:null},{network:'brt',action:'dropoff',brtFormat:'digital'}];
 const r=applyRouteFollowup('reso con DHL Express',original);
 assert.equal(r.handled,true);
 assert.deepEqual(r.parcels.map(v=>v.network),['dhl_express','brt']);
 assert.equal(r.parcels[0].action,'return_label');
});
test('Full new requests are not misread as answers to the previous clarification',()=>{
 assert.equal(applyRouteFollowup('Ho 1 pacco DHL Express e 1 BRT',start()).handled,false);
 assert.equal(applyRouteFollowup('Express',[{network:'dhl_express',action:'dropoff'}]).handled,false);
 assert.equal(applyRouteFollowup('Quanto costa un DHL?',start()).handled,false);
});
test('Destination corrections and max stops preserve all parcels and the original request',()=>{
 let result=applyRouteFollowup('palestra',start());
 assert.equal(result.handled,true);assert.equal(result.destination,'palestra');assert.equal(result.parcels.length,3);
 result=applyRouteFollowup('una sosta',result.parcels);
 assert.equal(result.maxStops,1);
 assert.equal(result.parcels[1].brtFormat,'digital');
});
test('Amazon cannot be routed with no action; the QR checkbox has no authority',()=>{
 const p=start();p[0].network='dhl_express';
 assert.equal(validateParcelSelections(p).ok,false);
 assert.match(validateParcelSelections(p).message,/Amazon/);
 const noBox=[{network:'dhl_express',action:'dropoff'},{network:'brt',action:'dropoff',brtFormat:'digital'}];
 assert.equal(validateParcelSelections(noBox).ok,true);
});
test('The UI never renders a mandatory QR confirmation checkbox',()=>{
 const ui=readFileSync(new URL('../src/carrier-ui.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/parcel-confirm|Ho controllato il QR\/etichetta/);
 assert.match(ui,/applyRouteFollowup/);
 assert.match(ui,/parseRouteIntent/);
});
