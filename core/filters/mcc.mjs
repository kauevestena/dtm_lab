// Multiscale curvature classification, MCC (Evans & Hudak, 2007).
// Three scale domains with growing cell size and tolerance: interpolate a surface from the current
// ground points, smooth it with a 3×3 mean, drop the points that stand more than the tolerance above
// it, and repeat until few points drop. The original uses a thin-plate spline with tension; here
// the surface is the per-cell mean, gap-filled and smoothed, which keeps the curvature test cheap.
import { gridFor, cellOf, fillNearest, sample } from '../grid.mjs';

export const id = 'mcc';
export const defaults = { scale: 1, tolerance: 0.3, maxIter: 30 };
export const params = [
  { key: 'scale', min: 0.25, max: 5, step: 0.25, unit: 'm' },
  { key: 'tolerance', min: 0.05, max: 2, step: 0.05, unit: 'm' },
];

// Scale domains: (cell factor, extra tolerance, stop when the share of points removed falls below).
export const DOMAINS = [[0.5, 0, 0.01], [1, 0.1, 0.01], [1.5, 0.2, 0.001]];

function meanSurface(points, ground, cell) {
  const geom = gridFor(points, cell), n = geom.w * geom.h;
  const s = new Float64Array(n), c = new Uint32Array(n);
  for (let i = 0; i < points.n; i++) {
    if (!ground[i]) continue;
    const k = cellOf(geom, points.x[i], points.y[i]);
    s[k] += points.z[i]; c[k]++;
  }
  const z = new Float32Array(n);
  for (let k = 0; k < n; k++) z[k] = c[k] ? s[k] / c[k] : NaN;
  const filled = fillNearest({ ...geom, z });
  const out = new Float32Array(n);
  for (let r = 0; r < geom.h; r++) for (let q = 0; q < geom.w; q++) {
    let sum = 0, m = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dq = -1; dq <= 1; dq++) {
      const rr = r + dr, qq = q + dq;
      if (rr < 0 || rr >= geom.h || qq < 0 || qq >= geom.w) continue;
      const v = filled.z[rr * geom.w + qq];
      if (!Number.isNaN(v)) { sum += v; m++; }
    }
    out[r * geom.w + q] = m ? sum / m : NaN;
  }
  return { ...geom, z: out };
}

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const ground = new Uint8Array(points.n).fill(1);
  let surface = null, passes = 0;
  for (const [factor, extra, stop] of DOMAINS) {
    const cell = prm.scale * factor, tol = prm.tolerance + extra;
    for (let it = 0; it < prm.maxIter; it++, passes++) {
      surface = meanSurface(points, ground, cell);
      let kept = 0, removed = 0;
      for (let i = 0; i < points.n; i++) {
        if (!ground[i]) continue;
        kept++;
        if (points.z[i] - sample(surface, points.x[i], points.y[i]) > tol) { ground[i] = 0; removed++; }
      }
      if (!kept || removed / kept < stop) break;
    }
  }
  return { ground, surface, passes };
}
