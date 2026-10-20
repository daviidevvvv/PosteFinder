// Deterministic normalization. Never refresh observation dates merely because of a build.
const DAYS=['mon','tue','wed','thu','fri','sat','sun'];
export function unpackHours(value){
 const out={};
 for(const group of String(value).split(';')){
  const [dayList,ranges]=group.split('=');
  if(ranges===undefined)throw new Error('Invalid encoded schedule');
  const intervals=ranges?ranges.split('/').map(r=>r.split('-').map(Number)):[];
  for(const day of dayList.split(',')){
   if(!DAYS.includes(day)||Object.hasOwn(out,day))throw new Error('Duplicate/invalid weekday');
   out[day]=intervals.map(p=>[...p]);
  }
 }
 if(DAYS.some(day=>!Object.hasOwn(out,day)))throw new Error('Incomplete week');
 return out;
}
export function makeCatalog(input){
 const {networkDefaults,physicalSites,observations,...meta}=input;
 const sites=physicalSites.map(s=>({...s,memberships:[]}));const byId=new Map(sites.map(s=>[s.id,s]));
 const networkIds=new Set();
 for(const observation of observations){
  const {site,hoursPacked,...record}=observation, defaults=networkDefaults[record.network];
  if(!defaults||!byId.has(site))throw new Error('Unknown network or physical site');
  const compound=record.network+':'+record.pointId;if(networkIds.has(compound))throw new Error('Duplicate carrier point');networkIds.add(compound);
  const {defaultSourceUrl,...fields}=defaults;
  const services={...fields.services,...record.serviceOverrides};
  const verificationStatus=record.verificationStatus||'verified';
  if(!['verified','pending_recheck'].includes(verificationStatus))throw new Error('Unknown verification status '+verificationStatus);
  if(record.network==='dhl_express'&&record.providerCapabilities?.shipmentDropOffAndCollection===false)services.pickup='unknown';
  byId.get(site).memberships.push({...fields,sourceUrl:defaultSourceUrl,...record,closedDates:fields.closedDates||[],services,hours:unpackHours(hoursPacked),observedAt:record.observedAt||meta.observedAt,sourceUpdatedAt:null,evidence:'official',active:verificationStatus==='verified'});
 }
 return {...meta,sites};
}
