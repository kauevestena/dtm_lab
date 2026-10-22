// Simple morphological filter, SMRF (Pingel, Clarke & McBride, 2013).
// 1. Lowest-point raster, gaps filled. 2. Openings with diamonds of radius 1..maxWindow (as in PDAL); a cell whose
// height drops more than slope·radius·cell between consecutive openings is an object.
// 3. Provisional DTM: object cells re-filled from the ground cells. 4. Each point is ground when its
// height above the provisional DTM is below threshold + scalar·local slope.
import { gridFor, minGrid, fillNearest, erodeDiamond, dilateDiamond, sample, gradient } from '../grid.mjs';

export const id = 'smrf';
export const defaults = { cell: 1, slope: 0.15, maxWindow: 18, threshold: 0.5, scalar: 1.25 };
export const params = [
  { key: 'cell', min: 0.25, max: 4, step: 0.25, unit: 'm' },
  { key: 'maxWindow', min: 1, max: 60, step: 1, unit: 'm' },
  { key: 'slope', min: 0.01, max: 1, step: 0.01, unit: '' },
  { key: 'threshold', min: 0.05, max: 3, step: 0.05, unit: 'm' },
  { key: 'scalar', min: 0, max: 5, step: 0.05, unit: '' },
];

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const geom = gridFor(points, prm.cell);
  const zmin = fillNearest(minGrid(points, geom));
  const object = new Uint8Array(geom.w * geom.h);
  const radius = Math.max(1, Math.round(prm.maxWindow / prm.cell));
  let last = zmin, eroded = zmin;
  for (let r = 1; r <= radius; r++) {
    eroded = erodeDiamond(eroded, 1);
    const opened = dilateDiamond(eroded, r);
    const t = prm.slope * r * prm.cell;
    for (let k = 0; k < object.length; k++) if (last.z[k] - opened.z[k] > t) object[k] = 1;
    last = opened;
  }
  const provisional = { ...zmin, z: zmin.z.map((v, k) => (object[k] ? NaN : v)) };
  const dtm = fillNearest(provisional);
  // Pingel et al. inpaint the gaps with springs; nearest fill followed by a light smoothing pass
  // keeps the step cheap while avoiding plateaus at the edges of large gaps.
  const smooth = smoothGaps(dtm, object, 4);
  const grad = gradient(smooth);
  const ground = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    const s = sample(smooth, points.x[i], points.y[i]);
    const slope = sample(grad, points.x[i], points.y[i]);
    ground[i] = Math.abs(points.z[i] - s) <= prm.threshold + prm.scalar * slope ? 1 : 0;
  }
  return { ground, surface: smooth, object };
}

// Jacobi relaxation of the filled cells only (ground cells stay fixed), a discrete Laplace inpaint.
function smoothGaps(g, holes, iters) {
  const { w, h } = g;
  let z = Float32Array.from(g.z);
  const n = Math.max(iters, Math.ceil(Math.sqrt(w * h) / 2));
  for (let it = 0; it < n; it++) {
    const next = Float32Array.from(z);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
      const k = r * w + c;
      if (!holes[k]) continue;
      let s = 0, m = 0;
      if (c > 0) { s += z[k - 1]; m++; }
      if (c < w - 1) { s += z[k + 1]; m++; }
      if (r > 0) { s += z[k - w]; m++; }
      if (r < h - 1) { s += z[k + w]; m++; }
      next[k] = s / m;
    }
    z = next;
  }
  return { ...g, z };
}
