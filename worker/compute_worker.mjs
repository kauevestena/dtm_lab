// Compute worker (module): keeps the current tile and runs the simulator pipeline on it.
import { run, reference, outputGeom } from '../core/pipeline.mjs';

let points = null, size = null, refCache = new Map();

self.onmessage = (e) => {
  const { id, type } = e.data;
  try {
    if (type === 'tile') {
      ({ points, size } = e.data);
      refCache = new Map();
      self.postMessage({ id, ok: true });
      return;
    }
    if (type === 'run') {
      const opts = { ...e.data.opts, size };
      const key = opts.cell;
      if (!refCache.has(key)) refCache.set(key, reference(points, outputGeom(size, opts.cell)));
      const r = run(points, { ...opts, ref: refCache.get(key) });
      const transfer = [r.outcome.buffer, r.dtm.buffer, r.dz.buffer];
      if (r.variance) transfer.push(r.variance.buffer);
      // The reference arrays are cached here, so they travel as copies.
      const ref = { measured: r.ref.measured.slice(), surface: r.ref.surface.slice(), zone: r.ref.zone.slice() };
      self.postMessage({ id, ok: true, result: { ...r, ref } }, transfer);
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: String((err && err.stack) || err) });
  }
};
