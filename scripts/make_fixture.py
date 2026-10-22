"""Cut a small tile from the full COPC for the tests: a COPC (browser test) and a raw binary (node tests).

Usage (conda env with python-pdal):
  python scripts/make_fixture.py <cloud.copc.laz> <out_dir> <xmin> <ymin> <size> [resolution]

The raw binary is little-endian: Float32 x[n], y[n], z[n] (x, y relative to the tile's lower-left
corner) followed by Uint8 cls[n]; <name>.json holds n, origin, size and the class counts.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pdal


def main():
    src, out, xmin, ymin, size = sys.argv[1], Path(sys.argv[2]), *map(float, sys.argv[3:6])
    res = float(sys.argv[6]) if len(sys.argv) > 6 else 0.12  # ≈ COPC depth 5 for this cloud
    out.mkdir(parents=True, exist_ok=True)
    bounds = f"([{xmin},{xmin + size}],[{ymin},{ymin + size}])"
    pipe = pdal.Pipeline(json.dumps([
        {"type": "readers.copc", "filename": src, "bounds": bounds, "resolution": res},
        {"type": "writers.copc", "filename": str(out / "tile.copc.laz"),
         "scale_x": 0.001, "scale_y": 0.001, "scale_z": 0.001,
         "offset_x": "auto", "offset_y": "auto", "offset_z": "auto"},
    ]))
    pipe.execute()
    a = pipe.arrays[0]
    x = (a["X"] - xmin).astype("<f4")
    y = (a["Y"] - ymin).astype("<f4")
    z = a["Z"].astype("<f4")
    cls = a["Classification"].astype("u1")
    with open(out / "tile.bin", "wb") as f:
        for arr in (x, y, z, cls):
            f.write(arr.tobytes())
    counts = {int(k): int(v) for k, v in zip(*np.unique(cls, return_counts=True))}
    meta = {"n": int(len(a)), "origin": [xmin, ymin], "size": [size, size], "resolution": res,
            "classes": counts, "source": Path(src).name}
    (out / "tile.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
