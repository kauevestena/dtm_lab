# Data / Dados — snapshot `data-v1`

**EN.** The point cloud and the whole-cloud products are too large for git (the COPC is 459 MB). They live as assets of the GitHub release **`data-v1`**, and `.github/workflows/pages.yml` copies them into the published site at `data/`. Locally, `data/cooper.copc.laz` and `data/products` are symlinks and are git-ignored. A snapshot is immutable: changed data gets a new tag (`data-v2`, …).

**PT.** A nuvem de pontos e os produtos da nuvem inteira são grandes demais para o git (o COPC tem 459 MB). Eles ficam como assets do release **`data-v1`** do GitHub, e `.github/workflows/pages.yml` os copia para o site publicado em `data/`. Localmente, `data/cooper.copc.laz` e `data/products` são links simbólicos ignorados pelo git. Um snapshot é imutável: dados alterados recebem uma nova tag (`data-v2`, …).

## Source / Origem

| Item | Value / Valor |
|---|---|
| File / Arquivo | `Nuvem_Cooper_Matriz_2026_07_17.laz` (634,249,061 B) |
| SHA-256 | `416d925c83f7ef0d922c100479b5c06c47c1e5e85d9acd134f068ba254ff2006` |
| Sensor | airborne LiDAR / LiDAR aerotransportado, already classified / já classificado |
| Points / Pontos | 69,350,440 · LAS 1.4 · PDRF 7 |
| CRS | EPSG:31982 (SIRGAS 2000 / UTM 22S); vertical datum undeclared / datum vertical não declarado |
| Classes | 2 ground, 5 high vegetation, 6 building, 14 wire, 20 ignored ground, 23–25 user-defined |
| Publication / Publicação | cleared for public release by the project owner on 2026-10-22 / liberada para publicação pelo responsável em 2026-10-22 |

## Derived files / Arquivos derivados

| Asset | How it was made / Como foi feito | SHA-256 |
|---|---|---|
| `cooper.copc.laz` (459,147,265 B) | `pdal translate <source> cooper.copc.laz --writer copc --writers.copc.scale_{x,y,z}=0.001 --writers.copc.offset_{x,y,z}=auto` (PDAL 2.9.2) | `0fca6d940038ba8882c76fd059318457381b7b767502e2997759539298bd1542` |
| `products.tar.gz` | `python scripts/build_products.py cooper.copc.laz products 0.5` (PDAL 2.9.2, SciPy, GDAL 3.11) | in / no `SHA256SUMS` of the release |

`products/` holds `manifest.json` (grid, metrics, encodings), the quantised rasters read by `comparacao.html` and Float32 Cloud-Optimized GeoTIFFs in `cog/`.
`products/` contém `manifest.json` (grade, métricas, codificações), os rasters quantizados lidos por `comparacao.html` e GeoTIFFs Float32 otimizados para nuvem em `cog/`.

## Publish / Publicar

```bash
scripts/publish_data.sh /path/to/cooper.copc.laz /path/to/products data-v1
```

## Test fixtures / Dados de teste

`tests/fixtures/tile.copc.laz`, `tile.bin` and `tile.json` are a 30 m tile (E 330990–331020, N 7102165–7102195) cut by `scripts/make_fixture.py` at resolution 0.24 m (octree depth 4). `tests/fixtures/products/` is that tile run through `scripts/build_products.py`.
`tests/fixtures/tile.copc.laz`, `tile.bin` e `tile.json` são um recorte de 30 m (E 330990–331020, N 7102165–7102195) feito por `scripts/make_fixture.py` com resolução de 0,24 m (profundidade 4 da octree). `tests/fixtures/products/` é esse recorte processado por `scripts/build_products.py`.
