const {chromium}=require('playwright');
const fs=require('node:fs'),http=require('node:http'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../custom_components/engelsoft_activity/frontend');
const server=http.createServer((req,res)=>{if(req.url==='/'){res.setHeader('Content-Type','text/html');return res.end('<style>body{margin:0}</style><script type="module" src="/panel.js"></script><engelsoft-activity-panel></engelsoft-activity-panel>');}const file=path.resolve(root,'.'+req.url.split('?')[0]);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return res.writeHead(404).end();res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/css');res.end(fs.readFileSync(file));});

async function checkChart(page, panel) {
  const rail = panel.locator('.floor-rail');
  const badge = rail.locator('.chart-count');
  assert.equal(await rail.locator('button').count(), 2);
  assert.equal(await rail.locator('[data-action="favorites"], [data-value="automation"], [data-value="attention"]').count(), 0);
  assert.equal(await panel.locator('.filter-bottom [data-action="favorites"]').count(), 1);
  assert.equal(await badge.textContent(), '1', 'saved selection appears before opening Charts');
  assert.equal(await page.evaluate(() => demo.requests.some(request => request.type === 'history/history_during_period')), false);
  await panel.locator('.metrics [data-value="attention"]').click();
  assert.equal(await panel.evaluate(el => el.filters.kind), 'attention');
  await panel.locator('.automation-metric').click();
  assert.equal(await panel.locator('.automation-metric').getAttribute('aria-pressed'), 'true');
  assert.equal(await panel.evaluate(el => el.filters.kind), 'automation');
  await rail.locator('[data-value="all"]').click();
  await panel.evaluate(el => {
    const original = el.hass.callWS;
    el.hass = {
      ...el.hass,
      states: {
        ...el.hass.states,
        'sensor.demo_temperature': { attributes: { friendly_name: 'Demo Temperature', unit_of_measurement: '°C' } },
        'sensor.demo_power': { attributes: { friendly_name: 'Demo Power', unit_of_measurement: 'W' } },
      },
      callWS: async request => {
        if (request.type !== 'history/history_during_period') return original(request);
        demo.chartRequests = (demo.chartRequests || 0) + 1;
        const start = Date.parse(request.start_time) / 1000;
        const span = Date.parse(request.end_time) / 1000 - start;
        return Object.fromEntries(request.entity_ids.map(id => [id, [
          { s: id.startsWith('sensor.') ? '20' : 'off', lu: start },
          { s: 'unavailable', lu: start + span / 4 },
          { s: id.startsWith('sensor.') ? '23.5' : 'on', lu: start + span / 2 },
        ]]));
      },
    };
    el.selected = null;
    el.events = [{ when: (Date.now() - 60 * 60 * 1000) / 1000, entity_id: 'switch.demo', state: 'on' }];
    el.render();
  });
  await rail.locator('.chart-nav').click();
  assert.equal(await rail.locator('.chart-nav').getAttribute('aria-pressed'), 'true');
  await rail.locator('[data-value="all"]').click();
  await panel.locator('[data-action="chart-event"]').click();
  const chart = panel.locator('engelsoft-activity-history');
  assert.equal(await chart.locator('.toolbar .picker summary').textContent(), 'Entität hinzufügen');
  assert.equal(await chart.locator('.hero').count(), 0);
  await chart.locator('.marker-track button').waitFor();
  assert.equal(await chart.locator('.state-graph').count(), 1);
  const stateHeight = () => chart.locator('.state-graph [data-plot]').evaluate(el => el.getBoundingClientRect().height);
  const singleEntityHeight = await stateHeight();
  assert.equal(await chart.locator('.events li').count(), 1);

  await chart.locator('.picker summary').click();
  await chart.locator('[data-entity-search]').fill('temperature');
  await chart.locator('[data-chart="add"]').click();
  await chart.locator('[data-entity-search]').fill('demo_power');
  await chart.locator('[data-chart="add"]').click();
  await chart.locator('.picker summary').click();
  assert.equal(await badge.textContent(), '3');
  await chart.locator('.curve').nth(1).waitFor();
  assert.equal(await stateHeight(), singleEntityHeight);
  assert.deepEqual(await chart.locator('.graph h3').allTextContents(), ['Demo Temperature', 'Demo Power', 'Demo Switch']);
  assert.equal(await chart.locator('.time-axis').count(), 0);
  assert.equal(await chart.locator('.tool-group').count(), 3);
  assert(await chart.locator('.toolbar .tool ha-icon').first().evaluate(el => el.getBoundingClientRect().width >= 20));
  assert.equal((await chart.locator('.curve').first().getAttribute('d')).match(/M/g).length, 2);
  await chart.locator('[data-cursor]').press('End');
  assert.equal(await chart.locator('[data-reading="sensor.demo_temperature"]').textContent(), '23,5 °C');

  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 });
    assert(await panel.locator('main').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert(await chart.locator('.history').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
    assert(await chart.locator('.series').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect();
      const first = cards[0].getBoundingClientRect();
      const remove = card.querySelector('.remove').getBoundingClientRect();
      return Math.abs(bounds.width - first.width) < 1 && Math.abs(bounds.height - first.height) < 1 &&
        bounds.right - remove.right < 12 && remove.right < bounds.right && remove.top > bounds.top;
    })));
    const plots = await chart.locator('.graph').evaluateAll(graphs =>
      graphs.map(graph => graph.getBoundingClientRect().toJSON()));
    for (let index = 1; index < plots.length; index++) {
      assert.equal(plots[index].left, plots[0].left);
      assert.equal(plots[index].width, plots[0].width);
      assert(plots[index].top - plots[index - 1].bottom >= 24);
    }
  }
  await chart.locator('[data-chart="in"]').click();
  await chart.locator('.curve').first().waitFor();
  assert.equal(await chart.evaluate(el => el.hours), 12);
  const plot = chart.locator('[data-plot]').first();
  const gesture = await plot.evaluate(el => {
    const chart = el.getRootNode().host;
    const box = el.getBoundingClientRect();
    const clientX = Math.round(box.left + box.width / 3);
    const fraction = (clientX - box.left) / box.width;
    const time = chart.start + fraction * (chart.end - chart.start);
    const wheel = ctrlKey => el.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, composed: true, cancelable: true, clientX, ctrlKey, deltaY: -100,
    }));
    return { fraction, time, normal: wheel(false), zoom: wheel(true), second: wheel(true), requests: demo.chartRequests };
  });
  assert.equal(gesture.normal, true, 'ordinary wheel events are left alone');
  assert.equal(gesture.zoom, false, 'Ctrl+wheel prevents browser zoom over the plot');
  assert.equal(gesture.second, false);
  await page.waitForFunction(() => {
    const chart = document.querySelector('engelsoft-activity-panel').shadowRoot.querySelector('engelsoft-activity-history');
    return !chart.loading && chart.end - chart.start < 12 * 3600000;
  });
  assert.equal(await page.evaluate(() => demo.chartRequests), gesture.requests + 1);
  assert(await chart.evaluate((el, { fraction, time }) =>
    Math.abs(el.start + fraction * (el.end - el.start) - time) < 5, gesture));
  await chart.locator('.cursor-control').hover();
  await page.evaluate(() => {
    demo.wheelInput = new Promise(resolve => {
      document.addEventListener('wheel', event => resolve({
        trusted: event.isTrusted, cancelable: event.cancelable, cancelled: event.defaultPrevented, ctrl: event.ctrlKey,
      }), { once: true });
    });
  });
  const scale = await page.evaluate(() => devicePixelRatio);
  const hours = await chart.evaluate(el => el.hours);
  await page.keyboard.down('Control');
  try {
    await page.mouse.wheel(0, -100);
  } finally {
    await page.keyboard.up('Control');
  }
  assert.deepEqual(await page.evaluate(() => demo.wheelInput), {
    trusted: true, cancelable: true, cancelled: true, ctrl: true,
  });
  await page.waitForFunction(hours => {
    const chart = document.querySelector('engelsoft-activity-panel').shadowRoot.querySelector('engelsoft-activity-history');
    return !chart.loading && chart.end - chart.start < hours * 3600000 * .99;
  }, hours);
  assert.equal(await page.evaluate(() => devicePixelRatio), scale);
  await chart.evaluate(el => {
    el.markers[0].time = el.end - (el.end - el.start) * .1;
    el.render();
  });
  assert.equal(await chart.locator('.marker-track button').count(), 1);
  const plotLayout = () => chart.locator('.graphs').evaluate(el => {
    const bounds = el.getBoundingClientRect();
    return { height: bounds.height, top: el.querySelector('[data-plot]').getBoundingClientRect().top - bounds.top };
  });
  const layoutBeforePan = await plotLayout();
  const beforePan = await chart.evaluate(el => ({ start: el.start, end: el.end, requests: demo.chartRequests }));
  await plot.scrollIntoViewIfNeeded();
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
  assert(await chart.locator('.graphs').evaluate(el => parseFloat(el.style.getPropertyValue('--pan-offset')) > 0));
  assert.equal(await page.evaluate(() => demo.chartRequests), beforePan.requests, 'fetch after releasing the mouse');
  await page.mouse.up();
  await page.waitForFunction(end => {
    const chart = document.querySelector('engelsoft-activity-panel').shadowRoot.querySelector('engelsoft-activity-history');
    return !chart.loading && chart.end < end;
  }, beforePan.end);
  const afterPan = await chart.evaluate(el => ({ start: el.start, end: el.end, requests: demo.chartRequests }));
  const span = beforePan.end - beforePan.start;
  assert(Math.abs((beforePan.end - afterPan.end) / span - .25) < .02);
  assert(Math.abs(afterPan.end - afterPan.start - span) < 5);
  assert.equal(afterPan.requests, beforePan.requests + 1);
  assert.equal(await chart.locator('.marker-track button').count(), 0);
  assert.deepEqual(await plotLayout(), layoutBeforePan);
  const [download] = await Promise.all([page.waitForEvent('download'), chart.locator('[data-chart="export"]').click()]);
  assert.equal(download.suggestedFilename(), 'engelsoft-activity-verlauf.csv');

  await rail.locator('[data-value="all"]').click();
  await panel.locator('[data-action="chart-event"]').click();
  assert.equal(await chart.locator('.events li').count(), 1, 'the same event is pinned only once');
  assert.equal(await chart.locator('.series').count(), 3);
  const numericHeight = () => chart.locator('.graph:not(.state-graph) [data-plot]').first()
    .evaluate(el => el.getBoundingClientRect().height);
  const baseline = await numericHeight();
  await chart.evaluate(el => {
    el.hass.states['sensor.demo_power'].attributes.unit_of_measurement = '°C';
    el.render();
  });
  assert(Math.abs(await numericHeight() / baseline - 1.1) < .01);
  assert.equal(await stateHeight(), singleEntityHeight);
  await chart.locator('[data-chart="toggle"][data-entity="sensor.demo_power"]').click();
  assert.equal(await numericHeight(), baseline);
  assert.equal(await stateHeight(), singleEntityHeight);
  assert.equal(await badge.textContent(), '3', 'hiding a curve preserves its selection');
  await chart.locator('[data-chart="remove"][data-entity="sensor.demo_temperature"]').click();
  assert.equal(await chart.locator('.series').count(), 2);
  assert.equal(await badge.textContent(), '2');
  await chart.locator('[data-chart="forget"]').click();
  assert.equal(await chart.locator('.events li').count(), 0);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('engelsoft-activity-chart:demo-user')));
  assert.deepEqual(saved.ids, ['switch.demo', 'sensor.demo_power']);
  assert.deepEqual(saved.hidden, ['sensor.demo_power']);
  console.log('Chart checks passed: pinning, search, scales, gaps, keyboard cursor, responsive layout, zoom, CSV and preferences.');
}
(async()=>{await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{})});try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>customElements.get('engelsoft-activity-panel'));
await page.evaluate(()=>{localStorage.setItem('engelsoft-activity-chart:demo-user',JSON.stringify({ids:['switch.demo']}));const now=Date.now();window.demo={subscriptions:0,unsubscribed:0,requests:[]};const events=Array.from({length:40},(_,i)=>({when:(now-1000-i*180000)/1000,entity_id:i%2?'light.demo':'switch.demo',name:i%2?'Demo Light':'Demo Switch',state:i%3?'on':'off'}));const connection=new EventTarget();connection.subscribeMessage=async(callback,params)=>{demo.subscriptions++;demo.callback=callback;callback({events:[events[0]],partial:true});return ()=>demo.unsubscribed++;};const panel=document.querySelector('engelsoft-activity-panel');panel.hass={states:{'light.demo':{attributes:{friendly_name:'Demo Light'}},'switch.demo':{attributes:{friendly_name:'Demo Switch'}}},themes:{darkMode:true},config:{time_zone:'Europe/Berlin'},user:{id:'demo-user'},connection,callWS:async params=>{demo.requests.push(params);if(params.type==='logbook/get_events'){if(!demo.resolveHistory)return new Promise(resolve=>demo.resolveHistory=()=>resolve(events));return events;}if(params.type==='config/area_registry/list')return [{area_id:'room_a',name:'Demo Room A'},{area_id:'room_b',name:'Demo Room B'}];return [];}};});
const panel=page.locator('engelsoft-activity-panel');await panel.locator('.event-row').first().waitFor();assert(await panel.evaluate(el=>el.loading));await page.evaluate(()=>demo.resolveHistory());await page.waitForFunction(()=>!document.querySelector('engelsoft-activity-panel').loading);await page.evaluate(()=>demo.callback({events:[],partial:true}));assert(!(await panel.evaluate(el=>el.loading)),'live partial packets cannot restart loading');
for(const width of [1440,900,390,320]){await page.setViewportSize({width,height:1000});assert(await panel.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await panel.evaluate(el=>{el.loading=true;el.render();const a=el.shadowRoot.querySelector('.metrics').getBoundingClientRect().top;el.loading=false;el.render();return Math.abs(a-el.shadowRoot.querySelector('.metrics').getBoundingClientRect().top)<.1;}));}
await page.mouse.move(0, 0);
const rowButtons = panel.locator('.event-row').first().locator('.row-actions button');
assert.equal(await rowButtons.count(), 3);
assert(await rowButtons.evaluateAll(buttons => buttons.every(button => {
  const style = getComputedStyle(button);
  return style.opacity === '1' && style.pointerEvents !== 'none';
})), 'row actions are visible and interactive without hover');
assert.equal(await panel.locator('[data-hours]').inputValue(),'1');await panel.locator('.extra-filters > summary').click();await panel.locator('[data-key="picker-domain"] summary').click();await panel.locator('[data-multi=domain]').first().check();assert.equal(await panel.evaluate(el=>el.filters.domain.length),1);await panel.locator('[data-key="picker-domain"] [data-action="clear-multi"]').click();assert.equal(await panel.locator('[data-multi=domain]:checked').count(),0);await panel.locator('[data-key="picker-domain"] summary').click();await panel.locator('[data-search]').click();await panel.locator('[data-search]').fill('Demo Light');assert((await panel.locator('.event-main strong').allTextContents()).every(v=>v==='Demo Light'));await panel.locator('[data-action=reset]').click();
await panel.locator('[data-hours]').selectOption('6');assert.equal(await panel.evaluate(el=>el.hours),6);await panel.locator('.event-main').first().click();assert.equal(await panel.locator('.detail').count(),1);await panel.locator('[data-action=close]').click();await panel.locator('.row-actions [data-action=star]').first().click();await panel.locator('.filter-bottom [data-action=favorites]').click();assert(await panel.locator('.event-row').count()>0);await panel.locator('.filter-bottom [data-action=favorites]').click();
await panel.evaluate(el=>{el.hass={...el.hass,themes:{darkMode:false}};});assert.equal(await panel.locator('[data-action=quiet]').count(),0);assert.equal(await panel.locator('.clear-filters').count(),0);await panel.locator('.row-actions [data-action=mute]').first().click();assert.equal(await panel.locator('.muted-picker summary b').textContent(),'1');assert.equal(await panel.locator('[data-action=quiet]').count(),0);assert.equal(await panel.locator('.clear-filters').count(),0);await panel.locator('.muted-picker summary').click();assert.equal(await panel.locator('.muted-picker .unmute').count(),1);assert.equal(await panel.locator('[data-action=unmute-all]').count(),1);await panel.locator('.unmute').click();assert.equal(await panel.locator('.muted-picker summary b').textContent(),'0');assert.equal(await panel.locator('footer').count(),0);assert(await panel.locator('main').evaluate(el=>el.getBoundingClientRect().height>=innerHeight));await panel.evaluate(el=>{el.reset();el.view='timeline';el.filters.muted=[];el.reg={'light.demo':{platform:'matter'},'switch.demo':{platform:'mqtt'}};el.events=[{when:(el.end-1000)/1000,entity_id:'light.demo',state:'unknown'},{when:(el.end-1000)/1000,entity_id:'switch.demo',state:'unavailable'}];el.render();});
assert.deepEqual(await panel.locator('.event-source').allTextContents(),['DatenquelleMatter','DatenquelleMQTT']);
assert.equal(await panel.locator('.status-unknown .event-state ha-icon').getAttribute('icon'),'mdi:help-circle-outline');
assert.equal(await panel.locator('.status-offline .event-state ha-icon').getAttribute('icon'),'mdi:lan-disconnect');
for(const width of [1440,900,390,320]){await page.setViewportSize({width,height:1000});assert(await panel.locator('main').evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await panel.locator('.event-state').first().evaluate(el=>getComputedStyle(el,'::before').display==='none'&&getComputedStyle(el.querySelector('ha-icon')).display!=='none'));assert(await panel.locator('.event-source').first().evaluate(el=>{const source=el.getBoundingClientRect(),state=el.parentElement.querySelector('.event-state').getBoundingClientRect();return innerWidth>600?source.left>=state.right:source.top>=state.bottom;}));}
await panel.evaluate(el=>{el.filters.muted=['light.demo','switch.demo'];el.render();el.shadowRoot.querySelector('.muted-picker').open=false;});assert.equal(await panel.locator('.muted-picker summary b').textContent(),'2');await panel.locator('.muted-picker summary').click();await panel.locator('[data-action=unmute-all]').click();assert.equal(await panel.locator('.muted-picker summary b').textContent(),'0');assert.equal(await panel.evaluate(el=>el.filters.muted.length),0);await panel.evaluate(el=>{el.view='timeline';el.reset();el.events=[{when:3,entity_id:'light.demo',state:'unavailable'},{when:2,entity_id:'light.demo',state:'on'},{when:1,entity_id:'light.demo',state:'off'}];el.render();});assert.equal(await panel.locator('.important-event').count(),1);assert.equal(await panel.locator('.event-state>span').first().textContent(),'Ein → Nicht verfügbar');assert.equal(await panel.locator('.event-state>span').nth(1).textContent(),'Aus → Ein');await panel.locator('.event-main').first().click();assert.equal(await panel.locator('.detail-state').textContent(),'Ein → Nicht verfügbar');await checkChart(page, panel);
await page.setViewportSize({width:1440,height:1000});
await panel.evaluate(el=>{
 el.view='timeline'; el.reset(); el.selected=null;
 const person={attributes:{user_id:'person-user',friendly_name:'Demo Person'}};
 el.hass={...el.hass,user:{...el.hass.user,is_admin:true},states:{...el.hass.states,'person.demo':person},callWS:async request=>{
  demo.requests.push(request);
  return request.type==='trace/list'?[{run_id:'saved-'+request.item_id}]:[];
 }};
 const context_id='shared';
 el.events=[
  {when:8,entity_id:'light.demo',state:'on',context_id,context_event_type:'automation_triggered'},
  {when:7,entity_id:'script.b',domain:'script',item_id:'b',run_id:'saved-b',context_id},
  {when:6,entity_id:'script.a',domain:'script',item_id:'a',run_id:'saved-a',context_id},
  {when:5,entity_id:'automation.demo',domain:'automation',item_id:'demo',run_id:'saved-demo',context_id},
  {when:4,entity_id:'script.a',domain:'script',item_id:'a',run_id:'expired-a',context_id},
  {when:3,entity_id:'switch.demo',state:'off',context_user_id:'person-user'}
 ];
 el.render();
});
await panel.locator('.extra-filters > summary').click();
await panel.locator('[data-key="picker-cause"] summary').click();
await panel.locator('[data-multi="cause"][value="automation"]').check();
assert.deepEqual(await panel.locator('.event-main strong').allTextContents(),['Demo Light']);
await panel.locator('[data-multi="cause"][value="person:person-user"]').check();
assert.deepEqual(await panel.locator('.event-main strong').allTextContents(),['Demo Light','Demo Switch']);
await panel.locator('.extra-filters > summary').click();
await panel.locator('.event-main').first().click();
await panel.locator('.related .trace-link').nth(2).waitFor();
assert.deepEqual(await panel.locator('.related .trace-link').evaluateAll(links=>links.map(link=>link.getAttribute('href'))),['/config/script/trace/b?run_id=saved-b','/config/script/trace/a?run_id=saved-a','/config/automation/trace/demo?run_id=saved-demo']);
assert.equal(await page.evaluate(()=>demo.requests.filter(r=>r.type==='trace/list'&&r.item_id==='a').length),1);
await panel.locator('[data-action=close]').click();
await panel.evaluate(el=>{el.hass={...el.hass,user:{...el.hass.user,is_admin:false}};});
await panel.locator('.event-main').first().click();
assert.equal(await panel.locator('.trace-link').count(),0);
assert.equal(await page.evaluate(()=>demo.requests.filter(r=>r.type==='trace/list').length),3);
await panel.evaluate(el=>el.remove());await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>demo.subscriptions),await page.evaluate(()=>demo.unsubscribed));assert.deepEqual(errors,[]);console.log('Synthetic browser checks passed: loading completion, live updates, responsive layout, multiselect, search, period, details, favorites, themes, cleanup.');}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
