// Phase 0 spike runner: serves the repo with Range support, opens the viewer and the
// tile bench headless, and prints what the network and the pages measured.
// Usage: node spike/run_spike.cjs [copcPath relative to repo root]
const path = require('node:path');
const { chromium } = require('playwright');

(async () => {
  const { createServer } = await import('../scripts/serve.mjs');
  const root = path.resolve(__dirname, '..');
  const copc = process.argv[2] || 'data/cooper.copc.laz';
  const server = createServer(root);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const report = {};

  if (!process.env.SKIP_VIEWER) {
  // 1. Viewer: does Potree stream the COPC by range?
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const reqs = []; const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', async (r) => {
    if (!r.url().includes('.copc.laz')) return;
    const h = r.headers();
    reqs.push({ status: r.status(), range: r.request().headers().range || null, len: Number(h['content-length'] || 0) });
  });
  await page.goto(`${base}/spike/view.html?copc=../${copc}`);
  await page.waitForFunction(() => window.__spike, null, { timeout: 120000 });
  await page.waitForTimeout(8000);
  report.viewer = await page.evaluate(() => ({
    hierarchyMs: Math.round(window.__spike.loadedMs),
    visibleNodes: window.viewer.scene.pointclouds[0].visibleNodes.length,
    visiblePoints: window.viewer.scene.pointclouds[0].numVisiblePoints,
  }));
  report.viewer.requests = reqs.length;
  report.viewer.allRanged = reqs.every((r) => r.status === 206 && r.range);
  report.viewer.unranged = reqs.filter((r) => !(r.status === 206 && r.range)).slice(0, 5);
  report.viewer.bytesFetchedMB = +(reqs.reduce((s, r) => s + r.len, 0) / 1e6).toFixed(1);
  report.viewer.errors = errors.slice(0, 10);
  await page.screenshot({ path: path.join(root, 'spike', 'view.png') });
  }

  // 2. Tile bench at several sizes.
  report.tiles = [];
  const cases = (process.env.SPIKE_TILES || '25:99,50:99,100:99').split(',').map((s) => s.split(':').map(Number));
  for (const [size, depth] of cases) {
    const b = await browser.newPage();
    b.on('pageerror', (e) => errors.push(e.message));
    await b.goto(`${base}/spike/bench.html?copc=../${copc}&size=${size}&depth=${depth}`);
    await b.waitForFunction(() => window.__bench, null, { timeout: 300000 });
    report.tiles.push(await b.evaluate(() => window.__bench));
    await b.close();
  }
  console.log(JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
