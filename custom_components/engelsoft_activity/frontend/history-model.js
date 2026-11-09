const missing = new Set(['unknown', 'unavailable', '']);
const numeric = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i;

export function historyPoints(rows, start, end) {
  const byTime = new Map();
  for (const row of rows ?? []) {
    const raw = row.lu ?? row.lc ?? row.last_updated ?? row.last_changed;
    const time = typeof raw === 'number' ? Math.round(raw * 1000) : Date.parse(raw);
    const state = row.s ?? row.state;
    if (Number.isFinite(time) && time <= end && typeof state === 'string') {
      byTime.set(time, state);
    }
  }
  const points = [];
  for (const [time, state] of [...byTime].sort(([a], [b]) => a - b)) {
    const previous = points.at(-1);
    if (time <= start) points[0] = { time: start, state };
    else if (previous?.state !== state) points.push({ time, state });
  }
  return points;
}

export function stateValue(state) {
  return numeric.test(state) && Number.isFinite(Number(state)) ? Number(state) : null;
}

export function available(state) {
  return state !== undefined && !missing.has(state);
}

export function isNumeric(points) {
  const valid = points.filter(point => available(point.state));
  return valid.length > 0 && valid.every(point => stateValue(point.state) !== null);
}

export function valueAt(points, time) {
  let low = 0;
  let high = points.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (points[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  return points[low - 1]?.state;
}

export function extent(points) {
  let min = Infinity;
  let max = -Infinity;
  for (const { state } of points) {
    const value = stateValue(state);
    if (value === null) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
}

// Keep the first, last and extreme measurements in each horizontal bucket.
// Unavailable intervals always break the line, including within a bucket.
export function steppedPath(points, end, x, y) {
  const commands = [];
  let bucket = [];
  let column = -1;
  let open = false;
  function flush() {
    if (!bucket.length) return;
    let min = bucket[0];
    let max = min;
    for (const point of bucket) {
      if (point.value < min.value) min = point;
      if (point.value > max.value) max = point;
    }
    for (const point of [...new Set([bucket[0], min, max, bucket.at(-1)])].sort((a, b) => a.time - b.time)) {
      commands.push(open ? `H${x(point.time)}V${y(point.value)}` : `M${x(point.time)} ${y(point.value)}`);
      open = true;
    }
    bucket = [];
  }
  for (const { time, state } of points) {
    const nextColumn = Math.floor(x(time) / 2);
    const value = stateValue(state);
    if (nextColumn !== column || value === null) flush();
    column = nextColumn;
    if (value !== null) bucket.push({ time, value });
    else if (open) {
      commands.push(`H${x(time)}`);
      open = false;
    }
  }
  flush();
  if (open) commands.push(`H${x(end)}`);
  return commands.join('');
}
