// Local, deterministic extraction of multi-parcel trip requests from "Chiedi all'AI".
// It never authorizes a shipment, chooses an Amazon return carrier, or invents an assigned pickup.
const CARRIERS=/\b(dhl(?:[\s-]*(?:express|e[\s-]*commerce))?|bartolini|brt|in[\s-]*post|ups|gls|poste(?:[\s-]+italiane)?|amazon)\b/gi;
const NAMES={uno:1,una:1,un:1,due:2,tre:3,quattro:4};
const normal=s=>String(s??'').toLowerCase().replace(/[’‘]/g,"'").normalize('NFD').replace(/[\u0300-\u036f]/g,'');
function networkOf(term){
 const t=normal(term).replace(/[\s-]/g,'');
 if(t.startsWith('dhl'))return /ecommerce/.test(t)?'dhl_ecommerce':/express/.test(t)?'dhl_express':'dhl_unspecified';
 if(t==='bartolini'||t==='brt')return 'brt';
 if(t==='inpost')return 'inpost';
 if(t.startsWith('poste'))return 'poste';
 return t;
}
function countBefore(fragment){
 const m=normal(fragment).slice(-65).match(/(?:^|[\s,;:])([1-9]|uno|una|un|due|tre|quattro)\s*(?:pacch[oi]|coll[oi]|spedizion[ei]|resi?|ritiri?)?\s*(?:con|per)?\s*$/);
 return m?(Number(m[1])||NAMES[m[1]]||1):1;
}
function actionAround(before,after){
 const local=normal(before.slice(-65)+' '+after.slice(0,55));
 if(/\bres[oi]\b|\brestitui|\brestituzion/.test(local))return 'return_label';
 if(/\britir|\britir[oi]\b|\brecupera/.test(local))return 'pickup';
 if(/\bsped|\bconsegn|\bportar|\bdeposit|\blasc/.test(local))return 'dropoff';
 return null;
}
export function parseRouteIntent(text){
 const t=normal(text),hits=[...t.matchAll(CARRIERS)].map(m=>({term:m[0],start:m.index,end:m.index+m[0].length,network:networkOf(m[0])}));
 const hasParcelWords=/\bpacc|\bsped|\bconsegn|\britir|\bres[oi]\b|\brestitui|\bdevo\b|\bho\b/.test(t);
 const tripWords=/\bdove\b|\bgiro\b|\bsost[ea]\b|\btapp[ea]\b|\bpercorso\b|\btragitto\b|\bstrada\b|\bvicin|\bottimiz|\bpassand|\bverso\b|\bda (?:qui|qua)\b|\bcasa\b|\bpalestra\b|\bin (?:una|1) (?:botta|colpo)\b/.test(t);
 const recognized=hits.length>0&&(tripWords||hasParcelWords&&hits.length>1||hasParcelWords&&!/\b(?:cos.e|significa|differenza|quanto costa)\b/.test(t));
 if(!recognized)return {recognized:false,parcels:[],issues:[]};
 const parcels=[],issues=[];
 const genericAction=actionAround(t.slice(0,hits[0].start),'');
 for(let i=0;i<hits.length;i++){
  const hit=hits[i],before=t.slice(i?hits[i-1].end:0,hit.start);
  const after=t.slice(hit.end,i+1<hits.length?hits[i+1].start:t.length);
  const count=countBefore(before);
  const net=hit.network;
  // 'Reso Amazon con DHL': Amazon is the merchant, not an extra carrier stop.
  if(net==='amazon'&&i+1<hits.length&&/^\s*(?:con|tramite|via)\s*$/.test(after)&&/\bres[oi]\b|\brestitui/.test(before))continue;
  const localAction=actionAround(before,after)||genericAction;
  const printed=/\bcartace|\bstampat|\bnon[\s-]?digital|\betichetta fisica/.test(normal(before.slice(-22)+' '+after));
  const digital=/\bdigital\b|\bqr\b|\bsenza stampa/.test(normal(before.slice(-22)+' '+after));
  const brtFormat=net==='brt'?(printed?'printed':digital?'digital':''):undefined;
  let action=localAction||'dropoff';
  if(net==='brt'&&action==='return_label'&&digital&&!printed)action='return_qr';
  if(net==='amazon'){
   // Keep unspecified Amazon items unresolved, never invent a pickup or return carrier.
   action=localAction==='pickup'?'pickup':localAction==='return_label'?'return_label':'';
   if(!action)issues.push('Amazon: è un ritiro o un reso? Per il reso indica la rete prevista da Amazon; per il ritiro il Locker/Counter assegnato.');
  }
  if(net==='dhl_unspecified')issues.push('DHL: scegli Express oppure eCommerce come riportato sull’etichetta.');
  if(net==='brt'&&!brtFormat&&action!=='pickup')issues.push('BRT: specifica Digital / QR oppure etichetta stampata.');
  for(let n=0;n<count;n++){
   parcels.push({network:net,action,brtFormat,assignedPointId:null});
  }
 }
 if(parcels.length>4)issues.push('Puoi organizzare al massimo quattro pacchi in un giro.');
 const origin=/\bda(?:lla)?\s+palestra\b/.test(t)?'palestra':/\bda\s+casa\b/.test(t)?'casa':'gps';
 let destination=null;
 if(/\bcasa\s*(?:o|oppure|\/)\s*(?:la\s+)?palestra\b|\bpalestra\s*(?:o|oppure|\/)\s*casa\b/.test(t))destination='choose';
 else if(/\b(?:verso|a|alla|in|fino a|per|rientr\w* a|torn\w* a)\s+(?:la\s+)?palestra\b/.test(t))destination='palestra';
 else if(/\b(?:verso|a|fino a|per|rientr\w* a|torn\w* a)\s+casa\b|\btorno a casa\b/.test(t))destination='casa';
 const onlyOne=/\b(?:una|1)\s+(?:sola\s+)?(?:sosta|tappa)\b|\bin (?:una|1) (?:botta|colpo)\b/.test(t)&&!/\b(?:due|2)\s+(?:sost[ea]|tapp[ea])\b|\b(?:max|massimo|piu)\s*(?:due|2)\b/.test(t);
 const maxStops=onlyOne?1:2;
 return {recognized:true,parcels,issues,origin,destination,maxStops,explicitAction:Boolean(genericAction),sourceText:String(text),needsReview:issues.length>0||parcels.some(d=>!d.action||d.action==='pickup'&&!d.assignedPointId)};
}
