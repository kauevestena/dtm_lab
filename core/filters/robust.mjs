// Robust interpolation (Kraus & Pfeifer, 1998), with the optional coarse level of the hierarchical
// version (Pfeifer et al., 2001).
// A surface is fitted to all observations with equal weights; residuals v = z − surface are computed;
// points below keep weight 1 and points above lose weight through
//   p(v) = 1                       v ≤ g
//   p(v) = 1 / (1 + (a·(v − g))^b) g < v ≤ g + w
//   p(v) = 0                       v > g + w
// and the fit is repeated. The shift g (negative) is estimated from the residuals at each pass.
// Linear prediction is replaced by a local-linear Gaussian kernel regression on a raster, which keeps
// the asymmetric reweighting (the essence of the method) at interactive speed.
import { gridFor, cellOf, sample, fillNearest, thinLowest } from '../grid.mjs';

export const id = 'robust';
export const defaults = { cell: 1, radius: 2, a: 2, b: 4, w: 2.5, iterations: 6, finalTol: 0.3, hierarchical: true };
export const params = [
  { key: 'radius', min: 1, max: 20, step: 0.5, unit: 'm' },
  { key: 'w', min: 0.2, max: 10, step: 0.1, unit: 'm' },
  { key: 'a', min: 0.5, max: 10, step: 0.5, unit: '1/m' },
  { key: 'b', min: 1, max: 8, step: 1, unit: '' },
  { key: 'iterations', min: 1, max: 20, step: 1, unit: '' },
  { key: 'finalTol', min: 0.05, max: 2, step: 0.05, unit: 'm' },
];

export const weight = (v, g, { a, b, w }) => (v <= g ? 1 : v > g + w ? 0 : 1 / (1 + (a * (v - g)) ** b));

function blur(arr, w, h, sigmaCells) {
  // Float64 throughout: the moments of the plane fit subtract large, nearly equal sums.
  const r = Math.max(1, Math.ceil(3 * sigmaCells));
  const k = new Float32Array(2 * r + 1);
  for (let i = -r; i <= r; i++) k[i + r] = Math.exp(-(i * i) / (2 * sigmaCells * sigmaCells));
  const tmp = new Float64Array(w * h), out = new Float64Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) { const xx = x + i; if (xx >= 0 && xx < w) s += arr[y * w + xx] * k[i + r]; }
    tmp[y * w + x] = s;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let i = -r; i <= r; i++) { const yy = y + i; if (yy >= 0 && yy < h) s += tmp[yy * w + x] * k[i + r]; }
    out[y * w + x] = s;
  }
  return out;
}

// Weighted local-linear kernel surface: at each cell centre a plane is fitted to the observations by
// weighted least squares with Gaussian distance weights. The plane (unlike a weighted mean) follows the
// slope, which is what linear prediction does in the original method. The weighted sums are binned per
// cell and blurred, so the cost does not depend on the kernel size.
function fit(obs, wts, geom, radius) {
  const n = geom.w * geom.h;
  const M = Array.from({ length: 9 }, () => new Float64Array(n)); // S, Sx, Sy, Sxx, Sxy, Syy, Sz, Sxz, Syz
  for (let i = 0; i < obs.n; i++) {
    const wi = wts[i];
    if (!wi) continue;
    const k = cellOf(geom, obs.x[i], obs.y[i]), x = obs.x[i], y = obs.y[i], z = obs.z[i];
    M[0][k] += wi; M[1][k] += wi * x; M[2][k] += wi * y; M[3][k] += wi * x * x; M[4][k] += wi * x * y;
    M[5][k] += wi * y * y; M[6][k] += wi * z; M[7][k] += wi * x * z; M[8][k] += wi * y * z;
  }
  const B = M.map((arr) => blur(arr, geom.w, geom.h, radius / geom.cell));
  const z = new Float32Array(n);
  for (let r = 0; r < geom.h; r++) for (let c = 0; c < geom.w; c++) {
    const k = r * geom.w + c, S = B[0][k];
    if (S < 1e-6) { z[k] = NaN; continue; }
    const cx = geom.x0 + (c + 0.5) * geom.cell, cy = geom.y0 + (r + 0.5) * geom.cell;
    // Moments about the cell centre.
    const su = B[1][k] - cx * S, sv = B[2][k] - cy * S;
    const suu = B[3][k] - 2 * cx * B[1][k] + cx * cx * S, svv = B[5][k] - 2 * cy * B[2][k] + cy * cy * S;
    const suv = B[4][k] - cx * B[2][k] - cy * B[1][k] + cx * cy * S;
    const sz = B[6][k], suz = B[7][k] - cx * sz, svz = B[8][k] - cy * sz;
    // Normal equations [S su sv; su suu suv; sv suv svv]·[b0 b1 b2] = [sz suz svz], small ridge on the slopes.
    const ridge = 1e-6 * S * geom.cell * geom.cell;
    const a11 = S, a12 = su, a13 = sv, a22 = suu + ridge, a23 = suv, a33 = svv + ridge;
    const det = a11 * (a22 * a33 - a23 * a23) - a12 * (a12 * a33 - a23 * a13) + a13 * (a12 * a23 - a22 * a13);
    if (!(Math.abs(det) > 1e-9 * S * S * S)) { z[k] = sz / S; continue; }
    z[k] = (sz * (a22 * a33 - a23 * a23) - a12 * (suz * a33 - a23 * svz) + a13 * (suz * a23 - a22 * svz)) / det;
  }
  return fillNearest({ ...geom, z });
}

// Weights are recomputed from the current residuals on every pass; `base` = 0 excludes a point for good
// (used by the coarse level of the hierarchy).
function robustLevel(obs, base, geom, prm, radius) {
  const wts = Float32Array.from(base);
  let surf = fit(obs, wts, geom, radius), g = 0;
  for (let it = 0; it < prm.iterations; it++) {
    const v = new Float32Array(obs.n);
    let sNeg = 0, nNeg = 0;
    for (let i = 0; i < obs.n; i++) {
      v[i] = obs.z[i] - sample(surf, obs.x[i], obs.y[i]);
      if (v[i] < 0) { sNeg += v[i]; nNeg++; }
    }
    g = nNeg ? sNeg / nNeg : 0;
    for (let i = 0; i < obs.n; i++) wts[i] = base[i] && Number.isFinite(v[i]) ? weight(v[i], g, prm) : 0;
    surf = fit(obs, wts, geom, radius);
  }
  return { surf, g };
}

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const geom = gridFor(points, prm.cell);
  // Observations: the lowest point of each half-cell, which keeps the passes fast on dense clouds.
  const obs = thinLowest(points, prm.cell / 2);
  const base = new Float32Array(obs.n).fill(1);
  if (prm.hierarchical) {
    // Coarse level: a wide kernel spans large roofs, so observations far above it are left out.
    const coarse = robustLevel(obs, base, gridFor(points, prm.cell * 4), prm, prm.radius * 4);
    for (let i = 0; i < obs.n; i++) {
      if (obs.z[i] - sample(coarse.surf, obs.x[i], obs.y[i]) > coarse.g + prm.w) base[i] = 0;
    }
  }
  const { surf, g } = robustLevel(obs, base, geom, prm, prm.radius);
  const ground = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    const v = points.z[i] - sample(surf, points.x[i], points.y[i]);
    ground[i] = v <= prm.finalTol && v >= -2 ? 1 : 0;
  }
  return { ground, surface: surf, g };
}
