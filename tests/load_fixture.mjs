// Loads tests/fixtures/<name>.bin + .json (see scripts/make_fixture.py) as a point set.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function loadFixture(name = 'tile') {
  const meta = JSON.parse(fs.readFileSync(path.join(DIR, `${name}.json`), 'utf8'));
  const buf = fs.readFileSync(path.join(DIR, `${name}.bin`));
  const n = meta.n, ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return {
    meta,
    points: {
      n,
      x: new Float32Array(ab, 0, n), y: new Float32Array(ab, 4 * n, n), z: new Float32Array(ab, 8 * n, n),
      cls: new Uint8Array(ab, 12 * n, n),
    },
  };
}
