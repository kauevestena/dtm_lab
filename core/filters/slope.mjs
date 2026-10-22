// Slope-based filter (Vosselman, 2000).
// A point is ground when no neighbour within the search radius lies lower than the admissible drop
// for that distance: h(p) − h(q) ≤ dz0 + slope·d. Vosselman showed this is an erosion with a cone,
// so neighbours are taken from the lowest-point raster (one per cell) instead of every point.
import { gridFor, minGrid, cellOf } from '../grid.mjs';

export const id = 'slope';
export const defaults = { cell: 0.5, radius: 5, slope: 0.5, dz0: 0.5 };
export const params = [
  { key: 'cell', min: 0.25, max: 2, step: 0.25, unit: 'm' },
  { key: 'radius', min: 1, max: 30, step: 0.5, unit: 'm' },
  { key: 'slope', min: 0.05, max: 2, step: 0.05, unit: '' },
  { key: 'dz0', min: 0, max: 2, step: 0.05, unit: 'm' },
];

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const geom = gridFor(points, prm.cell);
  const low = minGrid(points, geom);
  const R = Math.ceil(prm.radius / prm.cell);
  // Cone offsets: admissible drop for each cell offset, by centre-to-centre distance.
  const cone = [];
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const d = Math.hypot(dx, dy) * prm.cell;
    if (d > prm.radius) continue;
    cone.push([dx, dy, prm.dz0 + prm.slope * d]);
  }
  // Cone erosion of the raster: the lowest admissible height for a point in each cell.
  const { w, h } = geom, floor = new Float32Array(w * h).fill(-Infinity);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let best = Infinity;
    for (const [dx, dy, drop] of cone) {
      const rr = r + dy, cc = c + dx;
      if (rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
      const v = low.z[rr * w + cc];
      if (!Number.isNaN(v) && v + drop < best) best = v + drop;
    }
    floor[r * w + c] = best;
  }
  const ground = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    ground[i] = points.z[i] <= floor[cellOf(geom, points.x[i], points.y[i])] ? 1 : 0;
  }
  return { ground, surface: { ...geom, z: low.z } };
}
