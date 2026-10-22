// Block minimum: keep the lowest point of each cell and accept everything within a band above it.
// Crude on its own; it survives as the seed step of the other filters.
import { gridFor, minGrid, cellOf } from '../grid.mjs';

export const id = 'blockmin';
export const defaults = { cell: 2, band: 0.3 };
export const params = [
  { key: 'cell', min: 0.25, max: 20, step: 0.25, unit: 'm' },
  { key: 'band', min: 0, max: 3, step: 0.05, unit: 'm' },
];

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const low = minGrid(points, gridFor(points, prm.cell));
  const ground = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    ground[i] = points.z[i] - low.z[cellOf(low, points.x[i], points.y[i])] <= prm.band ? 1 : 0;
  }
  return { ground, surface: low };
}
