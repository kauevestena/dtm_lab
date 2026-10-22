// Spike: time a full-resolution tile read plus a naive morphological pass.
importScripts('../vendor/potree-1.8.2/libs/copc/index.js', '../worker/copc_tile.js');

function naiveOpening(t, cell, win) {
  let maxX = 0, maxY = 0;
  for (let i = 0; i < t.n; i++) { if (t.x[i] > maxX) maxX = t.x[i]; if (t.y[i] > maxY) maxY = t.y[i]; }
  const w = Math.ceil(maxX / cell) + 1, h = Math.ceil(maxY / cell) + 1;
  const g = new Float32Array(w * h).fill(Infinity);
  for (let i = 0; i < t.n; i++) {
    const k = Math.floor(t.y[i] / cell) * w + Math.floor(t.x[i] / cell);
    if (t.z[i] < g[k]) g[k] = t.z[i];
  }
  const er = new Float32Array(w * h), op = new Float32Array(w * h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let m = Infinity;
    for (let dr = -win; dr <= win; dr++) for (let dc = -win; dc <= win; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < h && cc >= 0 && cc < w && g[rr * w + cc] < m) m = g[rr * w + cc];
    }
    er[r * w + c] = m;
  }
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    let m = -Infinity;
    for (let dr = -win; dr <= win; dr++) for (let dc = -win; dc <= win; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < h && cc >= 0 && cc < w && er[rr * w + cc] > m) m = er[rr * w + cc];
    }
    op[r * w + c] = m;
  }
  return { w, h };
}

self.onmessage = async (e) => {
  try {
    const { url, box, maxDepth } = e.data;
    const t = await readTile(url, box, { maxDepth });
    const c0 = performance.now();
    const grid = naiveOpening(t, 1, 8);
    const computeMs = performance.now() - c0;
    const classes = {};
    for (let i = 0; i < t.n; i++) classes[t.cls[i]] = (classes[t.cls[i]] || 0) + 1;
    self.postMessage({ ok: true, n: t.n, scanned: t.scanned, nodes: t.nodes, timings: { ...t.timings, openingMs: computeMs }, grid, classes });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.stack || err) });
  }
};
