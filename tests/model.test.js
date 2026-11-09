import {test} from 'node:test';
import assert from 'node:assert/strict';
import {previousStates,eventImportance,category,mergeEvents,filterEvents,histogram,eventAppearance,escapeHTML,conciseEventLabel} from '../custom_components/engelsoft_activity/frontend/model.js';
const events=[{when:1,entity_id:'light.demo',state:'on',context_id:'demo-a'},{when:2,entity_id:'light.demo',state:'off',context_id:'demo-b'},{when:3,entity_id:'sensor.demo',state:'unavailable'}];
const meta=e=>({name:e.entity_id,areaId:e.entity_id.startsWith('light.')?'room_a':'room_b',integration:e.entity_id.split('.')[0]});
const filters={query:'',kind:'all',favorites:[],muted:[],hideMuted:true};
test('stream replay deduplicates within the window',()=>assert.deepEqual(mergeEvents(events,[events[0]],2000,3000).map(e=>e.when),[3,2]));
test('multiple selections union within a filter and intersect across filters',()=>{assert.equal(filterEvents(events,{...filters,domain:['light','sensor'],area:['room_a'],entity:['light.demo','sensor.demo']},meta).length,2);assert.equal(filterEvents(events,{...filters,domain:[],area:[],integration:[],entity:[]},meta).length,3);});
test('muting affects only selected entities and can be disabled',()=>{assert.equal(filterEvents(events,{...filters,muted:['light.demo']},meta).length,1);assert.equal(filterEvents(events,{...filters,muted:['light.demo'],hideMuted:false},meta).length,3);});
test('time focus uses exclusive interval end',()=>assert.deepEqual(histogram(events,0,3000,3).map(b=>b.count),[0,1,1]));
test('connectivity off is offline; ordinary switch off is inactive',()=>{assert.equal(eventAppearance({entity_id:'binary_sensor.demo',state:'off'},{attributes:{device_class:'connectivity'}}).tone,'offline');assert.equal(eventAppearance({entity_id:'switch.demo',state:'off'}).tone,'off');});
test('safety sensors use alert colors',()=>{for(const device_class of ['smoke','gas','moisture','problem','safety','tamper'])assert.equal(eventAppearance({entity_id:'binary_sensor.demo',state:'on'},{attributes:{device_class}}).tone,'alert');});
test('HTML content is escaped',()=>assert.equal(escapeHTML('<script>"demo"</script>'),'&lt;script&gt;&quot;demo&quot;&lt;/script&gt;'));


test('known Shelly button messages use concise labels without changing the source',()=>{for(const [kind,label] of Object.entries({single_push:'Taste kurz gedrückt',double_push:'Taste doppelt gedrückt',triple_push:'Taste dreifach gedrückt',long_push:'Taste lange gedrückt',btn_up:'Taste losgelassen',btn_down:'Taste gedrückt'})){const message="'"+kind+"' click event for example-button Input 0 was fired";const event={message};assert.equal(conciseEventLabel(event,message),label);assert.equal(event.message,message);}assert.equal(conciseEventLabel({message:'Unknown event'},'Unknown event'),'Unknown event');});

test('previous states use full history, ignore messages and ambiguous simultaneous changes',()=>{
 const a={when:1,entity_id:'light.a',state:'off'},b={when:2,entity_id:'light.a',message:'pressed'},c={when:3,entity_id:'light.a',state:'on'},d={when:4,entity_id:'light.a',state:'on'};
 let map=previousStates([d,c,b,a]);assert.equal(map.get(c),'off');assert(!map.has(a));assert(!map.has(b));assert(!map.has(d));
 const x={when:1,entity_id:'light.a',state:'on'};map=previousStates([a,x,c]);assert(!map.has(c));assert(!map.has(x));
});
test('important events include alarms, connection loss and battery percentages, not normal off',()=>{
 const entity=(device_class,unit_of_measurement)=>({attributes:{device_class,unit_of_measurement}});
 assert.equal(eventImportance({entity_id:'switch.a',state:'off'}),'');
 assert.equal(category({entity_id:'binary_sensor.a',state:'on'},entity('smoke')),'attention');
 assert.equal(eventImportance({entity_id:'binary_sensor.a',state:'off'},entity('connectivity')),'Verbindung unterbrochen');
 for(const state of ['0','20'])assert(eventImportance({entity_id:'sensor.a',state},entity('battery','%')));
 for(const state of ['21','-1',''])assert.equal(eventImportance({entity_id:'sensor.a',state},entity('battery','%')),'');
 assert.equal(eventImportance({entity_id:'sensor.a',state:'2.5'},entity('battery','V')),'');
});
