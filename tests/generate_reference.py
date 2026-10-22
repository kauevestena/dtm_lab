"""Numerical oracle for the interpolator tests: writes tests/numerical-reference.json.

Usage: python3 tests/generate_reference.py   (numpy + scipy)

30 samples of a smooth synthetic terrain on a 100 m × 100 m area (as in the deck's interpolation
slides) are interpolated on a 20 × 20 grid of 5 m cells with SciPy / NumPy:
  - tin: scipy.interpolate.griddata(method="linear")  (Delaunay + barycentric)
  - idw: brute-force inverse distance, power 2, all samples
  - tps: scipy.interpolate.RBFInterpolator(kernel="thin_plate_spline", degree=1, smoothing=0)
  - kriging: ordinary kriging with a fixed spherical model, all samples, solved with numpy.linalg.solve
"""
import json
from pathlib import Path

import numpy as np
from scipy.interpolate import RBFInterpolator, griddata

rng = np.random.default_rng(20261022)
N = 30
x = rng.uniform(2, 98, N)
y = rng.uniform(2, 98, N)


def terrain(x, y):
    return 100 + 3 * np.sin(x / 18) + 2 * np.cos(y / 23) + 0.02 * x + 1.5 * np.exp(-((x - 60) ** 2 + (y - 35) ** 2) / 300)


z = terrain(x, y)
cell, w, h = 5.0, 20, 20
cx = (np.arange(w) + 0.5) * cell
cy = (np.arange(h) + 0.5) * cell
GX, GY = np.meshgrid(cx, cy)  # row r ↔ y, column c ↔ x, row-major like the JS rasters
q = np.column_stack([GX.ravel(), GY.ravel()])
s = np.column_stack([x, y])

tin = griddata(s, z, q, method="linear")

d = np.hypot(q[:, None, 0] - x[None, :], q[:, None, 1] - y[None, :])
wts = 1 / np.maximum(d, 1e-12) ** 2
idw = (wts * z).sum(1) / wts.sum(1)

tps = RBFInterpolator(s, z, kernel="thin_plate_spline", degree=1, smoothing=0)(q)

MODEL = {"nugget": 0.0, "sill": 4.0, "range": 60.0}


def sph(hh):
    hh = np.asarray(hh, float)
    r, c0, c = MODEL["range"], MODEL["nugget"], MODEL["sill"]
    g = np.where(hh >= r, c0 + c, c0 + c * (1.5 * hh / r - 0.5 * (hh / r) ** 3))
    return np.where(hh <= 0, 0.0, g)


A = np.ones((N + 1, N + 1))
A[:N, :N] = sph(np.hypot(x[:, None] - x[None, :], y[:, None] - y[None, :]))
A[N, N] = 0
krig, kvar = [], []
for qx, qy in q:
    b = np.ones(N + 1)
    b[:N] = sph(np.hypot(x - qx, y - qy))
    sol = np.linalg.solve(A, b)
    krig.append(float(sol[:N] @ z))
    kvar.append(float(sol[:N] @ b[:N] + sol[N]))

clean = lambda a: [None if not np.isfinite(v) else round(float(v), 9) for v in a]
out = {
    "samples": {"x": clean(x), "y": clean(y), "z": clean(z)},
    "grid": {"w": w, "h": h, "cell": cell, "x0": 0, "y0": 0},
    "truth": clean(terrain(q[:, 0], q[:, 1])),
    "tin": clean(tin), "idw": clean(idw), "tps": clean(tps),
    "kriging": {"model": MODEL, "z": clean(krig), "variance": clean(kvar)},
}
Path(__file__).with_name("numerical-reference.json").write_text(json.dumps(out))
print("wrote numerical-reference.json")
