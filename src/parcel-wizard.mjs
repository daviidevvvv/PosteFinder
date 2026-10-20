// Deterministic, private-data-free helpers for the step-by-step parcel organizer.
// The UI reads saved places from the existing in-memory PosteFinder bridge.
import {ACTIONS,NETWORKS,isBrtDigital,validCoords} from './carrier-planner.mjs';

export const MAX_PARCELS=4;

export function describeParcel(demand){
  const carrier=demand?.network==='amazon'&&demand?.action!=='pickup'?'Amazon (rete di consegna da verificare)':NETWORKS[demand?.network]||'Corriere da scegliere';
  if(demand?.action==='pickup')return carrier+' · Ritiro nel punto assegnato';
  const mode=demand?.network==='brt'
    ? (isBrtDigital(demand)?' · Digital / QR':' · Etichetta stampata')
    : '';
  return carrier+mode+' · '+(ACTIONS[demand?.action]||'Operazione da scegliere');
}

export function validateParcelSelections(demands){
  if(!Array.isArray(demands)||demands.length<1||demands.length>MAX_PARCELS){
    return {ok:false,index:-1,message:'Aggiungi da 1 a '+MAX_PARCELS+' pacchi.'};
  }
  for(let i=0;i<demands.length;i++){
    const d=demands[i],prefix='Pacco '+(i+1)+': ';
    if(d.network==='dhl_unspecified')return {ok:false,index:i,message:prefix+'DHL Express oppure DHL eCommerce? Basta indicarlo.'};
    if(!NETWORKS[d.network] || !ACTIONS[d.action]){
      return {ok:false,index:i,message:prefix+'scegli il corriere e il tipo di operazione.'};
    }
    if(d.network==='brt' && d.action!=='pickup' &&
       d.action!=='return_qr' && d.brtFormat!=null && !['digital','printed'].includes(d.brtFormat)){
      return {ok:false,index:i,message:prefix+'tipo BRT non riconosciuto.'};
    }
    if(d.action==='pickup' && !d.assignedPointId){
      return {ok:false,index:i,message:prefix+'se il pacco e gia in consegna devi ritirarlo soltanto nel punto indicato nell\'avviso.'};
    }
  }
  return {ok:true,index:-1,message:''};
}


// Amazon is a marketplace label, not proof that an arbitrary Hub accepts outbound parcels.
// Provide a usable route for verified carriers, keeping unknown Amazon handoffs visible
// and explicitly unassigned rather than claiming a fully completed multi-parcel trip.
export function routeDemandPartition(demands){
  const plannable=[],pending=[];
  for(const [index,d] of (Array.isArray(demands)?demands:[]).entries()){
    if(d.network==='amazon'&&d.action!=='pickup'){
      pending.push({index,demand:d,reason:'Il catalogo Amazon Hub attesta il ritiro ordini, non il conferimento universale dei pacchi. Per includere questo pacco serve la rete o il punto autorizzato dalle istruzioni Amazon.'});
    }else{
      plannable.push({index,demand:d});
    }
  }
  return {plannable:plannable.map(p=>p.demand),coveredIndexes:plannable.map(p=>p.index),pending};
}

export function originOptions(state){
  const result=[{value:'gps',label:'Posizione attuale (GPS)',available:validCoords(state?.gps),kind:'gps'}];
  for(const place of state?.places||[]){
    if(place?.id==null)continue;
    result.push({
      value:'place:'+place.id,
      label:String(place.name||'Luogo salvato'),
      available:validCoords(place.coords),
      kind:'place'
    });
  }
  if(validCoords(state?.reference))result.push({
    value:'reference',label:'Punto selezionato sulla mappa',available:true,kind:'reference'
  });
  return result;
}

export function defaultOrigin(state){
  const options=originOptions(state);
  if(options[0]?.available)return options[0].value;
  const home=options.find(p=>p.kind==='place'&&p.label.toLowerCase()==='casa'&&p.available);
  return home?.value || options.find(p=>p.available)?.value || 'gps';
}

export function resolveOrigin(value,state){
  if(value==='gps')return validCoords(state?.gps)?state.gps:null;
  if(value==='reference')return validCoords(state?.reference)?state.reference:null;
  if(typeof value==='string'&&value.startsWith('place:')){
    const selected=(state?.places||[]).find(p=>String(p.id)===value.slice(6));
    return validCoords(selected?.coords)?selected.coords:null;
  }
  return null;
}
