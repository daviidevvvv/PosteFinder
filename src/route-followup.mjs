// One-turn clarification of an existing parcel trip. Pure: no GPS, account state, API calls or storage.
// Only anchored/short clarifications are accepted; full new requests must be parsed independently.
const norm=s=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,"'").replace(/\s+/g,' ').trim();
const CARRIER_CODE={brt:'brt',bartolini:'brt','dhl express':'dhl_express',express:'dhl_express',
'dhl ecommerce':'dhl_ecommerce','dhl e-commerce':'dhl_ecommerce',ecommerce:'dhl_ecommerce',
'dhl':'dhl_unspecified',inpost:'inpost','in post':'inpost',ups:'ups',gls:'gls',poste:'poste','poste italiane':'poste'};
function courier(term){return CARRIER_CODE[norm(term)]||null;}
function change(parcels,index,fields){return parcels.map((p,i)=>i===index?{...p,...fields}:p);}
export function applyRouteFollowup(text,previous,sites=[]){
 if(!Array.isArray(previous)||!previous.length)return {handled:false};
 const t=norm(text).replace(/[.!?]+$/,'');
 if(!t||t.length>105||/\b(?:ho|devo)\s+\d+\s+pacc/.test(t))return {handled:false};
 const ambiguous=previous.findIndex(p=>p.network==='dhl_unspecified');
 const dhl=t.match(/^(?:(?:e|è|si|sì|quello|il|dhl)\s+)*(express|e[\s-]?commerce)$/);
 if(ambiguous>=0&&dhl){
  const network=dhl[1]==='express'?'dhl_express':'dhl_ecommerce';
  return {handled:true,parcels:change(previous,ambiguous,{network}),message:'Pacco '+(ambiguous+1)+': '+(network==='dhl_express'?'DHL Express':'DHL eCommerce')+' impostato. Gli altri pacchi sono rimasti nel giro.'};
 }
 const amazon=previous.findIndex(p=>p.network==='amazon');
 if(amazon>=0){
  const ret=t.match(/^(?:(?:amazon|il pacco amazon|e un|è un|devo fare un)\s+)*(reso|restituzione|ritiro|ritirare)(?:\s+amazon)?(?:\s+(?:con|tramite|via)\s+(.+))?$/);
  if(ret){
   if(ret[1]==='ritiro'||ret[1]==='ritirare')return {handled:true,parcels:change(previous,amazon,{action:'pickup'}),message:'Pacco '+(amazon+1)+' Amazon: ritiro. Seleziona il punto indicato nell’avviso di ritiro: non posso spostarlo in un altro locker.'};
   const raw=ret[2]||'',parts=raw.match(/^(dhl[\s-]*(?:express|e[\s-]?commerce)?|bartolini|brt|in[\s-]?post|poste(?: italiane)?|ups|gls)(?:\s+(digital|qr|stampata))?$/);
   if(parts){
    const network=courier(parts[1].replace(/\s+/g,' ').replace(/dhl-/, 'dhl '));
    if(network){
     const digital=parts[2]==='digital'||parts[2]==='qr';
     return {handled:true,parcels:change(previous,amazon,{network,action:digital?'return_qr':'return_label',brtFormat:network==='brt'?(digital?'digital':parts[2]==='stampata'?'printed':''):undefined,assignedPointId:null}),message:'Pacco '+(amazon+1)+': reso Amazon instradato sulla rete '+(network==='dhl_unspecified'?'DHL (scegli Express/eCommerce)':network)+'. Non è un nuovo quarto pacco.'};
    }
   }
   return {handled:true,parcels:change(previous,amazon,{action:'return_label'}),message:'Pacco '+(amazon+1)+': reso Amazon. Indica ora il corriere e il tipo di reso mostrati dall’app Amazon; non tutti i locker accettano resi.'};
  }
  if(previous[amazon].action==='return_label'||previous[amazon].action==='return_qr'){
   const direct=courier(t);
   if(direct){
    return {handled:true,parcels:change(previous,amazon,{network:direct,assignedPointId:null}),message:'Il reso Amazon (pacco '+(amazon+1)+') utilizzerà '+direct+'. Il totale resta '+previous.length+' pacchi.'};
   }
  }
  // A named locker can only be selected if a single active, officially catalogued Amazon site matches.
  if(previous[amazon].action==='pickup'){
   const candidate=t.replace(/^(?:locker|counter|amazon|punto|il|al|alla|da)\s+/g,'').trim();
   if(candidate.length>=4&&candidate.length<=45&&!/\b(ritiro|reso|spedizione)\b/.test(candidate)){
    const active=sites.filter(s=>s.memberships?.some(m=>m.network==='amazon'&&m.active===true)&&norm(s.name).includes(candidate));
    if(active.length===1){
     return {handled:true,parcels:change(previous,amazon,{assignedPointId:active[0].id}),message:'Ritiro Amazon (pacco '+(amazon+1)+') assegnato a '+active[0].name+'. Verifica che coincida esattamente con il punto nel tuo ordine.'};
    }
   }
  }
 }
 const brt=previous.findIndex(p=>p.network==='brt'&&p.action!=='pickup'&&!p.brtFormat);
 if(brt>=0&&/^(?:brt\s+)?(?:digital|qr|senza stampa|etichetta stampata|stampata|cartaceo)$/.test(t)){
  const digital=/digital|qr|senza stampa/.test(t);
  return {handled:true,parcels:change(previous,brt,{brtFormat:digital?'digital':'printed'}),message:'Pacco '+(brt+1)+' BRT '+(digital?'Digital/QR':'etichetta stampata')+' impostato.'};
 }
 if(/^(?:verso|andando a|vado a|alla|a)?\s*(?:casa|palestra)$/.test(t)){
  const destination=/palestra$/.test(t)?'palestra':'casa';
  return {handled:true,parcels:previous.map(p=>({...p})),destination,message:'Destinazione del giro: '+(destination==='casa'?'Casa':'Palestra')+'. Tutti i '+previous.length+' pacchi sono conservati.'};
 }
 if(/^(?:massimo\s*)?(?:una|1|due|2)\s+(?:sost[ea]|tapp[ea])$/.test(t)){
  const maxStops=/^(?:massimo\s*)?(?:una|1)/.test(t)?1:2;
  return {handled:true,parcels:previous.map(p=>({...p})),maxStops,message:'Impostato un massimo di '+maxStops+' '+(maxStops===1?'sosta':'soste')+'.'};
 }
 return {handled:false};
}
