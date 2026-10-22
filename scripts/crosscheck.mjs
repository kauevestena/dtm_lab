// Compares the JS ports with PDAL on the same points (output of scripts/crosscheck_pdal.py).
// Usage: node scripts/crosscheck.mjs <crosscheck.bin>
import fs from 'node:fs';
import { byId } from '../core/filters/index.mjs';
import { confusion } from '../core/metrics.mjs';

const buf = fs.readFileSync(process.argv[2]);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const n = new Uint32Array(ab, 0, 1)[0];
let off = 4;
const f32 = () => { const a = new Float32Array(ab.slice(off, off + 4 * n)); off += 4 * n; return a; };
const u8 = () => { const a = new Uint8Array(ab.slice(off, off + n)); off += n; return a; };
const points = { n, x: f32(), y: f32(), z: f32(), cls: u8() };
const pdal = { smrf: u8(), pmf: u8(), csf: u8() };
const rows = [];
for (const id of ['smrf', 'pmf', 'csf']) {
  const js = byId[id].run(points).ground;
  let same = 0;
  for (let i = 0; i < n; i++) if (js[i] === pdal[id][i]) same++;
  const cj = confusion(points.cls, js), cp = confusion(points.cls, pdal[id]);
  rows.push({
    filter: id, agreement: +(same / n).toFixed(4),
    js: { typeI: +cj.typeI.toFixed(4), typeII: +cj.typeII.toFixed(4), kappa: +cj.kappa.toFixed(4) },
    pdal: { typeI: +cp.typeI.toFixed(4), typeII: +cp.typeII.toFixed(4), kappa: +cp.kappa.toFixed(4) },
  });
}
console.log(JSON.stringify({ n, rows }, null, 2));
