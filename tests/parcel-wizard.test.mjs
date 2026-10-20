import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_PARCELS,describeParcel,validateParcelSelections,originOptions,defaultOrigin,resolveOrigin} from '../src/parcel-wizard.mjs';

const brt=(format='digital')=>({network:'brt',action:'dropoff',brtFormat:format,labelConfirmed:true});
test('one package with BRT Digital is described explicitly',()=>{
 assert.match(describeParcel(brt()),/BRT.*Digital.*Spedizione/);
 assert.match(describeParcel(brt('printed')),/BRT.*stampata/);
});
test('multiple parcels can mix BRT Digital and Poste without relabeling services',()=>{
 const parcels=[brt(),{network:'poste',action:'return_label',labelConfirmed:true}];
 assert.equal(validateParcelSelections(parcels).ok,true);
 assert.match(describeParcel(parcels[1]),/Poste/);
});
test('QR/label acknowledgement no longer blocks a valid route',()=>{
 const p=validateParcelSelections([{...brt(),labelConfirmed:false}]);
 assert.equal(p.ok,true);
});
test('Amazon requires the actual network on the return',()=>{
 assert.match(validateParcelSelections([{network:'amazon',action:'return_label'}]).message,/corriere/);
});
test('Unknown Amazon parcel asks just reso versus ritiro',()=>{
 const p=validateParcelSelections([brt(),{network:'amazon',action:''}]);
 assert.equal(p.ok,false);assert.equal(p.index,1);assert.match(p.message,/Amazon.*ritiro.*reso/);
});
test('pickup requires the assigned point ID',()=>{
 const p=validateParcelSelections([{network:'brt',action:'pickup'}]);assert.equal(p.ok,false);
 assert.equal(validateParcelSelections([{network:'brt',action:'pickup',assignedPointId:'nexus'}]).ok,true);
});
test('limit 1-4 parcels and show the correct row with error',()=>{
 assert.equal(MAX_PARCELS,4);
 assert.equal(validateParcelSelections([]).ok,false);
 assert.equal(validateParcelSelections(Array(5).fill(brt())).ok,false);
 assert.equal(validateParcelSelections([brt(),{network:'dhl_unspecified',action:'dropoff',labelConfirmed:true}]).index,1);
});
test('default selects GPS only when it has usable coordinates',()=>{
 const state={gps:[41.24,16.5],places:[{id:-101,name:'Casa',coords:[41.23,16.5]}]};
 assert.equal(defaultOrigin(state),'gps');
 assert.deepEqual(resolveOrigin('gps',state),state.gps);
});
test('when GPS is unavailable, default selects saved Casa if mapped',()=>{
 const state={gps:null,places:[{id:6,name:'Palestra',coords:[41.22,16.55]},{id:-101,name:'Casa',coords:[41.23,16.5]}]};
 assert.equal(defaultOrigin(state),'place:-101');
 assert.deepEqual(resolveOrigin('place:6',state),[41.22,16.55]);
});
test('saved location missing coordinates cannot be used as an invented departure',()=>{
 const state={gps:null,places:[{id:5,name:'Palestra',coords:null}]};
 assert.equal(defaultOrigin(state),'gps');
 assert.equal(resolveOrigin('place:5',state),null);
 assert.equal(originOptions(state).find(x=>x.value==='place:5').available,false);
});
test('GPS, saved places and map reference are separate departure options',()=>{
 const state={gps:null,reference:[41.2,16.4],places:[{id:1,name:'Lavoro',coords:[41.22,16.43]},{id:2,name:'Casa',coords:null}]};
 assert.deepEqual(originOptions(state).map(x=>x.value),['gps','place:1','place:2','reference']);
 assert.deepEqual(resolveOrigin('reference',state),[41.2,16.4]);
});
