// Reads every point of a COPC file inside an XY box, at full resolution.
// Classic worker script: it relies on the global `Copc` from Potree's bundled copc.js,
// loaded with importScripts by the caller.
/* global Copc */

const COPC_DIR = new URL('../vendor/potree-1.8.2/libs/copc/', self.location).href;
let lazPerfPromise = null;
const lazPerf = () => (lazPerfPromise ||= Copc.Las.PointData.createLazPerf({ locateFile: (f) => COPC_DIR + f }));

const copcCache = new Map();
function openCopc(url) {
  if (!copcCache.has(url)) copcCache.set(url, Copc.Copc.create(url));
  return copcCache.get(url);
}

const overlapsXY = (b, box) => b[0] <= box[2] && b[3] >= box[0] && b[1] <= box[3] && b[4] >= box[1];

// Collects the hierarchy nodes whose cube overlaps the box, following sub-pages lazily.
async function nodesInBox(url, copc, box, maxDepth) {
  const { Bounds, Key } = Copc;
  const cube = copc.info.cube;
  const out = [];
  const pending = [copc.info.rootHierarchyPage];
  while (pending.length) {
    const page = await Copc.Copc.loadHierarchyPage(url, pending.pop());
    for (const [key, node] of Object.entries(page.nodes)) {
      const k = Key.parse(key);
      if (node.pointCount > 0 && k[0] <= maxDepth && overlapsXY(Bounds.stepTo(cube, k), box)) out.push(node);
    }
    for (const [key, sub] of Object.entries(page.pages)) {
      const k = Key.parse(key);
      if (k[0] <= maxDepth && overlapsXY(Bounds.stepTo(cube, k), box)) pending.push(sub);
    }
  }
  return out;
}

// Returns { n, origin:[x0,y0], x, y (Float32, relative to origin), z (Float32), cls (Uint8), ... }.
// maxDepth caps the octree depth: each level halves the point spacing (copc.info.spacing at depth 0).
// PDRF 6-8 records start with X, Y, Z as int32 and keep Classification at byte 16, so the
// decompressed buffer is read directly instead of through per-point getters.
// `part`/`parts` split the node list between the workers of a pool (node i goes to worker i mod parts).
async function readTile(url, box, { maxDepth = Infinity, part = 0, parts = 1 } = {}) {
  const t0 = performance.now();
  const copc = await openCopc(url);
  const lp = await lazPerf();
  const all = await nodesInBox(url, copc, box, maxDepth);
  const nodes = all.filter((_, i) => i % parts === part);
  const t1 = performance.now();
  const buffers = await Promise.all(nodes.map((node) => Copc.Copc.loadPointDataBuffer(url, copc.header, node, lp)));
  const t2 = performance.now();
  const { scale, offset, pointDataRecordLength: rl, pointDataRecordFormat: fmt } = copc.header;
  if (fmt < 6) throw new Error(`COPC needs PDRF 6-8, got ${fmt}`);
  let cap = 0;
  for (const b of buffers) cap += b.byteLength / rl;
  const x = new Float32Array(cap), y = new Float32Array(cap), z = new Float32Array(cap), cls = new Uint8Array(cap);
  const [x0, y0] = box;
  let n = 0;
  for (const b of buffers) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const count = b.byteLength / rl;
    for (let i = 0, o = 0; i < count; i++, o += rl) {
      const px = dv.getInt32(o, true) * scale[0] + offset[0];
      const py = dv.getInt32(o + 4, true) * scale[1] + offset[1];
      if (px < box[0] || px >= box[2] || py < box[1] || py >= box[3]) continue;
      x[n] = px - x0; y[n] = py - y0;
      z[n] = dv.getInt32(o + 8, true) * scale[2] + offset[2];
      cls[n] = dv.getUint8(o + 16);
      n++;
    }
  }
  const t3 = performance.now();
  return {
    n, origin: [x0, y0],
    x: x.slice(0, n), y: y.slice(0, n), z: z.slice(0, n), cls: cls.slice(0, n),
    nodes: nodes.length, totalNodes: all.length, scanned: cap, spacing: copc.info.spacing,
    bounds: [...copc.header.min, ...copc.header.max],
    timings: { hierarchyMs: t1 - t0, fetchDecodeMs: t2 - t1, extractMs: t3 - t2 },
  };
}

self.readTile = readTile;
