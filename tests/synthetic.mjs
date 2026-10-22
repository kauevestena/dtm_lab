// Synthetic scene after the deck's PMF animation: a hill on a gentle slope with a pole, a car, a tree,
// a house and a large shed. Returns points with reference classes and an `obj` label per point.
export const OBJECTS = ['ground', 'pole', 'car', 'tree', 'house', 'shed'];

export function terrainZ(x, y) {
  return 100 + 0.03 * x + 2.5 * Math.exp(-((x - 95) ** 2) / (2 * 9 ** 2)) + 0.2 * Math.sin(y / 5);
}

export function scene({ spacing = 0.25, seed = 1 } = {}) {
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const X = [], Y = [], Z = [], C = [], O = [];
  const push = (x, y, z, cls, obj) => { X.push(x); Y.push(y); Z.push(z); C.push(cls); O.push(obj); };
  const W = 130, H = 40;
  const boxes = [
    { obj: 1, x: [10, 10.4], y: [18, 18.4], top: 6 },     // pole
    { obj: 2, x: [22, 26.5], y: [15, 17], top: 1.5 },     // car
    { obj: 4, x: [44, 54], y: [12, 24], top: 6 },         // house
    { obj: 5, x: [62, 87], y: [6, 32], top: 8 },          // shed (26 m wide, flat roof)
  ];
  const tree = { x: 32, y: 26, r: 3.5, base: 4, top: 9 };
  const inBox = (x, y) => boxes.find((b) => x >= b.x[0] && x <= b.x[1] && y >= b.y[0] && y <= b.y[1]);
  for (let x = 0; x < W; x += spacing) for (let y = 0; y < H; y += spacing) {
    const px = x + (rnd() - 0.5) * spacing, py = y + (rnd() - 0.5) * spacing;
    const g = terrainZ(px, py), noise = (rnd() - 0.5) * 0.06;
    const b = inBox(px, py);
    if (b) { push(px, py, g + b.top + noise, b.obj === 1 ? 14 : b.obj === 2 ? 23 : 6, b.obj); continue; }
    const dt = Math.hypot(px - tree.x, py - tree.y);
    if (dt < tree.r) {
      // Crown returns plus one ground return in three under the canopy.
      push(px, py, g + tree.base + (tree.top - tree.base) * Math.sqrt(1 - (dt / tree.r) ** 2) * rnd(), 5, 3);
      if (rnd() < 0.33) push(px, py, g + noise, 2, 0);
      continue;
    }
    push(px, py, g + noise, 2, 0);
  }
  const n = X.length;
  return {
    n, x: Float32Array.from(X), y: Float32Array.from(Y), z: Float32Array.from(Z),
    cls: Uint8Array.from(C), obj: Uint8Array.from(O), size: [W, H],
  };
}

// Share of each object's points labelled ground.
export function groundShare(P, ground) {
  const tot = new Array(OBJECTS.length).fill(0), g = new Array(OBJECTS.length).fill(0);
  for (let i = 0; i < P.n; i++) { tot[P.obj[i]]++; if (ground[i]) g[P.obj[i]]++; }
  return Object.fromEntries(OBJECTS.map((name, k) => [name, tot[k] ? g[k] / tot[k] : NaN]));
}
