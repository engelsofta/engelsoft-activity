export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const timestamp = e => typeof e.when === 'number' ? e.when * 1000 : Date.parse(e.when);
export const eventKey = e => JSON.stringify([e.when,e.entity_id,e.context_id,e.state,e.message,e.domain,e.run_id]);
export function mergeEvents(existing, incoming, start, end) {
  const map = new Map();
  for (const e of [...existing,...incoming]) {
    const t = timestamp(e);
    if (Number.isFinite(t) && t >= start && t <= end) map.set(eventKey(e),e);
  }
  return [...map.values()].sort((a,b)=>timestamp(b)-timestamp(a));
}
export const domainOf = e => e.entity_id?.split('.')[0] || e.domain || 'event';
export function category(e) {
  if (['unavailable','unknown'].includes(e.state)) return 'attention';
  if (['automation','script','scene'].includes(domainOf(e))) return 'automation';
  return 'state';
}
const selectedMatch=(selected,value)=>Array.isArray(selected)?!selected.length||selected.includes(value):!selected||selected===value;
export function filterEvents(events, filters, meta) {
  const q=filters.query.trim().toLocaleLowerCase('de');
  return events.filter(e=>{
    const m=meta(e),id=e.entity_id;
    return (!q || `${m.name} ${id||''} ${e.state||''} ${e.message||''} ${m.area} ${m.integration} ${e.context_name||''}`.toLocaleLowerCase('de').includes(q))
      && (!filters.kind || filters.kind==='all' || category(e)===filters.kind)
      && selectedMatch(filters.domain,domainOf(e))
      && selectedMatch(filters.area,m.areaId)
      && selectedMatch(filters.integration,m.integration)
      && selectedMatch(filters.entity,id)
      && (!filters.favoritesOnly || filters.favorites.includes(id))
      && (!filters.hideMuted || !filters.muted.includes(id))
      && (!filters.bucket || (timestamp(e)>=filters.bucket[0]&&timestamp(e)<filters.bucket[1]));
  });
}
export function histogram(events,start,end,bins=36) {
  const width=(end-start)/bins,counts=Array(bins).fill(0);
  for(const e of events){const i=Math.floor((timestamp(e)-start)/width);if(i>=0&&i<bins)counts[i]++;}
  return counts.map((count,i)=>({count,start:start+i*width,end:start+(i+1)*width}));
}
export function topEntities(events,meta) {
  const counts=new Map();
  for(const e of events)if(e.entity_id){const item=counts.get(e.entity_id)||{id:e.entity_id,name:meta(e).name,count:0};item.count++;counts.set(e.entity_id,item);}
  return [...counts.values()].sort((a,b)=>b.count-a.count);
}

/** Interpret the historical event state using static device-class semantics. */
export function eventAppearance(event, entity) {
  const state=String(event.state??'').toLowerCase(),domain=domainOf(event),deviceClass=entity?.attributes?.device_class;
  const appearance=(tone,icon)=>({tone,icon});
  if(state==='unavailable'||state==='offline'||state==='disconnected')return appearance('offline','mdi:lan-disconnect');
  if(state==='unknown')return appearance('unknown','mdi:help-circle-outline');
  if(state==='online'||state==='connected')return appearance('online','mdi:lan-connect');
  if(domain==='binary_sensor'&&['on','off'].includes(state)){
    if(deviceClass==='connectivity')return state==='on'?appearance('online','mdi:lan-connect'):state==='off'?appearance('offline','mdi:lan-disconnect'):appearance('neutral','mdi:information-outline');
    if(['smoke','gas','moisture','problem','safety','tamper'].includes(deviceClass))return state==='on'?appearance('alert','mdi:alert-circle-outline'):state==='off'?appearance('off','mdi:shield-check-outline'):appearance('neutral','mdi:information-outline');
    if(deviceClass==='battery')return state==='on'?appearance('unknown','mdi:battery-alert-variant-outline'):appearance('off','mdi:battery-check-outline');
    if(['door','window','opening','garage_door'].includes(deviceClass))return state==='on'?appearance('open','mdi:door-open'):appearance('off','mdi:door-closed');
    if(['motion','occupancy','presence'].includes(deviceClass))return state==='on'?appearance('on','mdi:account-check-outline'):appearance('off','mdi:account-off-outline');
  }
  if(['automation','script','scene'].includes(domain))return appearance('automation','mdi:play-circle-outline');
  if(state==='on')return domain==='light'?appearance('light','mdi:lightbulb-on-outline'):appearance('on','mdi:power');
  if(state==='off')return appearance('off','mdi:power-standby');
  if(['home','detected','occupied'].includes(state))return appearance('on','mdi:account-check-outline');
  if(['not_home','clear','unoccupied'].includes(state))return appearance('off','mdi:account-off-outline');
  if(state==='open'||state==='opening')return appearance('open','mdi:arrow-expand-horizontal');
  if(state==='closed'||state==='closing')return appearance('off','mdi:arrow-collapse-horizontal');
  if(state==='locked')return appearance('online','mdi:lock-outline');
  if(state==='unlocked')return appearance('unknown','mdi:lock-open-outline');
  if(['triggered','jammed','error','fault','alarm'].includes(state))return appearance('alert','mdi:alert-circle-outline');
  return appearance('neutral','mdi:swap-horizontal');
}
