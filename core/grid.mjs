// Raster helpers shared by the filters and interpolators. Pure functions, no DOM.
// A grid is { w, h, cell, x0, y0, z: Float32Array } with row r covering y in [y0 + r·cell, y0 + (r+1)·cell).
// Empty cells hold NaN.

export function gridFor(points, cell) {
  let maxX = -Infinity, maxY = -Infinity, minX = Infinity, minY = Infinity;
  for (let i = 0; i < points.n; i++) {
    const x = points.x[i], y = points.y[i];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!points.n) { minX = minY = 0; maxX = maxY = cell; }
  const x0 = Math.floor(minX / cell) * cell, y0 = Math.floor(minY / cell) * cell;
  const w = Math.max(1, Math.floor((maxX - x0) / cell) + 1), h = Math.max(1, Math.floor((maxY - y0) / cell) + 1);
  return { w, h, cell, x0, y0 };
}

export const cellOf = (g, x, y) => {
  const c = Math.min(g.w - 1, Math.max(0, Math.floor((x - g.x0) / g.cell)));
  const r = Math.min(g.h - 1, Math.max(0, Math.floor((y - g.y0) / g.cell)));
  return r * g.w + c;
};

// Lowest elevation per cell; `mask` (optional) restricts the points used.
export function minGrid(points, geom, mask) {
  const z = new Float32Array(geom.w * geom.h).fill(NaN);
  for (let i = 0; i < points.n; i++) {
    if (mask && !mask[i]) continue;
    const k = cellOf(geom, points.x[i], points.y[i]);
    if (!(points.z[i] >= z[k])) z[k] = points.z[i];
  }
  return { ...geom, z };
}

// Fills NaN cells with the value of the nearest filled cell (two-pass chamfer propagation).
export function fillNearest(g) {
  const { w, h } = g, n = w * h;
  const src = new Int32Array(n).fill(-1), d = new Float32Array(n).fill(Infinity);
  for (let k = 0; k < n; k++) if (!Number.isNaN(g.z[k])) { src[k] = k; d[k] = 0; }
  const relax = (k, kk) => {
    if (src[kk] < 0) return;
    const s = src[kk], dx = (s % w) - (k % w), dy = Math.floor(s / w) - Math.floor(k / w), dd = dx * dx + dy * dy;
    if (dd < d[k]) { d[k] = dd; src[k] = s; }
  };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const k = r * w + c;
    if (c > 0) relax(k, k - 1);
    if (r > 0) { relax(k, k - w); if (c > 0) relax(k, k - w - 1); if (c < w - 1) relax(k, k - w + 1); }
  }
  for (let r = h - 1; r >= 0; r--) for (let c = w - 1; c >= 0; c--) {
    const k = r * w + c;
    if (c < w - 1) relax(k, k + 1);
    if (r < h - 1) { relax(k, k + w); if (c < w - 1) relax(k, k + w + 1); if (c > 0) relax(k, k + w - 1); }
  }
  const z = new Float32Array(n);
  for (let k = 0; k < n; k++) z[k] = src[k] < 0 ? NaN : g.z[src[k]];
  return { ...g, z };
}

// Offsets of a square (half-width r cells) or disk (radius r cells) structuring element.
export function window(r, shape = 'square') {
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (shape === 'disk' && dx * dx + dy * dy > r * r + 1e-9) continue;
    out.push([dx, dy]);
  }
  return out;
}

function morph(g, offsets, pick) {
  const { w, h } = g, out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let m = NaN;
    for (const [dx, dy] of offsets) {
      const rr = r + dy, cc = c + dx;
      if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
      const v = g.z[rr * w + cc];
      if (!Number.isNaN(v) && (Number.isNaN(m) || pick(v, m))) m = v;
    }
    out[r * w + c] = m;
  }
  return { ...g, z: out };
}

export const erode = (g, offsets) => morph(g, offsets, (v, m) => v < m);
export const dilate = (g, offsets) => morph(g, offsets, (v, m) => v > m);
export const open = (g, offsets) => dilate(erode(g, offsets), offsets);

// Bilinear sample at (x, y) using cell centres; falls back to the nearest cell at the borders.
export function sample(g, x, y) {
  const fx = (x - g.x0) / g.cell - 0.5, fy = (y - g.y0) / g.cell - 0.5;
  const c0 = Math.max(0, Math.min(g.w - 1, Math.floor(fx))), r0 = Math.max(0, Math.min(g.h - 1, Math.floor(fy)));
  const c1 = Math.min(g.w - 1, c0 + 1), r1 = Math.min(g.h - 1, r0 + 1);
  const tx = Math.max(0, Math.min(1, fx - c0)), ty = Math.max(0, Math.min(1, fy - r0));
  const z00 = g.z[r0 * g.w + c0], z10 = g.z[r0 * g.w + c1], z01 = g.z[r1 * g.w + c0], z11 = g.z[r1 * g.w + c1];
  if ([z00, z10, z01, z11].some(Number.isNaN)) return g.z[cellOf(g, x, y)];
  return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;
}

// Slope magnitude (rise over run) per cell by central differences.
export function gradient(g) {
  const { w, h, cell } = g, out = new Float32Array(w * h);
  const at = (r, c) => g.z[Math.max(0, Math.min(h - 1, r)) * w + Math.max(0, Math.min(w - 1, c))];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const gx = (at(r, c + 1) - at(r, c - 1)) / (2 * cell), gy = (at(r + 1, c) - at(r - 1, c)) / (2 * cell);
    out[r * w + c] = Math.hypot(gx, gy);
  }
  return { ...g, z: out };
}

// Subset of a point set by mask.
export function subset(points, mask) {
  let n = 0;
  for (let i = 0; i < points.n; i++) if (mask[i]) n++;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
  for (let i = 0, j = 0; i < points.n; i++) if (mask[i]) { x[j] = points.x[i]; y[j] = points.y[i]; z[j] = points.z[i]; j++; }
  return { n, x, y, z };
}

// One representative point per cell (the lowest), used to thin dense ground before interpolation.
export function thinLowest(points, cell) {
  const g = gridFor(points, cell), best = new Int32Array(g.w * g.h).fill(-1);
  for (let i = 0; i < points.n; i++) {
    const k = cellOf(g, points.x[i], points.y[i]);
    if (best[k] < 0 || points.z[i] < points.z[best[k]]) best[k] = i;
  }
  const keep = new Uint8Array(points.n);
  for (const i of best) if (i >= 0) keep[i] = 1;
  return subset(points, keep);
}

// One point per cell at the mean position and height of its points: an unbiased thinning of ground
// points before interpolation (the reference DTM goes through the same step, so the comparison is fair).
export function thinMean(points, cell) {
  const g = gridFor(points, cell), m = g.w * g.h;
  const sx = new Float64Array(m), sy = new Float64Array(m), sz = new Float64Array(m), cnt = new Uint32Array(m);
  for (let i = 0; i < points.n; i++) {
    const k = cellOf(g, points.x[i], points.y[i]);
    sx[k] += points.x[i]; sy[k] += points.y[i]; sz[k] += points.z[i]; cnt[k]++;
  }
  let n = 0;
  for (let k = 0; k < m; k++) if (cnt[k]) n++;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n);
  for (let k = 0, j = 0; k < m; k++) if (cnt[k]) { x[j] = sx[k] / cnt[k]; y[j] = sy[k] / cnt[k]; z[j] = sz[k] / cnt[k]; j++; }
  return { n, x, y, z };
}

// Uniform k-nearest search over a bucket grid. Returns indices sorted by distance.
export function makeIndex(points, bucket) {
  const g = gridFor(points, bucket), m = g.w * g.h;
  const start = new Uint32Array(m + 1), order = new Uint32Array(points.n);
  const key = new Uint32Array(points.n);
  for (let i = 0; i < points.n; i++) { key[i] = cellOf(g, points.x[i], points.y[i]); start[key[i] + 1]++; }
  for (let k = 0; k < m; k++) start[k + 1] += start[k];
  const fill = start.slice(0, m);
  for (let i = 0; i < points.n; i++) order[fill[key[i]]++] = i;
  // After ring R is scanned, any unseen point is at least R·bucket away, which bounds the search.
  function knn(x, y, k) {
    const c = Math.floor((x - g.x0) / bucket), r = Math.floor((y - g.y0) / bucket);
    let best = [];
    const maxRing = Math.max(g.w, g.h) + Math.abs(c) + Math.abs(r);
    for (let ring = 0; ring <= maxRing; ring++) {
      for (let rr = r - ring; rr <= r + ring; rr++) for (let cc = c - ring; cc <= c + ring; cc++) {
        if (Math.max(Math.abs(rr - r), Math.abs(cc - c)) !== ring) continue;
        if (rr < 0 || rr >= g.h || cc < 0 || cc >= g.w) continue;
        const b = rr * g.w + cc;
        for (let j = start[b]; j < start[b + 1]; j++) {
          const i = order[j];
          best.push([(points.x[i] - x) ** 2 + (points.y[i] - y) ** 2, i]);
        }
      }
      if (best.length >= k) {
        best.sort((p, q) => p[0] - q[0]);
        best = best.slice(0, k);
        const reach = ring * bucket;
        if (best[k - 1][0] <= reach * reach) return best;
      }
    }
    return best.sort((p, q) => p[0] - q[0]).slice(0, k);
  }
  return { knn, n: points.n };
}

// Separable square morphology (half-width r cells): two 1-D passes instead of (2r+1)² lookups.
function morphSquare(g, r, pick) {
  const { w, h } = g, tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  const pass = (src, dst, len, count, idx) => {
    for (let line = 0; line < count; line++) for (let i = 0; i < len; i++) {
      let m = NaN;
      for (let j = Math.max(0, i - r); j <= Math.min(len - 1, i + r); j++) {
        const v = src[idx(line, j)];
        if (!Number.isNaN(v) && (Number.isNaN(m) || pick(v, m))) m = v;
      }
      dst[idx(line, i)] = m;
    }
  };
  pass(g.z, tmp, w, h, (row, c) => row * w + c);
  pass(tmp, out, h, w, (col, row) => row * w + col);
  return { ...g, z: out };
}
export const erodeSquare = (g, r) => morphSquare(g, r, (v, m) => v < m);
export const dilateSquare = (g, r) => morphSquare(g, r, (v, m) => v > m);
export const openSquare = (g, r) => dilateSquare(erodeSquare(g, r), r);

// One step of morphology with the radius-1 diamond (centre + 4-neighbours). Repeating it r times
// equals morphology with the radius-r diamond, which is how PDAL's SMRF grows its window.
function diamond1(g, pick) {
  const { w, h } = g, z = g.z, out = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const k = r * w + c;
    let m = z[k];
    const take = (v) => { if (!Number.isNaN(v) && (Number.isNaN(m) || pick(v, m))) m = v; };
    if (c > 0) take(z[k - 1]);
    if (c < w - 1) take(z[k + 1]);
    if (r > 0) take(z[k - w]);
    if (r < h - 1) take(z[k + w]);
    out[k] = m;
  }
  return { ...g, z: out };
}
export const erodeDiamond = (g, r) => { for (let i = 0; i < r; i++) g = diamond1(g, (v, m) => v < m); return g; };
export const dilateDiamond = (g, r) => { for (let i = 0; i < r; i++) g = diamond1(g, (v, m) => v > m); return g; };
