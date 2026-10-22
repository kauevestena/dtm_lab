"""Whole-cloud products for the comparison page (comparacao.html).

Usage (conda env with python-pdal, numpy, scipy, GDAL):
  python scripts/build_products.py <cloud.copc.laz> <out_dir> [cell=0.5]

For each PDAL ground filter (SMRF, PMF, CSF; parameters = the JS defaults, all returns filtered):
  - classification errors against the reference classes (global and per cell);
  - DTMs from the filtered ground, thinned to one mean point per cell, by TIN (Delaunay, linear) and IDW
    (12 nearest, power 2), the same thinning and interpolators as the browser;
  - height errors against the measured reference (mean of class-2 points per cell) by zone.
Natural neighbour, kriging and thin-plate spline are left to the live lab: on a million samples they
need methods beyond the scope of this pipeline.

Outputs (row 0 = southern row, x grows to the east, like the JS rasters):
  manifest.json                  grid, metrics, file list
  ref_measured.u16 / ref_tin.u16 reference heights; Uint16 = round((z − zbase)·100), 65535 = empty
  zones.u8                       0 no data, 1 open, 2 vegetation, 3 building
  <filter>_<interp>.u16          DTMs, same encoding
  <filter>_t1.u8 / _t2.u8        per-cell Type I / Type II rates, round(rate·250), 255 = undefined
  cog/*.tif                      Float32 Cloud-Optimized GeoTIFFs of the DTMs (downloads)
"""
import json
import os
import sys
import time
from pathlib import Path

# Without an activated conda env, PROJ does not find its database and GeoTIFFs get no proper CRS.
os.environ.setdefault("PROJ_DATA", str(Path(sys.prefix) / "share" / "proj"))

import numpy as np  # noqa: E402
import pdal  # noqa: E402
from osgeo import gdal  # noqa: E402
from scipy.interpolate import griddata  # noqa: E402
from scipy.ndimage import binary_dilation  # noqa: E402
from scipy.spatial import cKDTree  # noqa: E402

gdal.UseExceptions()

FILTERS = {
    "smrf": {"type": "filters.smrf", "cell": 1.0, "slope": 0.15, "window": 18, "threshold": 0.5,
             "scalar": 1.25, "returns": "first,intermediate,last,only"},
    "pmf": {"type": "filters.pmf", "cell_size": 1.0, "max_window_size": 33, "slope": 0.3,
            "initial_distance": 0.5, "max_distance": 3.0, "exponential": True,
            "returns": "first,intermediate,last,only"},
    "csf": {"type": "filters.csf", "resolution": 1.0, "rigidness": 3, "threshold": 0.5,
            "iterations": 500, "step": 0.65},
}
REF_GROUND = (2, 20)
ZONES = {"all": None, "open": 1, "vegetation": 2, "building": 3}
# "voids": cells inside the survey (with points) but no measured ground, scored against the reference TIN
# (as core/pipeline.mjs).
EPSG = 31982


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


class Grid:
    def __init__(self, minx, miny, maxx, maxy, cell):
        self.cell = cell
        self.x0 = np.floor(minx / cell) * cell
        self.y0 = np.floor(miny / cell) * cell
        self.w = int(np.floor((maxx - self.x0) / cell)) + 1
        self.h = int(np.floor((maxy - self.y0) / cell)) + 1

    def index(self, x, y):
        c = np.clip(((x - self.x0) / self.cell).astype(np.int64), 0, self.w - 1)
        r = np.clip(((y - self.y0) / self.cell).astype(np.int64), 0, self.h - 1)
        return r * self.w + c

    def centres(self):
        cx = self.x0 + (np.arange(self.w) + 0.5) * self.cell
        cy = self.y0 + (np.arange(self.h) + 0.5) * self.cell
        gx, gy = np.meshgrid(cx, cy)
        return gx.ravel(), gy.ravel()


def cell_mean(g, x, y, z):
    k = g.index(x, y)
    n = np.bincount(k, minlength=g.w * g.h)
    s = np.bincount(k, weights=z, minlength=g.w * g.h)
    sx = np.bincount(k, weights=x, minlength=g.w * g.h)
    sy = np.bincount(k, weights=y, minlength=g.w * g.h)
    has = n > 0
    out = np.full(g.w * g.h, np.nan)
    out[has] = s[has] / n[has]
    return out, sx[has] / n[has], sy[has] / n[has], s[has] / n[has]


def tin(g, sx, sy, sz):
    gx, gy = g.centres()
    return griddata(np.column_stack([sx, sy]), sz, (gx, gy), method="linear")


def idw(g, sx, sy, sz, k=12, power=2):
    gx, gy = g.centres()
    d, i = cKDTree(np.column_stack([sx, sy])).query(np.column_stack([gx, gy]), k=k, workers=-1)
    d = np.maximum(d, 1e-9)
    w = 1 / d ** power
    out = (w * sz[i]).sum(1) / w.sum(1)
    exact = d[:, 0] < 1e-6
    out[exact] = sz[i[exact, 0]]
    return out


def height_errors(dtm, ref, mask):
    e = dtm - ref
    sel = np.isfinite(e) if mask is None else (np.isfinite(e) & mask)
    e = e[sel]
    if e.size == 0:
        return {"n": 0}
    a = np.sort(np.abs(e))
    return {
        "n": int(e.size), "mean": float(e.mean()), "rmse": float(np.sqrt((e ** 2).mean())),
        "std": float(e.std(ddof=1)) if e.size > 1 else 0.0,
        "le90": float(a[min(e.size - 1, int(np.ceil(0.9 * e.size)) - 1)]), "maxAbs": float(a[-1]),
    }


def confusion(ref_ground, ground):
    a = int(np.sum(ref_ground & ground)); b = int(np.sum(ref_ground & ~ground))
    c = int(np.sum(~ref_ground & ground)); d = int(np.sum(~ref_ground & ~ground))
    n = a + b + c + d
    po = (a + d) / n
    pe = ((a + b) * (a + c) + (c + d) * (b + d)) / n ** 2
    return {"a": a, "b": b, "c": c, "d": d, "n": n, "typeI": b / (a + b), "typeII": c / (c + d),
            "total": (b + c) / n, "kappa": (po - pe) / (1 - pe)}


def save_u16(path, z, zbase):
    q = np.full(z.shape, 65535, dtype="<u2")
    ok = np.isfinite(z)
    q[ok] = np.clip(np.round((z[ok] - zbase) * 100), 0, 65534).astype("<u2")
    path.write_bytes(q.tobytes())


def save_rate(path, num, den):
    q = np.full(num.shape, 255, dtype="u1")
    ok = den > 0
    q[ok] = np.round(num[ok] / den[ok] * 250).astype("u1")
    path.write_bytes(q.tobytes())


WKT = {"value": ""}  # the cloud's own WKT (from the LAS header): no PROJ database lookup needed


def save_cog(path, g, z):
    mem = gdal.GetDriverByName("MEM").Create("", g.w, g.h, 1, gdal.GDT_Float32)
    # GDAL rasters run north to south; ours run south to north.
    mem.SetGeoTransform((g.x0, g.cell, 0, g.y0 + g.h * g.cell, 0, -g.cell))
    mem.SetProjection(WKT["value"])
    band = mem.GetRasterBand(1)
    band.SetNoDataValue(-9999)
    band.WriteArray(np.flipud(np.where(np.isfinite(z), z, -9999).reshape(g.h, g.w)).astype(np.float32))
    gdal.GetDriverByName("COG").CreateCopy(str(path), mem, options=["COMPRESS=DEFLATE", "PREDICTOR=YES"])


def read(src, flt=None):
    stages = [{"type": "readers.copc", "filename": src, "threads": 8}]
    if flt:
        stages += [{"type": "filters.ferry", "dimensions": "Classification=>RefClass"},
                   {"type": "filters.assign", "value": "Classification = 1"}, flt]
    p = pdal.Pipeline(json.dumps(stages))
    p.execute()
    if not WKT["value"]:
        WKT["value"] = p.metadata["metadata"]["readers.copc"]["srs"]["wkt"]
    return p.arrays[0]


def main():
    src, out = sys.argv[1], Path(sys.argv[2])
    cell = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
    out.mkdir(parents=True, exist_ok=True)
    (out / "cog").mkdir(exist_ok=True)
    t0 = time.time()

    log("reading reference")
    a = read(src)
    x, y, z, cls = a["X"], a["Y"], a["Z"], a["Classification"]
    g = Grid(x.min(), y.min(), x.max(), y.max(), cell)
    zbase = float(np.floor(z.min()) - 1)
    log(f"grid {g.w}×{g.h} cells of {cell} m, zbase {zbase}")
    k = g.index(x, y)
    m = g.w * g.h
    zones = np.zeros(m, dtype="u1")
    zones[np.bincount(k, minlength=m) > 0] = 1
    zones[np.bincount(k[cls == 5], minlength=m) > 0] = 2
    zones[np.bincount(k[cls == 6], minlength=m) > 0] = 3
    # Survey footprint: cells with points, dilated by 2 cells to close small gaps. Outside it the TIN
    # would interpolate across unsurveyed land (the hull of an L-shaped survey), so rasters are masked.
    footprint = binary_dilation((zones > 0).reshape(g.h, g.w), iterations=2).ravel()
    g2 = cls == 2
    ref_measured, sx, sy, sz = cell_mean(g, x[g2], y[g2], z[g2])
    log(f"reference: {g2.sum()} class-2 points, {np.isfinite(ref_measured).sum()} measured cells, {footprint.sum()} footprint cells; TIN")
    ref_tin = tin(g, sx, sy, sz)
    ref_tin[~footprint] = np.nan
    save_u16(out / "ref_measured.u16", ref_measured, zbase)
    save_u16(out / "ref_tin.u16", ref_tin, zbase)
    (out / "zones.u8").write_bytes(zones.tobytes())
    save_cog(out / "cog" / "reference_tin.tif", g, ref_tin)
    zone_masks = {name: (None if v is None else zones == v) for name, v in ZONES.items()}
    class_counts = {int(c): int(n) for c, n in zip(*np.unique(cls, return_counts=True))}
    del a, x, y, z, cls, k

    results = {}
    for name, flt in FILTERS.items():
        t = time.time()
        log(f"{name}: PDAL")
        a = read(src, flt)
        ref_ground = np.isin(a["RefClass"], REF_GROUND)
        ground = a["Classification"] == 2
        conf = confusion(ref_ground, ground)
        k = g.index(a["X"], a["Y"])
        num1 = np.bincount(k[ref_ground & ~ground], minlength=m).astype(float)
        den1 = np.bincount(k[ref_ground], minlength=m).astype(float)
        num2 = np.bincount(k[~ref_ground & ground], minlength=m).astype(float)
        den2 = np.bincount(k[~ref_ground], minlength=m).astype(float)
        save_rate(out / f"{name}_t1.u8", num1, den1)
        save_rate(out / f"{name}_t2.u8", num2, den2)
        _, sx, sy, sz = cell_mean(g, a["X"][ground], a["Y"][ground], a["Z"][ground])
        filter_s = time.time() - t
        log(f"{name}: κ {conf['kappa']:.4f}, {sz.size} ground cells; interpolating")
        res = {"confusion": conf, "filterSeconds": round(filter_s, 1), "dtms": {}}
        for iname, fn in (("tin", tin), ("idw", idw)):
            ti = time.time()
            dtm = fn(g, sx, sy, sz)
            dtm[~footprint] = np.nan
            save_u16(out / f"{name}_{iname}.u16", dtm, zbase)
            save_cog(out / "cog" / f"{name}_{iname}.tif", g, dtm)
            res["dtms"][iname] = {
                "seconds": round(time.time() - ti, 1),
                "errors": {**{zn: height_errors(dtm, ref_measured, mk) for zn, mk in zone_masks.items()},
                           "voids": height_errors(dtm, ref_tin, (zones > 0) & ~np.isfinite(ref_measured))},
            }
            log(f"{name}/{iname}: RMSE all {res['dtms'][iname]['errors']['all']['rmse']:.3f} m")
        results[name] = res
        del a

    manifest = {
        "snapshot": "data-v1",
        "source": Path(src).name,
        "epsg": EPSG,
        "grid": {"w": g.w, "h": g.h, "cell": cell, "x0": g.x0, "y0": g.y0, "zbase": zbase,
                 "encoding": {"u16": "z = zbase + v/100, 65535 = empty", "u8": "rate = v/250, 255 = undefined",
                              "zones": "0 none, 1 open, 2 vegetation, 3 building"}},
        "classes": class_counts,
        "referenceGround": list(REF_GROUND),
        "filters": {k: v for k, v in FILTERS.items()},
        "interpolators": ["tin", "idw"],
        "results": results,
        "files": sorted(p.name for p in out.iterdir() if p.is_file() and p.name != "manifest.json"),
        "buildSeconds": round(time.time() - t0, 1),
    }
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1))
    log(f"done in {manifest['buildSeconds']} s")


if __name__ == "__main__":
    main()
