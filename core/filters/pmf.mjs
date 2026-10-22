// Progressive morphological filter (Zhang et al., 2003).
// Openings of the lowest-point raster with growing windows; a point is an object once it stands
// higher than the threshold dh(k) above the opened surface.
import { gridFor, minGrid, fillNearest, openSquare, cellOf } from '../grid.mjs';

export const id = 'pmf';
export const defaults = { cell: 1, slope: 0.3, dh0: 0.5, dhMax: 3, maxWindow: 33, exponential: true };
export const params = [
  { key: 'cell', min: 0.25, max: 4, step: 0.25, unit: 'm' },
  { key: 'maxWindow', min: 3, max: 65, step: 2, unit: 'cells' },
  { key: 'slope', min: 0.05, max: 2, step: 0.05, unit: '' },
  { key: 'dh0', min: 0.05, max: 2, step: 0.05, unit: 'm' },
  { key: 'dhMax', min: 0.5, max: 10, step: 0.5, unit: 'm' },
];

// Window sizes (cells, odd) and thresholds (m): dh(k) = s·[w(k) − w(k−1)]·c + dh0, capped at dhMax; dh(0) = dh0.
export function schedule({ cell, slope, dh0, dhMax, maxWindow, exponential }) {
  const out = [];
  for (let k = 0; ; k++) {
    const w = exponential ? 2 * 2 ** k + 1 : 2 * (k + 1) + 1;
    if (w > maxWindow) break;
    const prev = out.length ? out[out.length - 1].window : 0;
    const dh = k === 0 ? dh0 : Math.min(dhMax, slope * (w - prev) * cell + dh0);
    out.push({ window: w, dh, dhRaw: k === 0 ? dh0 : slope * (w - prev) * cell + dh0 });
  }
  return out;
}

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const geom = gridFor(points, prm.cell);
  let surface = fillNearest(minGrid(points, geom));
  const ground = new Uint8Array(points.n).fill(1);
  const cellIdx = new Int32Array(points.n);
  for (let i = 0; i < points.n; i++) cellIdx[i] = cellOf(geom, points.x[i], points.y[i]);
  const steps = schedule(prm);
  for (const { window: w, dh } of steps) {
    const opened = openSquare(surface, (w - 1) / 2);
    for (let i = 0; i < points.n; i++) {
      if (ground[i] && points.z[i] - opened.z[cellIdx[i]] > dh) ground[i] = 0;
    }
    surface = opened;
  }
  return { ground, surface, steps };
}
