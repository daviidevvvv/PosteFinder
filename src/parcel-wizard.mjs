// Deterministic, private-data-free helpers for the step-by-step parcel organizer.
// The UI reads saved places from the existing in-memory PosteFinder bridge.
import {ACTIONS,NETWORKS,isBrtDigital,validCoords} from './carrier-planner.mjs';

export const MAX_PARCELS=4;

export function describeParcel(demand){
  const carrier=NETWORKS[demand?.network]||'Corriere da scegliere';
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
    if(!NETWORKS[d.network] || !ACTIONS[d.action]){
      return {ok:false,index:i,message:prefix+'scegli un corriere e un\'operazione.'};
    }
    if(d.network==='amazon'){
      return {ok:false,index:i,message:prefix+'per Amazon scegli il corriere indicato sul QR o nelle istruzioni di reso (non esiste un unico punto resi universale).'};
    }
    if(d.network==='brt' && d.action!=='pickup' &&
       d.action!=='return_qr' && !['digital','printed'].includes(d.brtFormat)){
      return {ok:false,index:i,message:prefix+'scegli BRT Digital / QR oppure etichetta stampata.'};
    }
    if(d.action==='pickup' && !d.assignedPointId){
      return {ok:false,index:i,message:prefix+'se il pacco e gia in consegna devi ritirarlo soltanto nel punto indicato nell\'avviso.'};
    }
    if(d.action!=='pickup' && d.labelConfirmed!==true){
      return {ok:false,index:i,message:prefix+'conferma il QR o l\'etichetta e le istruzioni del venditore prima di cercare.'};
    }
  }
  return {ok:true,index:-1,message:''};
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
