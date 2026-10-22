// One simulator run on a tile: ground filter → classification errors → interpolation → height errors.
// Points are { n, x, y, z, cls } in tile coordinates (x, y from the tile's lower-left corner).
import { byId as FILTERS } from './filters/index.mjs';
import { byId as INTERPOLATORS } from './interp/index.mjs';
import { confusion, isRefGround, heightErrors, pecClass } from './metrics.mjs';
import { subset, thinMean, cellOf } from './grid.mjs';
import { triangulate, rasterize } from './tin.mjs';

// Per-point outcome codes for the overlay.
export const OUTCOME = { objectOk: 0, groundOk: 1, typeI: 2, typeII: 3 };
// Height-error zones. The first four use the measured reference (cells with class-2 points), decided
// per cell from the reference classes present in it; 'voids' covers the cells with no measured ground
// (under roofs and dense canopy), scored against the reference TIN, where leftover objects show up.
export const ZONES = ['all', 'open', 'vegetation', 'building', 'voids'];

export function outputGeom(size, cell) {
  const w = Math.max(1, Math.round(size[0] / cell)), h = Math.max(1, Math.round(size[1] / cell));
  return { w, h, cell, x0: 0, y0: 0 };
}

// Reference surfaces on `geom`: `measured` = mean of class-2 points per cell (NaN where none; used for
// the metrics, so no interpolator is favoured); `surface` = TIN of the same means (for display);
// `zone` = per-cell zone index (0 no points: outside the survey, 1 open, 2 vegetation, 3 building).
export function reference(points, geom) {
  const n = geom.w * geom.h, s = new Float64Array(n), c = new Uint32Array(n), zone = new Uint8Array(n);
  for (let i = 0; i < points.n; i++) {
    const k = cellOf(geom, points.x[i], points.y[i]);
    const cl = points.cls[i];
    if (!zone[k]) zone[k] = 1;
    if (cl === 2) { s[k] += points.z[i]; c[k]++; }
    if (cl === 6) zone[k] = 3;
    else if (cl === 5 && zone[k] !== 3) zone[k] = 2;
  }
  const measured = new Float32Array(n);
  for (let k = 0; k < n; k++) measured[k] = c[k] ? s[k] / c[k] : NaN;
  const ground = thinMean(subset(points, Uint8Array.from(points.cls, (v) => (v === 2 ? 1 : 0))), geom.cell);
  const surface = ground.n >= 3 ? rasterize(ground.x, ground.y, ground.z, triangulate(ground.x, ground.y, ground.n), geom).z : measured;
  return { measured, surface, zone };
}

// Cells with points, dilated by `margin` cells (square neighbourhood).
export function footprint(zone, geom, margin) {
  const { w, h } = geom, out = new Uint8Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    if (!zone[r * w + c]) continue;
    for (let dr = -margin; dr <= margin; dr++) for (let dc = -margin; dc <= margin; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < h && cc >= 0 && cc < w) out[rr * w + cc] = 1;
    }
  }
  return out;
}

export function run(points, opts) {
  const { filter, filterParams = {}, interp, interpParams = {}, cell = 0.5, size, eq = 1, ref: refIn } = opts;
  const t0 = performance.now();
  const f = FILTERS[filter].run(points, filterParams);
  const t1 = performance.now();
  const conf = confusion(points.cls, f.ground);
  const outcome = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    const ref = isRefGround(points.cls[i]);
    outcome[i] = ref ? (f.ground[i] ? OUTCOME.groundOk : OUTCOME.typeI) : (f.ground[i] ? OUTCOME.typeII : OUTCOME.objectOk);
  }
  const geom = outputGeom(size, cell);
  const samples = thinMean(subset(points, f.ground), cell);
  const t2 = performance.now();
  const ip = samples.n >= 3 ? INTERPOLATORS[interp].run(samples, geom, interpParams) : { z: new Float32Array(geom.w * geom.h).fill(NaN) };
  const t3 = performance.now();
  const ref = refIn || reference(points, geom);
  // Outside the survey footprint (cells without points, beyond a 2-cell margin) nothing is estimated.
  const inside = footprint(ref.zone, geom, 2);
  for (let k = 0; k < ip.z.length; k++) if (!inside[k]) ip.z[k] = NaN;
  const errors = {};
  for (const [zi, name] of ZONES.entries()) {
    let st;
    if (name === 'voids') {
      // Inside the survey (the cell has points) but without measured ground.
      const mask = Uint8Array.from(ref.measured, (v, k) => (Number.isNaN(v) && ref.zone[k] ? 1 : 0));
      st = heightErrors(ip.z, ref.surface, mask);
    } else {
      st = heightErrors(ip.z, ref.measured, zi === 0 ? null : Uint8Array.from(ref.zone, (z) => (z === zi ? 1 : 0)));
    }
    errors[name] = { ...st, pec: pecClass(st, eq) };
  }
  const dz = new Float32Array(geom.w * geom.h);
  for (let k = 0; k < dz.length; k++) dz[k] = ip.z[k] - ref.surface[k];
  return {
    geom, confusion: conf, outcome, dtm: ip.z, variance: ip.variance || null, dz, ref, errors,
    samples: samples.n, filterInfo: { iterations: f.iterations, steps: f.steps, g: f.g },
    timings: { filterMs: t1 - t0, thinMs: t2 - t1, interpMs: t3 - t2, totalMs: performance.now() - t0 },
  };
}
