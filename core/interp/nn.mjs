// Natural neighbour (Sibson) by the discrete method of Park et al. (2006): every raster cell p hands
// the height of its nearest sample to all cells within that nearest-sample distance; the estimate is
// the mean of what each cell received. It converges to Sibson's area-stealing weights as cells shrink.
import { makeIndex } from '../grid.mjs';

export const id = 'nn';
export const defaults = {};
export const params = [];

export function run(samples, geom) {
  const { w, h, cell, x0, y0 } = geom;
  const index = makeIndex(samples, Math.max(cell, 1));
  const sum = new Float64Array(w * h), cnt = new Uint32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const x = x0 + (c + 0.5) * cell, y = y0 + (r + 0.5) * cell;
    const [[d2, i]] = index.knn(x, y, 1);
    const R = Math.sqrt(d2) / cell, Ri = Math.floor(R), zs = samples.z[i];
    for (let dr = -Ri; dr <= Ri; dr++) {
      const rr = r + dr;
      if (rr < 0 || rr >= h) continue;
      const span = Math.floor(Math.sqrt(Math.max(0, R * R - dr * dr)));
      for (let dc = -span; dc <= span; dc++) {
        const cc = c + dc;
        if (cc < 0 || cc >= w) continue;
        sum[rr * w + cc] += zs; cnt[rr * w + cc]++;
      }
    }
  }
  const z = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) z[k] = cnt[k] ? sum[k] / cnt[k] : NaN;
  return { z };
}
