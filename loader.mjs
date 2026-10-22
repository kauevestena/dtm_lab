// Reads a tile from the COPC with a pool of decode workers (decompression dominates: see FEASIBILITY.md §6)
// and merges their shares into one point set in tile coordinates.
const POOL = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
const workers = [];
let seq = 0;

function worker(i) {
  if (!workers[i]) workers[i] = new Worker(new URL('./worker/decode_worker.js', import.meta.url));
  return workers[i];
}

function call(w, msg) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const onMsg = (e) => {
      if (e.data.id !== id) return;
      w.removeEventListener('message', onMsg);
      e.data.ok ? resolve(e.data) : reject(new Error(e.data.error));
    };
    w.addEventListener('message', onMsg);
    w.postMessage({ ...msg, id });
  });
}

// box = [xmin, ymin, xmax, ymax] in the cloud's CRS; returns { points, origin, size, stats }.
export async function loadTile(url, box, maxDepth) {
  const t0 = performance.now();
  const parts = POOL;
  const shares = await Promise.all(Array.from({ length: parts }, (_, part) =>
    call(worker(part), { url, box, maxDepth, part, parts })));
  let n = 0;
  for (const s of shares) n += s.n;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), cls = new Uint8Array(n);
  let o = 0;
  for (const s of shares) { x.set(s.x, o); y.set(s.y, o); z.set(s.z, o); cls.set(s.cls, o); o += s.n; }
  const classes = {};
  for (let i = 0; i < n; i++) classes[cls[i]] = (classes[cls[i]] || 0) + 1;
  return {
    points: { n, x, y, z, cls },
    origin: [box[0], box[1]],
    size: [box[2] - box[0], box[3] - box[1]],
    stats: { n, classes, workers: parts, nodes: shares[0].totalNodes, ms: performance.now() - t0, bounds: shares[0].bounds, spacing: shares[0].spacing },
  };
}

// Header only (bounds, spacing), from one worker reading an empty box.
export async function cloudInfo(url) {
  const s = await call(worker(0), { url, box: [0, 0, 0, 0], maxDepth: 0, part: 0, parts: 1 });
  return { bounds: s.bounds, spacing: s.spacing };
}
