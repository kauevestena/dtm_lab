// Decode worker (classic script, so it can load Potree's copc.js): reads its share of a tile's
// COPC nodes and returns the points inside the box.
importScripts('../vendor/potree-1.8.2/libs/copc/index.js', 'copc_tile.js');

self.onmessage = async (e) => {
  const { id, url, box, maxDepth, part, parts } = e.data;
  try {
    const t = await readTile(url, box, { maxDepth, part, parts });
    self.postMessage({ id, ok: true, n: t.n, x: t.x, y: t.y, z: t.z, cls: t.cls, timings: t.timings, nodes: t.nodes, totalNodes: t.totalNodes, bounds: t.bounds, spacing: t.spacing },
      [t.x.buffer, t.y.buffer, t.z.buffer, t.cls.buffer]);
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
  }
};
