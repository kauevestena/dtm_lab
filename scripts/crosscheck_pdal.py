"""Run PDAL's SMRF, PMF and CSF on one tile and save the points with PDAL's labels, so the JS ports
can be compared point by point (scripts/crosscheck.mjs).

Usage (conda env with python-pdal):
  python scripts/crosscheck_pdal.py <cloud.copc.laz> <out.bin> <xmin> <ymin> <size> [resolution]

Output, little-endian: Uint32 n, then Float32 x[n], y[n] (relative to xmin, ymin), z[n],
Uint8 cls[n], smrf[n], pmf[n], csf[n] (1 = ground).
Parameters match the JS defaults (core/filters/*.mjs); all returns are filtered, as in the JS code.
"""
import json
import sys

import numpy as np
import pdal

FILTERS = {
    "smrf": {"type": "filters.smrf", "cell": 1.0, "slope": 0.15, "window": 18, "threshold": 0.5,
             "scalar": 1.25, "returns": "first,intermediate,last,only"},
    "pmf": {"type": "filters.pmf", "cell_size": 1.0, "max_window_size": 33, "slope": 0.3,
            "initial_distance": 0.5, "max_distance": 3.0, "exponential": True,
            "returns": "first,intermediate,last,only"},
    "csf": {"type": "filters.csf", "resolution": 1.0, "rigidness": 3, "threshold": 0.5,
            "iterations": 500, "step": 0.65},
}


def main():
    src, out, xmin, ymin, size = sys.argv[1], sys.argv[2], *map(float, sys.argv[3:6])
    res = float(sys.argv[6]) if len(sys.argv) > 6 else 0.24
    bounds = f"([{xmin},{xmin + size}],[{ymin},{ymin + size}])"
    base = None
    labels = {}
    for name, flt in FILTERS.items():
        p = pdal.Pipeline(json.dumps([
            {"type": "readers.copc", "filename": src, "bounds": bounds, "resolution": res},
            {"type": "filters.ferry", "dimensions": "Classification=>RefClass"},
            {"type": "filters.assign", "value": "Classification = 1"},
            flt,
        ]))
        p.execute()
        a = np.sort(p.arrays[0], order=["X", "Y", "Z"])
        if base is None:
            base = a
        assert len(a) == len(base) and np.array_equal(a["X"], base["X"]), "point order differs between runs"
        labels[name] = (a["Classification"] == 2).astype("u1")
    with open(out, "wb") as f:
        f.write(np.uint32(len(base)).tobytes())
        f.write((base["X"] - xmin).astype("<f4").tobytes())
        f.write((base["Y"] - ymin).astype("<f4").tobytes())
        f.write(base["Z"].astype("<f4").tobytes())
        f.write(base["RefClass"].astype("u1").tobytes())
        for name in FILTERS:
            f.write(labels[name].tobytes())
    print(json.dumps({"n": int(len(base)), **{k: float(v.mean()) for k, v in labels.items()}}))


if __name__ == "__main__":
    main()
