// Inverse distance weighting: weighted mean of the k nearest samples, weights 1/d^power.
import { makeIndex } from '../grid.mjs';

export const id = 'idw';
export const defaults = { power: 2, k: 12 };
export const params = [
  { key: 'power', min: 0.5, max: 6, step: 0.5, unit: '' },
  { key: 'k', min: 3, max: 64, step: 1, unit: '' },
];

export function run(samples, geom, p = {}) {
  const prm = { ...defaults, ...p };
  const index = makeIndex(samples, Math.max(geom.cell, 1));
  const z = new Float32Array(geom.w * geom.h);
  for (let r = 0; r < geom.h; r++) for (let c = 0; c < geom.w; c++) {
    const x = geom.x0 + (c + 0.5) * geom.cell, y = geom.y0 + (r + 0.5) * geom.cell;
    const nb = index.knn(x, y, prm.k);
    let sw = 0, sz = 0, exact = NaN;
    for (const [d2, i] of nb) {
      if (d2 < 1e-12) { exact = samples.z[i]; break; }
      const wgt = 1 / d2 ** (prm.power / 2);
      sw += wgt; sz += wgt * samples.z[i];
    }
    z[r * geom.w + c] = Number.isNaN(exact) ? (sw ? sz / sw : NaN) : exact;
  }
  return { z };
}
