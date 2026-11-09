import { escapeHTML as esc } from './model.js?v=1.3.0';
import { updateDOM } from './dom-update.js?v=1.3.0';
import { historyPoints, available, isNumeric, valueAt, extent, steppedPath } from './history-model.js?v=1.3.0';

const HOUR = 3600000;
const PERIODS = [1, 6, 24, 72, 168];
const SERIES_LIMIT = 8;
const MARKER_LIMIT = 24;
const PALETTE = ['#906227', '#24766d', '#5258a7', '#ad4754', '#526f2a', '#276591', '#8f4687', '#915739'];
const DARK_PALETTE = ['#edc17f', '#7fe2cf', '#b4baff', '#ff9ba6', '#b7d683', '#89c9ff', '#e8a7df', '#f7b58c'];
const UNIT_TITLES = new Map([['lx', 'Beleuchtungsstärke'], ['°C', 'Temperatur'], ['°F', 'Temperatur'], ['W', 'Leistung'], ['kW', 'Leistung'], ['%', 'Prozentwerte']]);
const WIDTH = 1000;
const css = new URL('./history-chart.css?v=1.3.0', import.meta.url).href;
const icon = name => `<ha-icon icon="mdi:${name}" aria-hidden="true"></ha-icon>`;
const number = new Intl.NumberFormat('de-DE', { maximumSignificantDigits: 5 });
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const tint = color => `style="--series:${color}"`;
const duration = hours => {
  if (hours >= 24 && hours % 24 === 0) return `${hours / 24} T`;
  const minutes = Math.round(hours * 60);
  if (minutes < 60) return `${minutes} Min`;
  return `${Math.floor(minutes / 60)} Std${minutes % 60 ? ` ${minutes % 60} Min` : ''}`;
};

class ActivityHistoryChart extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.ids = [];
    this.markers = [];
    this.hiddenSeries = new Set();
    this.data = {};
    this.hours = 24;
    this.anchor = null;
    this.query = '';
    this.request = 0;
    this.shadowRoot.addEventListener('click', event => this.click(event));
    this.addEventListener('wheel', event => this.wheelZoom(event), { capture: true, passive: false });
    this.shadowRoot.addEventListener('input', event => {
      if (event.target.matches('[data-entity-search]')) {
        this.query = event.target.value;
        this.render();
      }
      if (event.target.matches('[data-cursor]')) {
        this.moveCursor(Number(event.target.value) / WIDTH);
      }
    });
    this.shadowRoot.addEventListener('pointerdown', event => {
      const picker = this.shadowRoot.querySelector('details[open]');
      if (picker && !picker.contains(event.target)) picker.open = false;
      this.beginPan(event);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      this.shadowRoot.addEventListener(type, event => this.endPan(event));
    }
    this.shadowRoot.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const picker = this.shadowRoot.querySelector('details[open]');
      if (!picker) return;
      picker.open = false;
      picker.querySelector('summary').focus();
      event.stopPropagation();
    });
    for (const type of ['pointermove', 'click']) {
      this.shadowRoot.addEventListener(type, event => {
        if (type === 'pointermove' && this.pan) return this.movePan(event);
        if (type === 'pointermove' && event.pointerType === 'touch') return;
        const plot = event.target.closest('[data-plot]');
        if (!plot || event.target.closest('button')) return;
        if (type === 'click' && this.skipPlotClick) return;
        const rect = plot.getBoundingClientRect();
        this.moveCursor((event.clientX - rect.left) / rect.width);
      });
    }
    this.onReady = () => {
      this.needsLoad = true;
      if (!this.hidden) void this.load();
    };
  }

  connectedCallback() {
    if (this.hass) {
      this.hass.connection.addEventListener('ready', this.onReady);
      this.onReady();
    } else this.render();
  }

  disconnectedCallback() {
    this.request++;
    clearTimeout(this.loadTimer);
    this.pan = null;
    this.hass?.connection.removeEventListener('ready', this.onReady);
  }

  setContext(hass, now) {
    if (!hass) return;
    const previous = this.hass;
    this.hass = hass;
    this.now = now;
    if (previous?.config?.time_zone !== hass.config?.time_zone) this.formatter = null;
    const key = `engelsoft-activity-chart:${hass.user?.id || 'local'}`;
    if (this.key !== key || previous?.connection !== hass.connection) {
      previous?.connection.removeEventListener('ready', this.onReady);
      hass.connection.addEventListener('ready', this.onReady);
      if (this.key !== key) this.restore(key);
      this.request++;
      clearTimeout(this.loadTimer);
      this.needsLoad = true;
      this.notifySelection();
    } else if (previous.themes?.darkMode !== hass.themes?.darkMode) this.render();
    if (this.needsLoad && !this.hidden) void this.load();
  }

  restore(key) {
    this.key = key;
    this.ids = [];
    this.markers = [];
    this.hiddenSeries.clear();
    this.anchor = null;
    this.hours = 24;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      this.ids = [...new Set((saved.ids || []).filter(id => typeof id === 'string'))].slice(0, SERIES_LIMIT);
      this.hiddenSeries = new Set(this.ids.filter(id => saved.hidden?.includes(id)));
      this.markers = (saved.markers || []).filter(marker => marker && this.ids.includes(marker.id) &&
        typeof marker.key === 'string' && typeof marker.label === 'string' && Number.isFinite(marker.time)).slice(0, MARKER_LIMIT);
      if (Number.isFinite(saved.hours) && saved.hours >= .25 && saved.hours <= 168) this.hours = saved.hours;
    } catch { /* Storage may be disabled or contain an older format. */ }
  }

  save() {
    try {
      localStorage.setItem(this.key, JSON.stringify({
        ids: this.ids, hidden: [...this.hiddenSeries], hours: this.hours, markers: this.markers,
      }));
    } catch { /* Selection remains available in this session. */ }
    this.notifySelection();
  }

  notifySelection() {
    this.dispatchEvent(new CustomEvent('activity-chart-selection', { bubbles: true, detail: this.ids.length }));
  }

  name(id) {
    return this.hass?.states?.[id]?.attributes?.friendly_name || id;
  }

  date(time) {
    const formatter = this.formatter ??= new Intl.DateTimeFormat('de-DE', {
      timeZone: this.hass?.config?.time_zone,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    return formatter.format(time);
  }

  pin(marker) {
    if (!this.ids.includes(marker.id)) {
      if (this.ids.length >= SERIES_LIMIT) {
        this.feedback = 'Der Chart ist voll. Entferne eine Entität und füge das Ereignis erneut hinzu.';
        this.render();
        return;
      }
      this.ids.push(marker.id);
    }
    this.hiddenSeries.delete(marker.id);
    this.markers = [marker, ...this.markers.filter(item => item.key !== marker.key)].slice(0, MARKER_LIMIT);
    this.showMarker(marker);
    this.save();
  }

  showMarker(marker) {
    this.feedback = '';
    if (!this.loading && Object.hasOwn(this.data, marker.id) &&
        marker.time >= this.start && marker.time <= this.end && !this.error) {
      this.moveCursor(this.position(marker.time));
      this.render();
      return;
    }
    const now = this.now();
    this.anchor = Math.min(now, marker.time + this.hours * HOUR / 2);
    this.cursor = marker.time;
    void this.load();
  }

  queueLoad() {
    this.request++;
    this.loading = !!this.ids.length;
    this.error = '';
    clearTimeout(this.loadTimer);
    this.render();
    this.loadTimer = setTimeout(() => void this.load(), 150);
  }

  wheelZoom(event) {
    if (!event.ctrlKey) return;
    const axis = event.composedPath().find(node => node.matches?.('.graphs'))?.querySelector('[data-plot], [data-cursor]');
    if (!axis) return;
    event.preventDefault();
    if (this.pan) return;
    const box = axis.getBoundingClientRect();
    const position = clamp((event.clientX - box.left) / box.width, 0, 1);
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.clientHeight : 1);
    const hours = clamp(this.hours * Math.exp(clamp(pixels / 400, -.7, .7)), .25, 168);
    if (hours === this.hours) return;
    const now = this.now();
    const end = Math.min(now, this.anchor ?? this.end);
    this.cursor = end - (1 - position) * this.hours * HOUR;
    this.anchor = Math.min(now, this.cursor + (1 - position) * hours * HOUR);
    this.hours = hours;
    this.request++;
    clearTimeout(this.loadTimer);
    this.loadTimer = setTimeout(() => {
      this.save();
      void this.load({ preservePlot: true });
    }, 150);
  }

  beginPan(event) {
    this.skipPlotClick = false;
    const plot = event.target.closest('[data-plot]');
    if (!plot || event.pointerType !== 'mouse' || event.button !== 0 || this.loading || this.loadTimer) return;
    const width = plot.getBoundingClientRect().width;
    if (!width) return;
    this.pan = { id: event.pointerId, x: event.clientX, width, end: this.end, span: this.end - this.start, offset: 0 };
    plot.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  movePan(event) {
    const pan = this.pan;
    if (event.pointerId !== pan.id) return;
    const distance = event.clientX - pan.x;
    if (!pan.active && Math.abs(distance) < 5) return;
    pan.active = true;
    pan.nextEnd = Math.min(this.now(), pan.end - distance / pan.width * pan.span);
    pan.offset = (pan.end - pan.nextEnd) / pan.span * pan.width;
    this.shadowRoot.querySelector('.graphs')?.style.setProperty('--pan-offset', `${pan.offset}px`);
  }

  endPan(event) {
    const pan = this.pan;
    if (!pan || event.pointerId !== pan.id) return;
    this.pan = null;
    if (!pan.active) return;
    this.skipPlotClick = true;
    if (event.type !== 'pointerup' || !pan.offset) {
      this.shadowRoot.querySelector('.graphs')?.style.removeProperty('--pan-offset');
      return;
    }
    this.anchor = pan.nextEnd;
    this.cursor = null;
    void this.load({ preservePlot: true, panOffset: pan.offset });
  }

  async load({ preservePlot = false, panOffset = 0 } = {}) {
    this.needsLoad = false;
    clearTimeout(this.loadTimer);
    this.loadTimer = null;
    const request = ++this.request;
    this.panOffset = panOffset;
    const ids = [...this.ids];
    const end = Math.min(this.anchor ?? Infinity, this.now());
    const start = end - this.hours * HOUR;
    if (!preservePlot) {
      this.end = end;
      this.start = start;
      this.data = {};
    }
    this.error = '';
    this.loading = !!ids.length;
    this.render();
    if (!ids.length) return;
    let timeout;
    try {
      const rows = await Promise.race([
        this.hass.callWS({
          type: 'history/history_during_period', entity_ids: ids,
          start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(),
          include_start_time_state: true, minimal_response: true, no_attributes: true,
          significant_changes_only: false,
        }),
        new Promise((_, reject) => { timeout = setTimeout(reject, 25000); }),
      ]);
      if (request !== this.request) return;
      this.start = start;
      this.end = end;
      this.data = Object.fromEntries(ids.map(id => [id, historyPoints(rows?.[id], start, end)]));
    } catch {
      if (request !== this.request) return;
      this.error = 'Der Verlauf konnte nicht geladen werden. Bitte versuche es erneut.';
    } finally {
      clearTimeout(timeout);
      if (request === this.request) {
        this.panOffset = 0;
        this.loading = false;
        this.render();
      }
    }
  }

  click(event) {
    const button = event.target.closest('button[data-chart]');
    if (!button) return;
    const { chart, entity: id, value } = button.dataset;
    this.feedback = '';
    if (chart === 'add') {
      if (this.ids.length >= SERIES_LIMIT || this.ids.includes(id)) return;
      this.ids.push(id);
      this.save();
      this.queueLoad();
      this.shadowRoot.querySelector('[data-entity-search]').focus();
      return;
    }
    if (chart === 'remove') {
      this.ids = this.ids.filter(item => item !== id);
      this.hiddenSeries.delete(id);
      this.markers = this.markers.filter(item => item.id !== id);
      this.save();
      this.queueLoad();
      this.shadowRoot.querySelector('summary').focus();
      return;
    }
    if (chart === 'toggle') {
      if (this.hiddenSeries.has(id)) this.hiddenSeries.delete(id);
      else this.hiddenSeries.add(id);
      this.save();
      this.render();
      return;
    }
    if (chart === 'forget') {
      this.markers = this.markers.filter(item => item.key !== value);
      this.save();
      this.render();
      return;
    }
    if (chart === 'marker') {
      const marker = this.markers.find(item => item.key === value);
      if (marker) this.showMarker(marker);
      return;
    }
    if (chart === 'export') return this.export();
    if (chart === 'period') this.hours = Number(value);
    if (chart === 'back' || chart === 'forward') {
      const next = this.end + (chart === 'back' ? -1 : 1) * this.hours * HOUR;
      this.anchor = next >= this.now() ? null : next;
    }
    if (chart === 'now') this.anchor = null;
    if (chart === 'in' || chart === 'out') {
      const center = this.cursor ?? (this.start + this.end) / 2;
      this.hours = clamp(this.hours * (chart === 'in' ? .5 : 2), .25, 168);
      this.anchor = Math.min(this.now(), center + this.hours * HOUR / 2);
    } else if (chart !== 'refresh') this.cursor = null;
    this.save();
    void this.load();
  }

  export() {
    const quote = value => '"' + String(value).replace(/^[=+@\-\t\r\n]/, "'$&").replaceAll('"', '""') + '"';
    const rows = [['Zeit (UTC)', 'Entität', 'Name', 'Zustand', 'Einheit', 'Art']];
    for (const id of this.ids.filter(id => !this.hiddenSeries.has(id))) {
      const unit = this.hass.states?.[id]?.attributes?.unit_of_measurement || '';
      for (const { time, state } of this.data[id] || []) {
        rows.push([new Date(time).toISOString(), id, this.name(id), state, unit, 'Verlauf']);
      }
    }
    for (const marker of this.rangeMarkers()) {
      rows.push([new Date(marker.time).toISOString(), marker.id, this.name(marker.id), marker.label, '', 'Ereignis']);
    }
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(quote).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'engelsoft-activity-verlauf.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  series() {
    const palette = this.hass?.themes?.darkMode === false ? PALETTE : DARK_PALETTE;
    return this.ids.map((id, index) => {
      const points = this.data[id] || [];
      return {
        id, name: this.name(id), points, color: palette[index],
        unit: this.hass?.states?.[id]?.attributes?.unit_of_measurement || '',
        numeric: isNumeric(points),
      };
    });
  }

  position(time) {
    return clamp((time - this.start) / (this.end - this.start), 0, 1);
  }

  rangeMarkers() {
    return this.markers.filter(({ time }) => time >= this.start && time <= this.end);
  }

  readout(series, time) {
    const state = valueAt(series.points, time);
    if (!available(state)) return ({ unknown: 'Unbekannt', unavailable: 'Nicht verfügbar' })[state] || '–';
    if (series.numeric) return `${number.format(Number(state))}${series.unit ? ' ' + series.unit : ''}`;
    const entity = this.hass?.states?.[series.id];
    if (entity && this.hass.formatEntityState) {
      try { return this.hass.formatEntityState({ ...entity, state }, state); } catch { /* Raw state below. */ }
    }
    return ({ on: 'Ein', off: 'Aus', open: 'Offen', closed: 'Geschlossen' })[state] || state;
  }

  moveCursor(position) {
    position = clamp(position, 0, 1);
    this.cursor = Math.round(this.start + position * (this.end - this.start));
    const root = this.shadowRoot;
    root.querySelector('.graphs')?.style.setProperty('--cursor', `${position * 100}%`);
    const cursor = root.querySelector('[data-cursor]');
    if (!cursor) return;
    cursor.value = Math.round(position * WIDTH);
    cursor.setAttribute('aria-valuetext', this.date(this.cursor));
    root.querySelector('.cursor-time').textContent = this.date(this.cursor);
    for (const series of this.renderedSeries) {
      this.readouts.get(series.id).textContent = this.readout(series, this.cursor);
    }
  }

  picker() {
    const states = this.hass?.states;
    if (this.optionStates !== states) {
      this.optionStates = states;
      this.options = Object.keys(states || {}).sort((a, b) => this.name(a).localeCompare(this.name(b), 'de'));
    }
    const query = this.query.toLocaleLowerCase('de').trim();
    const candidates = (this.options || []).filter(id => !this.ids.includes(id) &&
      `${this.name(id)} ${id}`.toLocaleLowerCase('de').includes(query));
    return `<details class="picker" data-key="entity-picker"><summary aria-label="Entität hinzufügen" title="Entität hinzufügen">${icon('plus')}<span>Entität hinzufügen</span></summary>
      <div class="picker-panel"><input type="search" data-entity-search placeholder="Name oder Entitäts-ID" aria-label="Entitäten durchsuchen" value="${esc(this.query)}">
      <p>${this.ids.length} von ${SERIES_LIMIT} Entitäten ausgewählt</p>
      <div class="options">${candidates.slice(0, 60).map(id => `<button data-key="option-${esc(id)}" data-chart="add" data-entity="${esc(id)}" ${this.ids.length >= SERIES_LIMIT ? 'disabled' : ''}><span>${esc(this.name(id))}<small>${esc(id)}</small></span>${icon('plus')}</button>`).join('') || '<p>Keine passenden Entitäten.</p>'}</div>
      ${candidates.length > 60 ? '<p>Die Suche grenzt die angezeigten Treffer ein.</p>' : ''}</div></details>`;
  }

  card(series, time) {
    const { id, name, color, points, numeric, unit } = series;
    const hidden = this.hiddenSeries.has(id);
    const { min, max } = numeric ? extent(points) : {};
    const summary = numeric ? (min === max ? 'Konstant' : `${number.format(min)}–${number.format(max)}${unit ? ' ' + unit : ''}`)
      : points.length ? 'Zustandsverlauf' : this.loading ? 'Verlauf wird geladen …' : 'Keine Daten im Zeitraum';
    return `<article class="series" data-key="series-${esc(id)}" ${tint(color)}>
      <div class="series-header"><button class="series-toggle" data-chart="toggle" data-entity="${esc(id)}" aria-pressed="${!hidden}" aria-label="${esc(name)} ${hidden ? 'einblenden' : 'ausblenden'}" title="${esc(name + ' · ' + id)}"><i></i><span>${esc(name)}</span></button>
      <button class="remove" data-chart="remove" data-entity="${esc(id)}" aria-label="${esc(name)} aus dem Chart entfernen" title="${esc(name)} aus dem Chart entfernen">${icon('close')}</button></div>
      <div class="series-reading"><strong data-reading="${esc(id)}">${hidden ? 'Ausgeblendet' : esc(this.readout(series, time))}</strong><small title="${numeric && min !== max ? 'Minimum und Maximum im Zeitraum' : ''}">${esc(summary)}</small></div></article>`;
  }

  plot(content, height, label) {
    return `<div class="plot" data-plot style="--plot-height:${height}px" aria-label="${esc(label)}">
      <svg viewBox="0 0 ${WIDTH} ${height}" preserveAspectRatio="none" aria-hidden="true">${content}</svg>
      <i class="crosshair" aria-hidden="true"></i></div>`;
  }

  numericPlot(series, unit, x) {
    const ranges = series.map(item => extent(item.points));
    const low = Math.min(...ranges.map(range => range.min));
    const high = Math.max(...ranges.map(range => range.max));
    const height = high === low ? 54 : 112;
    const span = high - low;
    const proportion = value => span === 0 ? .5 : Number.isFinite(span)
      ? (value - low) / span : (value / 2 - low / 2) / (high / 2 - low / 2);
    const y = value => (height - 9 - (height - 18) * proportion(value)).toFixed(2);
    const ticks = high === low ? [high] : [high, high / 2 + low / 2, low];
    const grid = ticks.map(value => `<path class="gridline" d="M0 ${y(value)}H${WIDTH}"/>`).join('');
    const lines = series.map(item => `<path class="curve" ${tint(item.color)} d="${steppedPath(item.points, this.end, x, y)}"/>`).join('');
    const plotScale = 1 + (series.length - 1) / 10;
    const title = series.length === 1 ? series[0].name : UNIT_TITLES.get(unit) || 'Messwerte';
    return `<section class="graph" style="--plot-scale:${plotScale}"><div class="graph-heading"><h3>${esc(title)}</h3>
      <span>${esc([unit, series.length > 1 ? `${series.length} Kurven` : '', low === high ? 'Konstant' : ''].filter(Boolean).join(' · '))}</span></div><div class="plot-row">
      <div class="scale">${ticks.map(value => `<span style="top:${Number(y(value)) / height * 100}%">${esc(number.format(value))}</span>`).join('')}</div>
      ${this.plot(grid + lines, height, unit || 'Messwerte')}</div></section>`;
  }

  statePlot(series, x) {
    const states = new Map();
    const paths = new Map();
    series.points.forEach(({ state, time }, index, points) => {
      if (!available(state)) return;
      if (!states.has(state)) states.set(state, states.size);
      const level = state === 'off' || state === 'closed' ? 0 : state === 'on' || state === 'open' ? 3 : (states.get(state) + 1) % 4;
      const end = points[index + 1]?.time ?? this.end;
      paths.set(level, (paths.get(level) || '') + `M${x(time)} 4H${x(end)}V24H${x(time)}Z`);
    });
    const bands = [...paths].map(([level, path]) => `<path class="band" ${tint(series.color)} fill-opacity="${.22 + level * .23}" d="${path}"/>`).join('');
    return `<section class="graph state-graph"><div class="graph-heading"><h3>${esc(series.name)}</h3><span>Status</span></div><div class="plot-row">
      <div></div>${this.plot(bands, 24, series.name)}</div></section>`;
  }

  graphs(series, time) {
    const x = stamp => Math.round(this.position(stamp) * WIDTH * 100) / 100;
    const groups = new Map();
    const states = [];
    for (const item of series) {
      if (item.numeric) groups.set(item.unit, [...(groups.get(item.unit) || []), item]);
      else states.push(item);
    }
    const markers = this.rangeMarkers();
    return `<div class="graphs" style="--cursor:${this.position(time) * 100}%;--pan-offset:${this.pan?.offset ?? this.panOffset ?? 0}px">
      ${this.markers.length ? `<div class="plot-row marker-row" ${markers.length ? '' : 'aria-hidden="true"'}><span>Ereignis</span><div class="marker-track">${markers.map(marker => `<button style="--at:${this.position(marker.time) * 100}%" data-chart="marker" data-value="${esc(marker.key)}" aria-label="${esc(marker.label + ' · ' + this.date(marker.time))}" title="${esc(marker.label)}">${icon('map-marker')}</button>`).join('')}</div></div>` : ''}
      <div class="graph-grid">${[...groups].map(([unit, items]) => this.numericPlot(items, unit, x)).join('')}
      ${states.map(item => this.statePlot(item, x)).join('')}</div>
      <label class="cursor-control"><span>Messzeitpunkt <b class="cursor-time">${this.date(time)}</b></span><input data-cursor type="range" min="0" max="${WIDTH}" value="${Math.round(this.position(time) * WIDTH)}" aria-label="Messzeitpunkt" aria-valuetext="${this.date(time)}"></label>
      </div>`;
  }

  markerList() {
    if (!this.markers.length) return '';
    return `<section class="events"><h3>Markierte Aktivitäten <span>${this.markers.length}</span></h3><ul>
      ${this.markers.map(marker => `<li data-key="mark-${esc(marker.key)}"><button data-chart="marker" data-value="${esc(marker.key)}">${icon('map-marker-outline')}<span><b>${esc(this.name(marker.id))}</b><small>${this.date(marker.time)} · ${esc(marker.label)}</small></span></button>
      <button class="remove" data-chart="forget" data-value="${esc(marker.key)}" aria-label="Markierung vom ${this.date(marker.time)} entfernen">${icon('close')}</button></li>`).join('')}</ul></section>`;
  }

  render() {
    const series = this.series();
    const visible = series.filter(item => !this.hiddenSeries.has(item.id));
    const drawable = visible.filter(item => item.points.some(point => available(point.state)));
    const time = clamp(this.cursor ?? this.end, this.start, this.end);
    const button = (action, label, glyph, disabled = false) =>
      `<button class="tool" data-chart="${action}" aria-label="${label}" title="${label}" ${disabled ? 'disabled' : ''}>${icon(glyph)}</button>`;
    const empty = this.loading ? 'Verlauf wird geladen …' : this.error || (series.length === 0 ? 'Dein Verlauf beginnt hier.'
      : visible.length === 0 ? 'Alle Entitäten sind ausgeblendet.' : 'Keine darstellbaren Zustände in diesem Zeitraum.');
    const showGraphs = !this.error && (drawable.length > 0 || (!this.loading && this.rangeMarkers().length > 0));
    updateDOM(this.shadowRoot, `<link rel="stylesheet" href="${css}"><section class="history">
      <div class="toolbar"><div class="periods" role="group" aria-label="Chart-Zeitraum">
        ${PERIODS.map(hours => `<button data-chart="period" data-value="${hours}" aria-pressed="${hours === this.hours}">${duration(hours)}</button>`).join('')}
        ${PERIODS.includes(this.hours) ? '' : `<span>${duration(this.hours)}</span>`}</div>
        <div class="tools">
          <div class="tool-group" role="group" aria-label="Zeitnavigation">
          ${button('back', 'Vorheriger Chart-Zeitraum', 'chevron-left', !series.length)}
          ${button('forward', 'Nächster Chart-Zeitraum', 'chevron-right', !series.length || this.anchor === null || this.end >= this.now() - 1000)}
          <button data-chart="now" ${series.length ? '' : 'disabled'}>Jetzt</button>
          </div><div class="tool-group" role="group" aria-label="Zoom">
          ${button('in', 'Hineinzoomen', 'magnify-plus-outline', !series.length || this.hours <= .25)}
          ${button('out', 'Herauszoomen', 'magnify-minus-outline', !series.length || this.hours >= 168)}
          </div><div class="tool-group" role="group" aria-label="Daten">
          ${button('refresh', 'Chart aktualisieren', 'refresh', !series.length)}
          ${button('export', 'Chart als CSV exportieren', 'download-outline', !showGraphs || this.loading)}
          </div>
        </div>${this.picker()}</div>
      ${this.feedback ? `<p class="feedback" role="status">${esc(this.feedback)}</p>` : ''}
      ${series.length ? `<div class="series-grid">${series.map(item => this.card(item, time)).join('')}</div>` : ''}
      ${showGraphs ? this.graphs(drawable, time) : `<div class="chart-empty" role="status">${icon(this.loading ? 'timer-sand' : 'chart-line')}<b>${esc(empty)}</b>${!series.length ? '<p>Füge oben eine Entität hinzu oder übernimm ein Ereignis direkt aus der Zeitleiste.</p>' : ''}</div>`}
      ${this.markerList()}
    </section>`);
    this.renderedSeries = visible;
    this.readouts = new Map([...this.shadowRoot.querySelectorAll('[data-reading]')].map(el => [el.dataset.reading, el]));
  }
}

customElements.define('engelsoft-activity-history', ActivityHistoryChart);
