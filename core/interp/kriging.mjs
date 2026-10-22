// Ordinary kriging with a spherical variogram fitted to the experimental one.
// Each cell is estimated from its k nearest samples; the kriging variance is returned as well,
// which is what sets kriging apart: it reports the uncertainty, not only the height.
import { makeIndex, thinMean } from '../grid.mjs';
import { solve } from '../linalg.mjs';

export const id = 'kriging';
export const defaults = { k: 16, bins: 15, maxSamples: 1500 };
export const params = [
  { key: 'k', min: 4, max: 48, step: 1, unit: '' },
];

export const spherical = (h, { nugget, sill, range }) =>
  h <= 0 ? 0 : h >= range ? nugget + sill : nugget + sill * (1.5 * (h / range) - 0.5 * (h / range) ** 3);

// Experimental semivariogram: half the mean squared height difference per distance bin.
export function experimental(s, bins, maxLag) {
  const sum = new Float64Array(bins), cnt = new Uint32Array(bins);
  for (let i = 0; i < s.n; i++) for (let j = i + 1; j < s.n; j++) {
    const d = Math.hypot(s.x[i] - s.x[j], s.y[i] - s.y[j]);
    if (d >= maxLag) continue;
    const b = Math.floor((d / maxLag) * bins);
    sum[b] += 0.5 * (s.z[i] - s.z[j]) ** 2; cnt[b]++;
  }
  const out = [];
  for (let b = 0; b < bins; b++) if (cnt[b]) out.push({ h: ((b + 0.5) * maxLag) / bins, g: sum[b] / cnt[b], n: cnt[b] });
  return out;
}

// For each trial range the model is linear in (nugget, sill): weighted least squares, weights = pair counts.
export function fitSpherical(exp, maxLag) {
  let best = null;
  for (let t = 1; t <= 60; t++) {
    const range = (t / 60) * maxLag * 1.5;
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
    for (const { h, g, n } of exp) {
      const f = h >= range ? 1 : 1.5 * (h / range) - 0.5 * (h / range) ** 3;
      a11 += n; a12 += n * f; a22 += n * f * f; b1 += n * g; b2 += n * g * f;
    }
    const det = a11 * a22 - a12 * a12;
    let nugget = det ? (b1 * a22 - b2 * a12) / det : 0, sill = det ? (a11 * b2 - a12 * b1) / det : 0;
    if (nugget < 0) { nugget = 0; sill = a22 ? b2 / a22 : 0; }
    if (sill <= 0) continue;
    let sse = 0;
    for (const { h, g, n } of exp) sse += n * (g - spherical(h, { nugget, sill, range })) ** 2;
    if (!best || sse < best.sse) best = { nugget, sill, range, sse };
  }
  return best || { nugget: 0, sill: 1, range: maxLag, sse: 0 };
}

export function run(samples, geom, p = {}) {
  const prm = { ...defaults, ...p };
  const span = Math.hypot(geom.w * geom.cell, geom.h * geom.cell);
  let sub = samples;
  for (let cell = geom.cell; sub.n > prm.maxSamples; cell *= 1.5) sub = thinMean(samples, cell);
  const maxLag = span / 2;
  const exp = experimental(sub, prm.bins, maxLag);
  const model = prm.model || fitSpherical(exp, maxLag); // a fixed model can be passed (tests)
  const index = makeIndex(samples, Math.max(geom.cell, 1));
  const k = Math.min(prm.k, samples.n), m = k + 1;
  const z = new Float32Array(geom.w * geom.h), variance = new Float32Array(geom.w * geom.h);
  const A = new Float64Array(m * m), b = new Float64Array(m);
  for (let r = 0; r < geom.h; r++) for (let c = 0; c < geom.w; c++) {
    const x = geom.x0 + (c + 0.5) * geom.cell, y = geom.y0 + (r + 0.5) * geom.cell;
    const nb = index.knn(x, y, k).map((e) => e[1]);
    // System in covariance-free form: Σ λj γ(xi, xj) + μ = γ(xi, x0); Σ λj = 1.
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        A[i * m + j] = spherical(Math.hypot(samples.x[nb[i]] - samples.x[nb[j]], samples.y[nb[i]] - samples.y[nb[j]]), model);
      }
      A[i * m + k] = 1; A[k * m + i] = 1;
      b[i] = spherical(Math.hypot(samples.x[nb[i]] - x, samples.y[nb[i]] - y), model);
    }
    A[k * m + k] = 0; b[k] = 1;
    const rhs = Float64Array.from(b);
    const kc = r * geom.w + c;
    if (!solve(A, b, m)) { z[kc] = NaN; variance[kc] = NaN; continue; }
    let est = 0, v = b[k];
    for (let i = 0; i < k; i++) { est += b[i] * samples.z[nb[i]]; v += b[i] * rhs[i]; }
    z[kc] = est; variance[kc] = Math.max(0, v);
  }
  return { z, variance, model, experimental: exp };
}
