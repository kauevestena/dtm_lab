// Thin-plate spline: the surface of least bending through the samples, U(r) = r² log r.
// Global method: every sample affects every cell. Samples are thinned to `maxSamples` so the dense
// (n+3)² system stays solvable in the browser; `smoothing` (λ) relaxes exact interpolation.
import { thinMean } from '../grid.mjs';
import { solve } from '../linalg.mjs';

export const id = 'tps';
export const defaults = { maxSamples: 900, smoothing: 0 };
export const params = [
  { key: 'maxSamples', min: 100, max: 2000, step: 100, unit: '' },
  { key: 'smoothing', min: 0, max: 10, step: 0.1, unit: '' },
];

const U = (r2) => (r2 > 0 ? 0.5 * r2 * Math.log(r2) : 0);

export function run(samples, geom, p = {}) {
  const prm = { ...defaults, ...p };
  let s = samples;
  for (let cell = geom.cell; s.n > prm.maxSamples; cell *= 1.25) s = thinMean(samples, cell);
  // Centre and scale coordinates for conditioning.
  let mx = 0, my = 0;
  for (let i = 0; i < s.n; i++) { mx += s.x[i]; my += s.y[i]; }
  mx /= s.n; my /= s.n;
  const sc = Math.max(geom.w, geom.h) * geom.cell || 1;
  const X = Float64Array.from(s.x, (v) => (v - mx) / sc), Y = Float64Array.from(s.y, (v) => (v - my) / sc);
  const n = s.n, m = n + 3, A = new Float64Array(m * m), b = new Float64Array(m);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) A[i * m + j] = i === j ? prm.smoothing : U((X[i] - X[j]) ** 2 + (Y[i] - Y[j]) ** 2);
    A[i * m + n] = 1; A[i * m + n + 1] = X[i]; A[i * m + n + 2] = Y[i];
    A[n * m + i] = 1; A[(n + 1) * m + i] = X[i]; A[(n + 2) * m + i] = Y[i];
    b[i] = s.z[i];
  }
  if (!solve(A, b, m)) return { z: new Float32Array(geom.w * geom.h).fill(NaN), samples: n };
  const z = new Float32Array(geom.w * geom.h);
  for (let r = 0; r < geom.h; r++) for (let c = 0; c < geom.w; c++) {
    const x = (geom.x0 + (c + 0.5) * geom.cell - mx) / sc, y = (geom.y0 + (r + 0.5) * geom.cell - my) / sc;
    let v = b[n] + b[n + 1] * x + b[n + 2] * y;
    for (let i = 0; i < n; i++) v += b[i] * U((x - X[i]) ** 2 + (y - Y[i]) ** 2);
    z[r * geom.w + c] = v;
  }
  return { z, samples: n };
}
