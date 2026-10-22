// Interpolators against the SciPy/NumPy oracle (tests/generate_reference.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { byId } from '../core/interp/index.mjs';
import { spherical, experimental, fitSpherical } from '../core/interp/kriging.mjs';

const ref = JSON.parse(fs.readFileSync(new URL('./numerical-reference.json', import.meta.url)));
const S = { n: ref.samples.x.length, x: Float32Array.from(ref.samples.x), y: Float32Array.from(ref.samples.y), z: Float32Array.from(ref.samples.z) };
const G = ref.grid;

function compare(got, want, tol, label) {
  let worst = 0, n = 0;
  for (let k = 0; k < want.length; k++) {
    if (want[k] === null) { assert.ok(Number.isNaN(got[k]), `${label}: cell ${k} should be empty`); continue; }
    worst = Math.max(worst, Math.abs(got[k] - want[k])); n++;
  }
  assert.ok(n > 0);
  assert.ok(worst < tol, `${label}: max |Δ| ${worst} ≥ ${tol}`);
}

test('TIN equals scipy griddata(linear), including the empty cells outside the hull', () => {
  compare(byId.tin.run(S, G).z, ref.tin, 2e-3, 'tin');
});

test('IDW (power 2, all samples) equals the brute-force oracle', () => {
  compare(byId.idw.run(S, G, { power: 2, k: S.n }).z, ref.idw, 2e-3, 'idw');
});

test('thin-plate spline equals scipy RBFInterpolator(thin_plate_spline)', () => {
  compare(byId.tps.run(S, G, { maxSamples: 1000, smoothing: 0 }).z, ref.tps, 5e-3, 'tps');
});

test('ordinary kriging with a fixed model equals the numpy oracle (estimate and variance)', () => {
  const r = byId.kriging.run(S, G, { k: S.n, model: ref.kriging.model });
  compare(r.z, ref.kriging.z, 2e-3, 'kriging z');
  compare(r.variance, ref.kriging.variance, 2e-3, 'kriging variance');
});

test('kriging is exact at the samples and its variance vanishes there', () => {
  const g = { w: 1, h: 1, cell: 1e-3, x0: S.x[0] - 5e-4, y0: S.y[0] - 5e-4 };
  const r = byId.kriging.run(S, g, { k: 12, model: ref.kriging.model });
  assert.ok(Math.abs(r.z[0] - S.z[0]) < 0.02);
  assert.ok(r.variance[0] < 0.01);
});

test('spherical model: zero at the origin, sill at the range; the fit recovers a known model', () => {
  const m = { nugget: 0.2, sill: 3, range: 40 };
  assert.equal(spherical(0, m), 0);
  assert.ok(Math.abs(spherical(40, m) - 3.2) < 1e-12);
  const exp = Array.from({ length: 15 }, (_, i) => ({ h: (i + 0.5) * 4, g: spherical((i + 0.5) * 4, m), n: 100 }));
  const fit = fitSpherical(exp, 60);
  assert.ok(Math.abs(fit.range - 40) < 2, `range ${fit.range}`);
  assert.ok(Math.abs(fit.sill + fit.nugget - 3.2) < 0.1);
  assert.ok(experimental(S, 10, 50).length > 5);
});

test('natural neighbour stays within the sample range and reproduces a plane', () => {
  const r = byId.nn.run(S, G).z;
  const lo = Math.min(...S.z), hi = Math.max(...S.z);
  for (const v of r) assert.ok(v >= lo - 1e-6 && v <= hi + 1e-6);
  // Sibson weights reproduce linear functions; the discrete method does so up to the cell size.
  const P = { ...S, z: Float32Array.from(S.x, (x, i) => 10 + 0.1 * x - 0.05 * S.y[i]) };
  const fine = { w: 100, h: 100, cell: 1, x0: 0, y0: 0 };
  const z = byId.nn.run(P, fine).z;
  let worst = 0;
  for (let r0 = 30; r0 < 70; r0++) for (let c = 30; c < 70; c++) {
    worst = Math.max(worst, Math.abs(z[r0 * 100 + c] - (10 + 0.1 * (c + 0.5) - 0.05 * (r0 + 0.5))));
  }
  assert.ok(worst < 0.15, `plane error ${worst}`);
});

test('every interpolator beats a flat mean on the synthetic terrain (deck slides: 0.24–0.50 m)', () => {
  const mean = S.z.reduce((a, b) => a + b, 0) / S.n;
  const rmse = (z) => {
    let s = 0, n = 0;
    for (let k = 0; k < z.length; k++) if (Number.isFinite(z[k])) { s += (z[k] - ref.truth[k]) ** 2; n++; }
    return Math.sqrt(s / n);
  };
  const flat = rmse(new Float32Array(G.w * G.h).fill(mean));
  for (const id of ['tin', 'idw', 'nn', 'kriging', 'tps']) {
    const e = rmse(byId[id].run(S, G).z);
    assert.ok(e < flat * 0.6, `${id}: ${e} vs flat ${flat}`);
  }
});
