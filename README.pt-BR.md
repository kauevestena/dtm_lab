# DTM Lab

*[English](README.md)*

Simulador de produção de modelo digital de terreno (MDT) a partir de uma nuvem de pontos classificada. A classificação existente da nuvem é a **referência**. Cada filtro de solo reclassifica a nuvem do zero, e cada interpolador gera um MDT a partir do solo filtrado. Os dois são então avaliados contra a referência: erros tipo I/II e κ para a classificação; RMSEz, viés, LE90 e PEC-PCD para as altitudes. Algoritmos e métricas seguem a apresentação *Modelagem Digital de Terreno* (filtragem de solo, interpolação, qualidade).

Roda inteiramente no navegador. A nuvem (69,4 M de pontos, 459 MB) é transmitida em **COPC** por requisições HTTP parciais, e cada página baixa só o que precisa.

## Páginas

- **`index.html`, o simulador.** Tem quatro passos:
  1. Carregar um recorte: escolha um recorte pronto, digite o centro ou dê duplo clique na vista Potree. Tamanho e profundidade da octree são ajustáveis.
  2. Escolher o filtro de solo e seus parâmetros.
  3. Escolher o interpolador e a célula.
  4. Executar.

  Os resultados aparecem em cinco lugares:
  - sobreposição por resultado e malha do MDT em 3D;
  - mapas: relevo sombreado, Δz, vista de topo por resultado e desvio-padrão da krigagem;
  - perfil oeste–leste;
  - tabelas de métricas por zona, incluindo os *vazios* (células sem solo medido), onde aparecem restos de telhados e copas;
  - histórico de execuções, exportável em CSV.
- **`comparacao.html`, a nuvem inteira.** SMRF, PMF e CSF da PDAL rodam sobre os 69,4 M de pontos, cada um com MDT por TIN e IDW. A página mostra uma tabela-resumo e mapas lado a lado (MDT, Δz, taxa de erro tipo I/II por célula, referência, zonas), com download em GeoTIFF.
- **`teoria.html`, a teoria.** Cobre filtros, interpoladores e métricas, e o que o simulador simplifica.

**Filtros de solo:** declividade (Vosselman), PMF (Zhang), SMRF (Pingel), TIN progressivo (Axelsson), interpolação robusta (Kraus & Pfeifer, hierarquia de dois níveis), CSF (Zhang), MCC (Evans & Hudak) e mínimo por blocos.

**Interpoladores:** TIN linear, IDW, vizinho natural (Sibson discreto), krigagem ordinária (variograma esférico ajustado) e spline de placa fina.

## Rodar localmente

Módulos ES não carregam via `file://`, e o COPC precisa de requisições HTTP parciais, que o `python3 -m http.server` não atende. Use o servidor incluído:

```bash
npm run serve            # node scripts/serve.mjs 5510 → http://localhost:5510/
```

As páginas leem `data/cooper.copc.laz` e `data/products/`. Localmente, são links simbólicos para a pasta de dados (veja [data/README.md](data/README.md)). Qualquer COPC pode ser aberto com `?copc=<url>&products=<url>`. Um recorte pode ser reproduzido com `?cx=<E>&cy=<N>&size=<m>&depth=<n>&filter=<id>&interp=<id>`.

## Fluxo dos dados

1. `pdal translate … --writer copc` converte o LAZ classificado em COPC (escala milimétrica).
2. `python scripts/build_products.py cooper.copc.laz products 0.5` gera os produtos da nuvem inteira. Leva cerca de 30 minutos em 12 núcleos, com pico de 11,4 GB de RAM: só o PMF sobre todos os retornos leva cerca de 10 minutos.
3. `scripts/publish_data.sh cooper.copc.laz products data-v1` cria o snapshot imutável no release.
4. A cada push na `main`, `.github/workflows/pages.yml` baixa o snapshot, confere o SHA-256 e publica site e dados como artefato do Pages (cerca de 510 MB do limite de 1 GB).

## Validação

```bash
npm test                 # node --test tests/*.test.mjs
npm run test:browser     # Playwright: todos os filtros e interpoladores no recorte de teste, dois idiomas, 390 px
python3 tests/generate_reference.py   # regenera o oráculo SciPy/NumPy usado por tests/interp.test.mjs
```

- **Interpoladores:** conferem com o SciPy (`griddata` linear, `RBFInterpolator` placa fina) e com o NumPy (IDW, krigagem ordinária com estimativa e variância) em milímetros.
- **Filtros:** o cronograma do PMF reproduz a tabela da apresentação (0,5; 1,1; 1,7; 2,9; 3,0 m). Cada filtro é testado em uma cena sintética de perfil (poste, carro, árvore, casa, galpão de 26 m, morro) que codifica as limitações da apresentação, e em um recorte real de 30 m.
- **Comparação com a PDAL:** `scripts/crosscheck_pdal.py` + `scripts/crosscheck.mjs` comparam as versões JS com a PDAL nos mesmos pontos. Os rótulos concordam em 99,1% dos pontos no SMRF, 94,5% no PMF e 91,1% no CSF.
- **Medições de viabilidade:** veja [FEASIBILITY.md](FEASIBILITY.md). A pasta `spike/` guarda os scripts que as produziram.

## Estrutura

Veja a seção *Structure* do [README em inglês](README.md#structure). Os nomes de arquivos são os mesmos.

## Não modelado

Não são modelados:
- filtros por segmentos e por aprendizado de máquina, que exigem dados de treino;
- linhas de quebra;
- o pós-processamento de encostas do CSF.

As diferenças de cada versão JS em relação ao método original estão em `teoria.html` §5 e nos comentários de `core/filters/*.mjs`.

## Licença

O código é MIT (veja [LICENSE](LICENSE)). As licenças de terceiros estão em `vendor/THIRD_PARTY.txt`.
