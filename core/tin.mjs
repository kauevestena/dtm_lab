// Delaunay TIN helpers: triangulation and rasterisation with linear (barycentric) heights.
import Delaunator from '../vendor/delaunator-5.0.1/index.js';

export function triangulate(x, y, n = x.length) {
  const coords = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { coords[2 * i] = x[i]; coords[2 * i + 1] = y[i]; }
  return new Delaunator(coords).triangles;
}

// Rasterises the TIN on `geom` (cell centres). Returns { z, tri } where tri[k] is the triangle index
// covering cell k (−1 outside the hull) and z its linear height there (NaN outside).
export function rasterize(x, y, z, triangles, geom) {
  const { w, h, cell, x0, y0 } = geom;
  const out = new Float32Array(w * h).fill(NaN), tri = new Int32Array(w * h).fill(-1);
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t], b = triangles[t + 1], c = triangles[t + 2];
    const ax = x[a], ay = y[a], bx = x[b], by = y[b], cx = x[c], cy = y[c];
    const det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(det) < 1e-12) continue;
    const c0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell - 0.5));
    const c1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell - 0.5));
    const r0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cell - 0.5));
    const r1 = Math.min(h - 1, Math.ceil((Math.max(ay, by, cy) - y0) / cell - 0.5));
    for (let r = r0; r <= r1; r++) {
      const py = y0 + (r + 0.5) * cell;
      for (let cc = c0; cc <= c1; cc++) {
        const px = x0 + (cc + 0.5) * cell;
        const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / det;
        const l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
        const k = r * w + cc;
        out[k] = l1 * z[a] + l2 * z[b] + l3 * z[c];
        tri[k] = t / 3;
      }
    }
  }
  return { z: out, tri };
}

// Plane of triangle t: returns [nx, ny, nz, d] with unit normal (nz > 0) and n·p + d = 0.
export function plane(x, y, z, triangles, t) {
  const a = triangles[3 * t], b = triangles[3 * t + 1], c = triangles[3 * t + 2];
  const ux = x[b] - x[a], uy = y[b] - y[a], uz = z[b] - z[a];
  const vx = x[c] - x[a], vy = y[c] - y[a], vz = z[c] - z[a];
  let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
  nx /= len; ny /= len; nz /= len;
  return [nx, ny, nz, -(nx * x[a] + ny * y[a] + nz * z[a])];
}
