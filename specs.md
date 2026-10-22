# Brief / Pedido original (2026-10-22)

> I want to study the feasibility of a simulator using the smaller point cloud, that first need to be converted to .copc.laz . The simulator would reside in /home/kaue/tests/simul_adjust with the guidelines from that monorepo. The idea would be to generate DTMs from the whole point cloud that is already classified, therefore many different algorithms would have their results able to be tested. You need to seek my claude chat history since there's presentation about algorithms for generation. You may use web frameworks such as potree (I think it's the most performant one). The cloud could be a GH artifact, so we could host using another repo (but the guidelines would be the same)

Decisions taken with the author / Decisões tomadas com o autor:

- Hybrid computation: whole-cloud products precomputed with PDAL; live in-browser runs on COPC tiles. / Cálculo híbrido: produtos da nuvem inteira pré-calculados com a PDAL; execuções ao vivo no navegador sobre recortes do COPC.
- The whole simulator lives in its own repository (`kauevestena/dtm_lab`), following `simul_adjust/AGENTS.md`, with a card in the simul_adjust portal. / O simulador inteiro fica em repositório próprio, seguindo o `AGENTS.md` do simul_adjust, com um cartão no portal.
- The existing classification is the ground truth; the cloud may be published. / A classificação existente é a verdade de referência; a nuvem pode ser publicada.
- Algorithms and metrics: the deck "Modelagem Digital de Terreno" (sections 3–5). / Algoritmos e métricas: a apresentação "Modelagem Digital de Terreno" (seções 3–5).
