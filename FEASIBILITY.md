# Feasibility study / Estudo de viabilidade — dtm_lab

*Measured 2026-10-22 on the development machine (12 cores, 62 GB RAM), PDAL 2.9.2, Potree 1.8.2, Chromium (Playwright 1.51.1, headless).*
*Medido em 2026-10-22 na máquina de desenvolvimento (12 núcleos, 62 GB RAM), PDAL 2.9.2, Potree 1.8.2, Chromium (Playwright 1.51.1, headless).*

## Verdict / Veredito

**EN.** Feasible. The whole classified cloud can be streamed to the browser as COPC from GitHub Pages. The three PDAL ground filters run on all 69 M points in under 3 minutes each, so every precomputed product is cheap to rebuild. The live, in-browser lab works on tiles, provided the octree depth is capped. Full resolution is too dense for interactive use: about 1,400 pts/m² in the built-up centre.

**PT.** Viável. A nuvem classificada inteira pode ser transmitida ao navegador como COPC a partir do GitHub Pages. Os três filtros de solo da PDAL rodam sobre os 69 M de pontos em menos de 3 minutos cada, então todos os produtos pré-calculados são baratos de refazer. O laboratório ao vivo, no navegador, funciona sobre recortes, desde que a profundidade da octree seja limitada. A resolução total é densa demais para uso interativo: cerca de 1.400 pts/m² no centro edificado.

## 1. Source cloud / Nuvem de origem

| Item | Value / Valor |
|---|---|
| File / Arquivo | `Nuvem_Cooper_Matriz_2026_07_17.laz` (634 MB) |
| Points / Pontos | 69,350,440 · LAS 1.4 · PDRF 7 (RGB) |
| CRS | EPSG:31982 (SIRGAS 2000 / UTM 22S); no vertical CRS / sem CRS vertical |
| Extent / Extensão | 482 × 533 m (0.257 km²) · Z 751–817 m |
| Mean density / Densidade média | 270 pts/m² (≈1,400 pts/m² in the built-up centre / no centro edificado) |
| Classes | 2 ground 48.5 M · 6 building 13.0 M · 5 high veg. 6.0 M · 25 user 0.96 M · 20 ignored ground 0.70 M · 14 wire 85 k · 23 user 78 k · 24 user 52 k |

Reference ground for the metrics = classes 2 + 20. Reference DTM = class 2 only.
Solo de referência para as métricas = classes 2 + 20. MDT de referência = apenas classe 2.

## 2. COPC conversion / Conversão para COPC

`pdal translate … --writer copc --writers.copc.scale_{x,y,z}=0.001`

| Item | Result / Resultado |
|---|---|
| Output size / Tamanho | **459 MB** (−28 %: mm scale instead of 0.1 mm / escala de mm em vez de 0,1 mm) |
| Time / Tempo | 3 min 17 s, 5.4 GB RAM |
| Validity / Validade | `copc: true`, 69,350,440 points, same bounds / mesmos limites, spacing at depth 0 = 3.62 m |

## 3. Hosting / Hospedagem

- GitHub Pages answers `Range` requests with `206` and `access-control-allow-origin: *` (verified with curl on kauevestena.github.io).
  O GitHub Pages responde a requisições `Range` com `206` e `access-control-allow-origin: *` (verificado com curl).
- The 459 MB file cannot go in git (100 MB limit). It is kept as a Release asset (≤ 2 GB) and copied into the Pages artifact by the deploy workflow.
  O arquivo de 459 MB não cabe no git (limite de 100 MB). Ele fica como asset de Release (≤ 2 GB) e é copiado para o artefato do Pages pelo workflow de publicação.
- Pages budget / Orçamento do Pages (limit 1 GB):

  | Part / Parte | Size / Tamanho |
  |---|---|
  | COPC | 459 MB |
  | Vendored Potree (trimmed) / Potree embarcado (enxuto) | 18 MB |
  | Precomputed products / Produtos pré-calculados | 32 MB (measured / medido) |
  | **Total** | **≈ 510 MB** |

## 4. Viewer / Visualizador (Potree 1.8.2)

- The COPC loader works as shipped (`libs/copc`). Loading the hierarchy took 1.5 s. The first view showed 3.0 M points after fetching **11.8 MB** in 34 range requests, without downloading the whole file. Classification colouring works.
  O leitor COPC funciona como distribuído. Hierarquia em 1,5 s; a primeira vista mostrou 3,0 M de pontos após baixar **11,8 MB** em 34 requisições parciais, sem baixar o arquivo inteiro. A coloração por classe funciona.
- Trimmed vendor copy: 18 MB. Cesium, geopackage/sql.js and the samples were removed.
  Cópia enxuta: 18 MB; foram removidos Cesium, geopackage/sql.js e as amostras.

## 5. Whole-cloud filters (PDAL) / Filtros na nuvem inteira

| Filter / Filtro | Time / Tempo | Peak RAM |
|---|---|---|
| `filters.smrf` (defaults) | 1 min 59 s | 6.4 GB |
| `filters.pmf` (cell 1, window 33, slope 1.0, 0.15–2.5 m) | 2 min 34 s | 6.9 GB |
| `filters.csf` (defaults) | 2 min 39 s | 9.7 GB |

These timings use PDAL's defaults, which for SMRF and PMF filter last and single returns only. The products pipeline filters all returns, as the JS ports do, and then PMF takes about 10 min. The full `build_products.py` run takes 29.6 min, peaks at 11.4 GB and writes 32 MB.
Estes tempos usam os padrões da PDAL, que no SMRF e no PMF filtram só os últimos retornos e os únicos. O pipeline de produtos filtra todos os retornos, como as versões JS, e então o PMF leva cerca de 10 min. A execução completa de `build_products.py` leva 29,6 min, com pico de 11,4 GB, e grava 32 MB.

No tiling is needed on this machine. A GitHub runner (16 GB) would be tight for CSF, so the products are built locally and uploaded as release assets.
Não é preciso dividir em blocos nesta máquina. Um runner do GitHub (16 GB) ficaria no limite para o CSF, então os produtos são gerados localmente e enviados como assets de release.

## 6. Live tiles in the browser / Recortes ao vivo no navegador

The tile is read from the COPC, decoded with laz-perf (wasm) and run through a naive morphological opening (window of 17 cells), all in one Web Worker.
Leitura do COPC, decodificação laz-perf (wasm) e abertura morfológica simples (janela de 17 células), tudo em um único Web Worker.

| Tile / Recorte | Depth cap / Profundidade | Points / Pontos | pts/m² | Fetch+decode | Extract | Opening |
|---|---|---|---|---|---|---|
| 50 m | full / total | 3.49 M | 1,395 | 13.9 s | 0.29 s | 0.21 s |
| 50 m | 6 | 2.33 M | 932 | 10.7 s | 0.21 s | 0.16 s |
| **50 m** | **5** | **0.75 M** | **299** | **4.6 s** | **0.10 s** | **0.10 s** |
| 100 m | 5 | 2.70 M | 270 | 16.9 s | 0.28 s | 0.26 s |
| 200 m | 5 | 9.06 M | 227 | 37.1 s | 0.87 s | 0.89 s |

**EN.**
- Decompression dominates, at about 4 µs per point on one thread.
- Decision: default to a **50 m tile at depth 5**, which keeps about the nominal survey density, and spread decoding over a worker pool (`navigator.hardwareConcurrency`). Expect 1–2 s per tile.
- Depth and size remain user options, with a point budget warning.
- Reading raw `DataView` instead of copc.js per-point getters cut extraction tenfold (1.4 s → 0.1 s for 1 M points).

**PT.**
- A descompressão domina, com cerca de 4 µs por ponto em uma thread.
- Decisão: padrão de **recorte de 50 m na profundidade 5**, que mantém cerca da densidade nominal, com a decodificação distribuída entre vários workers. Espera-se 1–2 s por recorte.
- Profundidade e tamanho seguem como opções, com aviso de orçamento de pontos.
- Ler o `DataView` bruto, em vez dos getters por ponto do copc.js, reduziu a extração em dez vezes.

## 7. Go / no-go

| Item | Status |
|---|---|
| COPC conversion / Conversão | GO |
| Hosting on Pages (artifact deploy) / Hospedagem | GO, about 510 MB of the 1 GB budget |
| Potree COPC viewer | GO, no fallback needed |
| Whole-cloud PDAL filters / Filtros PDAL | GO, under 3 min each, run locally |
| Live browser lab / Laboratório ao vivo | GO with depth cap 5 and a worker pool |

## 8. Open points / Pendências

- **EN:** classes 23, 24 and 25 are user-defined and their meaning is unknown. They are treated as non-ground, which should be confirmed with the data producer.
  **PT:** as classes 23, 24 e 25 são definidas pelo usuário e seu significado é desconhecido. São tratadas como não solo; convém confirmar com o produtor dos dados.
- **EN:** the vertical datum is undeclared (probably ellipsoidal). This only matters for absolute heights, since every comparison is relative.
  **PT:** o datum vertical não está declarado (provavelmente elipsoidal). Só afeta as altitudes absolutas, já que todas as comparações são relativas.
- **EN:** PDAL's SMRF and PMF classify only last and single returns by default, and other returns stay class 0. In the metrics those count as "not ground", which is consistent with the filters' intent.
  **PT:** por padrão, o SMRF e o PMF da PDAL classificam só os últimos retornos e os retornos únicos; os demais ficam na classe 0. Nas métricas eles contam como "não solo", o que é coerente com a intenção dos filtros.

## 9. JS ports against PDAL / Versões JS contra a PDAL

Same 30 m tile (83,954 points, depth 4), same parameters, all returns (`scripts/crosscheck_pdal.py` + `scripts/crosscheck.mjs`).
Mesmo recorte de 30 m (83.954 pontos, profundidade 4), mesmos parâmetros, todos os retornos.

| Filter / Filtro | Same label / Mesmo rótulo | κ JS | κ PDAL | Type I JS / PDAL | Type II JS / PDAL |
|---|---|---|---|---|---|
| SMRF | 99.1 % | 0.963 | 0.953 | 1.2 % / 1.9 % | 2.6 % / 2.8 % |
| PMF | 94.5 % | 0.800 | 0.905 | 16.8 % / 7.4 % | 0.9 % / 1.0 % |
| CSF | 91.1 % | 0.846 | 0.704 | 12.8 % / 26.0 % | 0.8 % / 0.4 % |

- **EN:** The JS PMF follows Zhang's raster formulation, while PDAL's (from PCL) opens around each point, so it rejects less ground. The JS CSF uses simplified springs. Both differences are documented in `teoria.html` §5.
  **PT:** O PMF em JS segue a formulação em grade de Zhang, enquanto o da PDAL (vindo da PCL) abre em torno de cada ponto e por isso rejeita menos solo. O CSF em JS usa molas simplificadas. As duas diferenças estão documentadas em `teoria.html` §5.
