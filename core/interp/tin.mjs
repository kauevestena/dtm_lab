// Linear TIN: a plane over each Delaunay triangle; only the three vertices weigh (barycentric).
import { triangulate, rasterize } from '../tin.mjs';

export const id = 'tin';
export const defaults = {};
export const params = [];

export function run(samples, geom) {
  const tris = triangulate(samples.x, samples.y, samples.n);
  return { z: rasterize(samples.x, samples.y, samples.z, tris, geom).z };
}
