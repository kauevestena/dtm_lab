import test from 'node:test';
import assert from 'node:assert/strict';
import { makeIndex, fillNearest, window, open, openSquare, erode, erodeDiamond, dilateDiamond, sample } from '../core/grid.mjs';

const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const grid = (w, h, f) => ({ w, h, cell: 1, x0: 0, y0: 0, z: Float32Array.from({ length: w * h }, (_, k) => f(k % w, Math.floor(k / w))) });

test('k-nearest search matches brute force', () => {
  const n = 1500, P = { n, x: new Float32Array(n), y: new Float32Array(n), z: new Float32Array(n) };
  for (let i = 0; i < n; i++) { P.x[i] = rand() * 40; P.y[i] = rand() * 40; }
  const ix = makeIndex(P, 1.5);
  for (let t = 0; t < 100; t++) {
    const qx = rand() * 50 - 5, qy = rand() * 50 - 5;
    const got = ix.knn(qx, qy, 7).map((e) => e[1]);
    const want = [...Array(n).keys()].sort((i, j) => ((P.x[i] - qx) ** 2 + (P.y[i] - qy) ** 2) - ((P.x[j] - qx) ** 2 + (P.y[j] - qy) ** 2)).slice(0, 7);
    assert.deepEqual(got, want);
  }
});

test('separable square opening equals the brute-force opening', () => {
  const g = grid(23, 17, () => rand() * 10);
  g.z[5] = NaN;
  for (const r of [1, 2, 4]) assert.deepEqual(openSquare(g, r).z, open(g, window(r, 'square')).z);
});

test('r repeated diamond steps equal one erosion with the radius-r diamond', () => {
  const g = grid(21, 19, () => rand() * 10);
  const diamond = (r) => { const o = []; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.abs(dx) + Math.abs(dy) <= r) o.push([dx, dy]); return o; };
  assert.deepEqual(erodeDiamond(g, 3).z, erode(g, diamond(3)).z);
  assert.ok(dilateDiamond(g, 2).z.every((v, k) => v >= g.z[k]));
});

test('nearest fill copies the closest filled cell; bilinear sample is exact on a plane', () => {
  const g = grid(5, 5, (c, r) => (c === 0 && r === 0 ? 1 : c === 4 && r === 4 ? 9 : NaN));
  const f = fillNearest(g);
  assert.equal(f.z[1], 1);
  assert.equal(f.z[23], 9);
  const p = grid(10, 10, (c, r) => 2 * (c + 0.5) + 3 * (r + 0.5));
  assert.ok(Math.abs(sample(p, 4.3, 6.1) - (2 * 4.3 + 3 * 6.1)) < 1e-4);
});
