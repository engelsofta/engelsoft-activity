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
// Short labels for known Shelly button events; retain unknown messages verbatim.
export function conciseEventLabel(event, fallback) {
  const message=String(event.message??'');
  const match=message.match(/^['"]?(single_push|double_push|triple_push|long_push|btn_up|btn_down)['"]? click event for .+ was fired\s*$/i);
  if(match)return ({single_push:'Taste kurz gedrückt',double_push:'Taste doppelt gedrückt',triple_push:'Taste dreifach gedrückt',long_push:'Taste lange gedrückt',btn_up:'Taste losgelassen',btn_down:'Taste gedrückt'})[match[1].toLowerCase()];
  return fallback;
}
export function category(e,entity) {
  if (eventImportance(e,entity)) return 'attention';
  if (['automation','script','scene'].includes(domainOf(e))) return 'automation';
  return 'state';
}
const selectedMatch=(selected,value)=>Array.isArray(selected)?!selected.length||selected.includes(value):!selected||selected===value;
export function filterEvents(events, filters, meta) {
  const q=filters.query.trim().toLocaleLowerCase('de');
  return events.filter(e=>{
    const m=meta(e),id=e.entity_id;
    return (!q || `${m.name} ${id||''} ${e.state||''} ${e.message||''} ${m.area} ${m.integration} ${e.context_name||''}`.toLocaleLowerCase('de').includes(q))
      && (!filters.kind || filters.kind==='all' || category(e,m.entity)===filters.kind)
      && selectedMatch(filters.domain,domainOf(e))
      && selectedMatch(filters.area,m.areaId)
      && selectedMatch(filters.integration,m.integration)
      && selectedMatch(filters.entity,id)
      && selectedMatch(filters.cause,m.cause)
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

// Use only recorded states strictly before the event, never the current HA state.
export function previousStates(events){
 const result=new Map(),last=new Map(),ordered=events.filter(e=>e.entity_id&&typeof e.state==='string'&&!e.message&&!['automation','script','scene','event','button','input_button'].includes(domainOf(e))&&Number.isFinite(timestamp(e))).sort((a,b)=>timestamp(a)-timestamp(b));
 for(let i=0;i<ordered.length;){let j=i;while(j<ordered.length&&timestamp(ordered[j])===timestamp(ordered[i]))j++;
  for(let k=i;k<j;k++){const e=ordered[k],prior=last.get(e.entity_id);if(prior!==undefined&&prior!==null&&prior!==e.state)result.set(e,prior);}
  const group=new Map();for(let k=i;k<j;k++){const e=ordered[k];if(!group.has(e.entity_id))group.set(e.entity_id,e.state);else if(group.get(e.entity_id)!==e.state)group.set(e.entity_id,null);}for(const [id,state] of group)last.set(id,state);i=j;
 }return result;
}
export function eventImportance(event,entity){
 const state=String(event.state??'').toLowerCase(),domain=domainOf(event),dc=entity?.attributes?.device_class;
 if(['unavailable','offline','disconnected'].includes(state))return 'Nicht verfügbar';
 if(state==='unknown')return 'Zustand unbekannt';
 if(['triggered','jammed','error','fault','alarm'].includes(state))return 'Alarm / Störung';
 if(domain==='binary_sensor'&&state==='off'&&dc==='connectivity')return 'Verbindung unterbrochen';
 if(domain==='binary_sensor'&&state==='on'&&['smoke','gas','moisture','problem','safety','tamper'].includes(dc))return 'Alarm / Störung';
 if(domain==='binary_sensor'&&state==='on'&&dc==='battery')return 'Batterie niedrig';
 if(domain==='sensor'&&dc==='battery'&&entity?.attributes?.unit_of_measurement==='%'&&state.trim()!==''&&Number.isFinite(Number(state))&&Number(state)>=0&&Number(state)<=20)return 'Batterie niedrig (≤ 20 %)';
 return '';
}

// The cause belongs to the event context, not to the affected entity's integration.
export function eventCause(event, people) {
  const type = event.context_event_type;
  if (type === 'automation_triggered') return 'automation';
  if (type === 'script_started') return 'script';
  if (event.context_user_id) {
    return people.has(event.context_user_id) ? 'person:' + event.context_user_id : 'integration';
  }
  if (type === 'call_service' || event.context_state !== undefined) return 'other';
  return event.context_name ? 'integration' : 'other';
}

export function eventTrace(event) {
  const {domain, item_id, run_id} = event;
  if (!['automation', 'script'].includes(domain) || !item_id || !run_id) return undefined;
  return {domain, item_id, run_id};
}

export function traceUrl({domain, item_id, run_id}) {
  return '/config/' + domain + '/trace/' + encodeURIComponent(item_id) + '?run_id=' + encodeURIComponent(run_id);
}
