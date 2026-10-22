// Progressive TIN densification (Axelsson, 2000).
// Seeds are the lowest points of cells as large as the largest building; they form the first TIN.
// Each iteration, every triangle may take one candidate whose distance d to the facet and largest
// angle α to the facet's vertices are under the thresholds. Points within `finalTol` of the final
// TIN are labelled ground.
import { gridFor, cellOf } from '../grid.mjs';
import { triangulate, rasterize, plane } from '../tin.mjs';

export const id = 'ptd';
export const defaults = { seedCell: 30, maxAngle: 15, maxDist: 1.4, candidateCell: 1, finalTol: 0.3, maxIter: 200 };
export const params = [
  { key: 'seedCell', min: 5, max: 100, step: 1, unit: 'm' },
  { key: 'maxAngle', min: 1, max: 30, step: 0.5, unit: '°' },
  { key: 'maxDist', min: 0.1, max: 5, step: 0.1, unit: 'm' },
  { key: 'finalTol', min: 0.05, max: 2, step: 0.05, unit: 'm' },
];

function lowestPerCell(points, geom) {
  const best = new Int32Array(geom.w * geom.h).fill(-1);
  for (let i = 0; i < points.n; i++) {
    const k = cellOf(geom, points.x[i], points.y[i]);
    if (best[k] < 0 || points.z[i] < points.z[best[k]]) best[k] = i;
  }
  return best;
}

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const seedGeom = gridFor(points, prm.seedCell);
  const candGeom = gridFor(points, prm.candidateCell);
  const seeds = [...lowestPerCell(points, seedGeom)].filter((i) => i >= 0);
  const cand = [...lowestPerCell(points, candGeom)].filter((i) => i >= 0);
  // TIN vertices: seeds plus four corner points (height of the nearest seed) so the hull covers the tile.
  const vx = [], vy = [], vz = [];
  const add = (x, y, z) => { vx.push(x); vy.push(y); vz.push(z); };
  for (const i of seeds) add(points.x[i], points.y[i], points.z[i]);
  const ex = [candGeom.x0, candGeom.x0 + candGeom.w * candGeom.cell], ey = [candGeom.y0, candGeom.y0 + candGeom.h * candGeom.cell];
  for (const cx of ex) for (const cy of ey) {
    let best = seeds[0], bd = Infinity;
    for (const i of seeds) { const d = (points.x[i] - cx) ** 2 + (points.y[i] - cy) ** 2; if (d < bd) { bd = d; best = i; } }
    add(cx, cy, points.z[best]);
  }
  const inTin = new Uint8Array(points.n);
  for (const i of seeds) inTin[i] = 1;
  const tanMax = Math.tan((prm.maxAngle * Math.PI) / 180);
  let iter = 0;
  for (; iter < prm.maxIter; iter++) {
    const tris = triangulate(vx, vy);
    const ras = rasterize(vx, vy, vz, tris, candGeom);
    const pick = new Map(); // triangle → [candidate, distance]
    for (const i of cand) {
      if (inTin[i]) continue;
      const t = ras.tri[cellOf(candGeom, points.x[i], points.y[i])];
      if (t < 0) continue;
      const [nx, ny, nz, d0] = plane(vx, vy, vz, tris, t);
      const d = Math.abs(nx * points.x[i] + ny * points.y[i] + nz * points.z[i] + d0);
      if (d > prm.maxDist) continue;
      // α_j: angle at vertex j between the facet and the line to the point, tan α = d / horizontal reach.
      let ok = true;
      for (let j = 0; j < 3 && ok; j++) {
        const v = tris[3 * t + j];
        const reach = Math.hypot(points.x[i] - vx[v], points.y[i] - vy[v], points.z[i] - vz[v]);
        if (reach > 0 && d / Math.sqrt(Math.max(1e-12, reach * reach - d * d)) > tanMax) ok = false;
      }
      if (!ok) continue;
      const cur = pick.get(t);
      if (!cur || d < cur[1]) pick.set(t, [i, d]);
    }
    if (!pick.size) break;
    for (const [i] of pick.values()) { inTin[i] = 1; add(points.x[i], points.y[i], points.z[i]); }
  }
  const tris = triangulate(vx, vy);
  const surfGeom = gridFor(points, prm.candidateCell);
  const surf = rasterize(vx, vy, vz, tris, surfGeom);
  const ground = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    const t = surf.tri[cellOf(surfGeom, points.x[i], points.y[i])];
    if (t < 0) continue;
    const [nx, ny, nz, d0] = plane(vx, vy, vz, tris, t);
    // Vertical offset from the facet plane at the point.
    const zt = -(nx * points.x[i] + ny * points.y[i] + d0) / nz;
    ground[i] = Math.abs(points.z[i] - zt) <= prm.finalTol ? 1 : 0;
  }
  return { ground, surface: { ...surfGeom, z: surf.z }, iterations: iter, vertices: vx.length };
}
