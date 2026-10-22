import test from 'node:test';
import assert from 'node:assert/strict';
import { confusion, heightErrors, pecClass, minEquidistanceA, PEC_CLASSES } from '../core/metrics.mjs';

test('confusion matrix and Type I / II / total as defined in the deck (Sithole & Vosselman 2004)', () => {
  // ref:     G  G  G  G  O  O  O  O  O  G(20)
  const cls = Uint8Array.from([2, 2, 2, 2, 6, 5, 5, 6, 14, 20]);
  const gnd = Uint8Array.from([1, 1, 1, 0, 1, 0, 0, 0, 0, 0]);
  const c = confusion(cls, gnd);
  assert.deepEqual([c.a, c.b, c.c, c.d], [3, 2, 1, 4]);
  assert.equal(c.typeI, 2 / 5);
  assert.equal(c.typeII, 1 / 5);
  assert.equal(c.total, 3 / 10);
  assert.ok(Math.abs(c.kappa - 0.4) < 1e-12);
});

test('height errors: mean reveals bias, RMSE and LE90', () => {
  const ref = Float32Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, NaN]);
  const dtm = Float32Array.from([0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 1.0, 5]);
  const e = heightErrors(dtm, ref);
  assert.equal(e.n, 10);
  assert.ok(Math.abs(e.mean - 0.19) < 1e-6);
  assert.ok(Math.abs(e.rmse - Math.sqrt((9 * 0.01 + 1) / 10)) < 1e-6);
  assert.ok(Math.abs(e.le90 - 0.1) < 1e-6);
  assert.equal(heightErrors(dtm, ref, Uint8Array.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0])).n, 1);
});

test('PEC-PCD: the deck example, 1:25,000 with 10 m contours (class A: 90% under 2.7 m, RMSE ≤ 1.67 m)', () => {
  assert.equal(PEC_CLASSES[0].pec * 10, 2.7);
  assert.ok(Math.abs(PEC_CLASSES[0].ep * 10 - 1.6667) < 1e-3);
  assert.equal(pecClass({ n: 1, le90: 2.6, rmse: 1.6 }, 10), 'A');
  assert.equal(pecClass({ n: 1, le90: 2.8, rmse: 1.6 }, 10), 'B');
  assert.equal(pecClass({ n: 1, le90: 7.6, rmse: 1 }, 10), '—');
  assert.ok(Math.abs(minEquidistanceA({ n: 1, le90: 0.27, rmse: 0.1 }) - 1) < 1e-12);
});
