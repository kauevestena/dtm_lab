// Cloth simulation filter, CSF (Zhang et al., 2016).
// The cloud is turned upside down and a cloth of particles linked by springs falls onto it under
// gravity. Particles that reach the inverted surface stick there; rigidity keeps the cloth from sinking
// into the cavities left by buildings and trees. Points close to the final cloth are ground.
import { gridFor, minGrid, fillNearest, sample } from '../grid.mjs';

export const id = 'csf';
export const defaults = { resolution: 1, rigidness: 3, threshold: 0.5, iterations: 500, timeStep: 0.65 };
export const params = [
  { key: 'resolution', min: 0.25, max: 4, step: 0.25, unit: 'm' },
  { key: 'rigidness', min: 1, max: 3, step: 1, unit: '' },
  { key: 'threshold', min: 0.05, max: 3, step: 0.05, unit: 'm' },
  { key: 'iterations', min: 50, max: 1000, step: 50, unit: '' },
];

const GRAVITY = 0.2;     // CSF's per-step displacement scale (gravity × time step², as in the reference code)
const DAMPING = 0.01;

export function run(points, p = {}) {
  const prm = { ...defaults, ...p };
  const geom = gridFor(points, prm.resolution);
  const { w, h } = geom, n = w * h;
  // Inverted lowest surface: the highest inverted point under each particle stops it ("IHV").
  const low = fillNearest(minGrid(points, geom));
  const ihv = new Float32Array(n);
  let top = -Infinity;
  for (let k = 0; k < n; k++) { ihv[k] = -low.z[k]; if (ihv[k] > top) top = ihv[k]; }
  const pos = new Float32Array(n).fill(top + 1), prev = new Float32Array(n).fill(top + 1);
  const movable = new Uint8Array(n).fill(1);
  const dt2 = prm.timeStep * prm.timeStep;
  // Each rigidness level adds one round of spring relaxation per step (1 = soft, 3 = stiff).
  const springRounds = prm.rigidness;
  let it = 0;
  for (; it < prm.iterations; it++) {
    let maxMove = 0;
    for (let k = 0; k < n; k++) {
      if (!movable[k]) continue;
      const cur = pos[k];
      pos[k] = cur + (cur - prev[k]) * (1 - DAMPING) - GRAVITY * dt2;
      prev[k] = cur;
    }
    for (let s = 0; s < springRounds; s++) {
      for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const k = r * w + c;
        if (c < w - 1) relax(k, k + 1);
        if (r < h - 1) relax(k, k + w);
      }
    }
    for (let k = 0; k < n; k++) {
      if (movable[k] && pos[k] <= ihv[k]) { pos[k] = ihv[k]; prev[k] = ihv[k]; movable[k] = 0; }
      const mv = Math.abs(pos[k] - prev[k]);
      if (movable[k] && mv > maxMove) maxMove = mv;
    }
    if (it > 10 && maxMove < 0.005) break;
  }
  function relax(a, b) {
    const ma = movable[a], mb = movable[b];
    if (!ma && !mb) return;
    const d = pos[b] - pos[a];
    if (ma && mb) { pos[a] += d / 2; pos[b] -= d / 2; }
    else if (ma) pos[a] += d / 2;
    else pos[b] -= d / 2;
  }
  // Back to the upright frame: the cloth height below each point.
  const cloth = { ...geom, z: Float32Array.from(pos, (v) => -v) };
  const ground = new Uint8Array(points.n);
  for (let i = 0; i < points.n; i++) {
    ground[i] = Math.abs(points.z[i] - sample(cloth, points.x[i], points.y[i])) <= prm.threshold ? 1 : 0;
  }
  return { ground, surface: cloth, iterations: it };
}
