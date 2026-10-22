# DTM Lab

*[Português](README.pt-BR.md)*

A simulator for producing a digital terrain model (DTM) from a classified point cloud. The cloud's existing classification is the **reference**. Each ground filter reclassifies the cloud from scratch, and each interpolator builds a DTM from the filtered ground. Both are then scored against the reference: Type I/II errors and κ for the classification, and RMSEz, bias, LE90 and PEC-PCD for the heights. The algorithms and metrics follow the deck *Modelagem Digital de Terreno* (ground filtering, interpolation, quality).

It runs entirely in the browser. The cloud (69.4 M points, 459 MB) is streamed as **COPC** by HTTP range requests, and each page fetches only what it needs.

## Pages

- **`index.html`, the simulator.** It has four steps:
  1. Load a tile: pick a preset, type the centre, or double-click the Potree view. The tile size and octree depth are adjustable.
  2. Choose a ground filter and its parameters.
  3. Choose an interpolator and the cell size.
  4. Run.

  The results are shown in five places:
  - an outcome overlay and a DTM mesh in 3D;
  - maps: hillshade, Δz, top view by outcome, and the kriging standard deviation;
  - a west–east profile;
  - metric tables by zone, including the *voids* (cells without measured ground), where roof and canopy remnants show;
  - a run history, exportable as CSV.
- **`comparacao.html`, the whole cloud.** PDAL's SMRF, PMF and CSF run on all 69.4 M points, each with TIN and IDW DTMs. It shows a summary table and side-by-side maps (DTM, Δz, Type I/II rate per cell, reference, zones), with GeoTIFF downloads.
- **`teoria.html`, the theory.** It covers the filters, interpolators and metrics, and what the simulator simplifies.

**Ground filters:** slope-based (Vosselman), PMF (Zhang), SMRF (Pingel), progressive TIN (Axelsson), robust interpolation (Kraus & Pfeifer, two-level hierarchy), CSF (Zhang), MCC (Evans & Hudak) and block minimum.

**Interpolators:** linear TIN, IDW, natural neighbour (discrete Sibson), ordinary kriging (fitted spherical variogram) and thin-plate spline.

## Run locally

ES modules do not load from `file://`, and COPC needs HTTP range requests, which `python3 -m http.server` does not answer. Use the bundled server instead:

```bash
npm run serve            # node scripts/serve.mjs 5510 → http://localhost:5510/
```

The pages read `data/cooper.copc.laz` and `data/products/`. Locally these are symlinks to the data folder (see [data/README.md](data/README.md)). Any COPC can be opened with `?copc=<url>&products=<url>`. A tile can be reproduced with `?cx=<E>&cy=<N>&size=<m>&depth=<n>&filter=<id>&interp=<id>`.

## Data workflow

1. `pdal translate … --writer copc` converts the classified LAZ to COPC (mm scale).
2. `python scripts/build_products.py cooper.copc.laz products 0.5` builds the whole-cloud products. It takes about 30 minutes on 12 cores and peaks at 11.4 GB of RAM: PMF over all returns alone takes about 10 minutes.
3. `scripts/publish_data.sh cooper.copc.laz products data-v1` creates the immutable release snapshot.
4. On every push to `main`, `.github/workflows/pages.yml` downloads the snapshot, checks its SHA-256, and deploys site plus data as a Pages artifact (about 510 MB of the 1 GB limit).

## Validation

```bash
npm test                 # node --test tests/*.test.mjs
npm run test:browser     # Playwright: every filter and interpolator on the fixture tile, both languages, 390 px
python3 tests/generate_reference.py   # regenerates the SciPy/NumPy oracle used by tests/interp.test.mjs
```

- **Interpolators:** they match SciPy (`griddata` linear, `RBFInterpolator` thin plate) and NumPy (IDW, ordinary kriging with estimate and variance) to within millimetres.
- **Filters:** the PMF schedule reproduces the deck's table (0.5, 1.1, 1.7, 2.9, 3.0 m). Each filter is tested on a synthetic profile scene (pole, car, tree, house, 26 m shed, hill) that encodes the deck's limitations, and on a real 30 m tile.
- **Cross-check against PDAL:** `scripts/crosscheck_pdal.py` + `scripts/crosscheck.mjs` compare the JS ports with PDAL on the same points. The labels agree on 99.1% of points for SMRF, 94.5% for PMF and 91.1% for CSF.
- **Feasibility measurements:** see [FEASIBILITY.md](FEASIBILITY.md). The `spike/` folder holds the scripts that produced them.

## Structure

```
index.html comparacao.html teoria.html   pages
app.mjs compare.mjs ui.mjs loader.mjs    page logic, COPC tile loading (worker pool)
config.mjs i18n.mjs words.mjs            data URLs and presets; PT-BR/EN dictionary
core/                                    pure algorithms, no DOM: grid, tin, metrics, pipeline,
  filters/  interp/                      8 ground filters, 5 interpolators
views/                                   Potree view, 2D maps, profile chart
worker/                                  decode workers (copc.js + laz-perf), compute worker
scripts/                                 serve, fixtures, PDAL products, cross-check, publish
tests/                                   node tests, browser test, oracle, fixtures
vendor/                                  Potree 1.8.2 (trimmed), Delaunator, fonts — see THIRD_PARTY.txt
```

## Not modelled

The following are not modelled:
- segment-based and machine-learning filters, which need training data;
- breaklines;
- CSF's slope post-processing.

The departures of each JS port from its original method are listed in `teoria.html` §5 and in the comments of `core/filters/*.mjs`.

## License

The code is MIT (see [LICENSE](LICENSE)). Third-party licences are in `vendor/THIRD_PARTY.txt`.
