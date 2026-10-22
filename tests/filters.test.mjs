// Ground filters: the deck's PMF table, the synthetic scene of the PMF animation, and a regression
// guard on a real tile of the Cooper cloud (tests/fixtures, cut by scripts/make_fixture.py).
import test from 'node:test';
import assert from 'node:assert/strict';
import { FILTERS, byId } from '../core/filters/index.mjs';
import { schedule } from '../core/filters/pmf.mjs';
import { weight } from '../core/filters/robust.mjs';
import { confusion } from '../core/metrics.mjs';
import { scene, groundShare } from './synthetic.mjs';
import { loadFixture } from './load_fixture.mjs';

test('PMF schedule reproduces the deck table (c = 1 m, s = 0.3, dh0 = 0.5 m, dhmax = 3 m)', () => {
  const s = schedule({ cell: 1, slope: 0.3, dh0: 0.5, dhMax: 3, maxWindow: 33, exponential: true });
  assert.deepEqual(s.map((r) => r.window), [3, 5, 9, 17, 33]);
  assert.deepEqual(s.map((r) => +r.dh.toFixed(2)), [0.5, 1.1, 1.7, 2.9, 3]);
  assert.equal(+s[4].dhRaw.toFixed(2), 5.3, 'the computed 5.3 m is cut by the 3 m cap');
});

test('robust interpolation weight function: 1 below g, falling above it, 0 beyond g + w', () => {
  const p = { a: 2, b: 4, w: 2 };
  assert.equal(weight(-1, -0.2, p), 1);
  assert.ok(Math.abs(weight(0.3, -0.2, p) - 0.5) < 1e-12, 'half weight at g + 1/a');
  assert.equal(weight(2, -0.2, p), 0);
});

const P = scene();
const share = (id, prm) => groundShare(P, byId[id].run(P, prm).ground);

test('synthetic scene: every filter keeps the terrain and the hill', () => {
  for (const f of FILTERS) {
    if (f.id === 'blockmin') continue;
    assert.ok(share(f.id).ground > 0.98, `${f.id} keeps ground`);
  }
});

test('synthetic scene: pole, car, tree, house and shed are removed by the full-scene filters', () => {
  for (const id of ['pmf', 'smrf', 'ptd', 'robust', 'csf']) {
    const s = share(id);
    for (const obj of ['pole', 'car', 'tree', 'house', 'shed']) assert.ok(s[obj] < 0.02, `${id} removes ${obj}: ${s[obj]}`);
  }
});

test('deck limitations hold: slope radius below half the shed, MCC on buildings, block minimum', () => {
  assert.ok(share('slope').shed > 0.2, 'a 5 m radius leaves the middle of a 26 m roof as ground');
  assert.ok(share('slope', { radius: 15 }).shed < 0.02, 'a radius beyond half the roof removes it');
  const m = share('mcc');
  assert.ok(m.tree < 0.02 && m.shed > 0.2, 'MCC handles vegetation, not large buildings');
  assert.ok(share('blockmin').house > 0.5, 'small blocks accept roofs');
  assert.ok(share('blockmin', { cell: 30 }).ground < 0.5, 'large blocks lose the ground on slopes');
});

test('real tile: defaults stay at their measured agreement with the reference (κ)', () => {
  const { points } = loadFixture();
  const floor = { slope: 0.8, pmf: 0.75, smrf: 0.93, ptd: 0.9, robust: 0.84, csf: 0.82, mcc: 0.95, blockmin: 0.6 };
  for (const f of FILTERS) {
    const c = confusion(points.cls, f.run(points).ground);
    assert.ok(c.kappa >= floor[f.id], `${f.id}: κ ${c.kappa.toFixed(3)} < ${floor[f.id]}`);
  }
});
