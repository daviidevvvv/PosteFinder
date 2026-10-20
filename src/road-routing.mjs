// Optional road-time refinement after an explicit button click.
// OSRM is an external routing provider. Never call it implicitly from geolocation or chat parsing.
// The initial ranking always remains available as a geometry-only fallback.
import {validCoords} from './carrier-planner.mjs';
export const ROUTING_ENDPOINT='https://router.project-osrm.org';

export function buildRoadTableUrl(coords,endpoint=ROUTING_ENDPOINT){
 if(!Array.isArray(coords)||coords.length<2||coords.length>25||!coords.every(validCoords))throw new Error('Coordinate routing non valide');
 if(!/^https:\/\//.test(endpoint))throw new Error('Routing endpoint deve usare HTTPS');
 return endpoint.replace(/\/+$/,'')+'/table/v1/driving/'+coords.map(([lat,lon])=>lon+','+lat).join(';')+'?annotations=duration,distance';
}
export function scoreRoadPlans(plans,origin,destination,matrix){
 if(!Array.isArray(plans)||!validCoords(origin)||destination!==null&&!validCoords(destination))throw new Error('Itinerario routing non valido');
 const sites=new Map();
 for(const plan of plans)for(const site of plan.stops||[])sites.set(site.id,site);
 const stops=[...sites.values()];
 const coords=[origin,...stops.map(s=>s.coords),...(destination?[destination]:[])];
 const n=coords.length;
 for(const key of ['durations','distances']){
  if(!Array.isArray(matrix?.[key])||matrix[key].length!==n||
     matrix[key].some(row=>!Array.isArray(row)||row.length!==n))throw new Error('Matrice stradale incompleta: '+key);
 }
 const byId=new Map(stops.map((s,i)=>[s.id,i+1]));
 const directIndex=destination?n-1:null;
 const road=[];
 for(const plan of plans){
  let prev=0,distance=0,duration=0,valid=true;
  const indices=[...(plan.stops||[]).map(s=>byId.get(s.id)),...(destination?[directIndex]:[])];
  for(const to of indices){
   const d=matrix.distances[prev]?.[to],t=matrix.durations[prev]?.[to];
   if(!Number.isFinite(d)||d<0||!Number.isFinite(t)||t<0){valid=false;break;}
   distance+=d;duration+=t;prev=to;
  }
  if(!valid)continue;
  const directDistance=destination?matrix.distances[0]?.[directIndex]:null;
  road.push({...plan,roadDistanceMetres:Math.round(distance),roadDurationSeconds:Math.round(duration),
   roadExtraMetres:destination&&Number.isFinite(directDistance)?Math.max(0,Math.round(distance-directDistance)):null});
 }
 return road.sort((a,b)=>a.stops.length-b.stops.length||a.roadDurationSeconds-b.roadDurationSeconds||a.roadDistanceMetres-b.roadDistanceMetres);
}
export async function rankRoadPlans(plans,{origin,destination=null,fetchImpl=fetch,endpoint=ROUTING_ENDPOINT,signal}={}){
 if(!Array.isArray(plans)||!plans.length)throw new Error('Nessun percorso da confrontare');
 const sites=new Map();
 for(const plan of plans)for(const site of plan.stops||[])sites.set(site.id,site);
 const coords=[origin,...[...sites.values()].map(s=>s.coords),...(destination?[destination]:[])];
 const url=buildRoadTableUrl(coords,endpoint);
 const response=await fetchImpl(url,{method:'GET',mode:'cors',headers:{Accept:'application/json'},signal});
 if(!response?.ok)throw new Error('Servizio stradale non disponibile (HTTP '+(response?.status||'?')+')');
 const body=await response.json();
 if(body?.code!=='Ok')throw new Error('Servizio stradale: '+(body?.message||body?.code||'risposta non valida'));
 const sorted=scoreRoadPlans(plans,origin,destination,body);
 if(!sorted.length)throw new Error('Nessun percorso stradale praticabile trovato');
 return {plans:sorted,provider:'OSRM/OpenStreetMap',metric:'driving_time_estimate',estimated:true};
}
