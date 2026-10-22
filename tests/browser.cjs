// Browser test: node tests/browser.cjs   (CHROME_PATH=/usr/bin/google-chrome to use a system Chrome)
// Uses the small committed fixtures: tests/fixtures/tile.copc.laz (30 m tile of the Cooper cloud) and
// tests/fixtures/products (the same tile through scripts/build_products.py).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = process.env.DTM_SCREENSHOTS;
const FIX = 'copc=tests/fixtures/tile.copc.laz&products=tests/fixtures/products/';

(async () => {
  const { createServer } = await import('../scripts/serve.mjs');
  const server = createServer(ROOT);
  await new Promise((r) => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], external = [];
  const watch = (page) => {
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      // swiftshader reports GPU stalls as warnings; they say nothing about the app.
      if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|WebGL-|GroupMarkerNotSet/.test(m.text()))) errors.push(`${m.type()}: ${m.text()}`);
    });
    page.on('request', (r) => { const u = new URL(r.url()); if (u.protocol.startsWith('http') && u.hostname !== 'localhost') external.push(r.url()); });
    page.on('requestfailed', (r) => errors.push(`requestfailed: ${r.url()}`));
  };
  const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), timeout: 120000 }); } };

  // ------------------------------------------------------------ live lab
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, locale: 'de-DE', acceptDownloads: true });
  const page = await ctx.newPage(); watch(page);
  await page.goto(`${base}/index.html?${FIX}&cx=331005&cy=7102180&size=25`);
  await page.waitForFunction(() => window.__lab);
  await page.evaluate(() => window.__lab.ready());
  assert.equal(await page.getAttribute('html', 'lang'), 'en', 'browser language de-DE falls back to English');
  assert.match(await page.getAttribute('a.portal', 'href'), /^\.\.\/\?lang=en$/);
  const n = await page.evaluate(() => window.__lab.state.tile?.points.n);
  assert.ok(n > 10000, `tile loaded from the fixture COPC: ${n} points`);
  assert.match(await page.textContent('#tileStatus'), /points in/);
  assert.ok(await page.isEnabled('#btnRun'));

  // Every filter (with TIN), then every interpolator (with SMRF): finite metrics, one history row each.
  const filters = await page.$$eval('#filter option', (o) => o.map((x) => x.value));
  const interps = await page.$$eval('#interp option', (o) => o.map((x) => x.value));
  assert.equal(filters.length, 8);
  assert.equal(interps.length, 5);
  const kappa = {};
  for (const f of filters) {
    await page.selectOption('#filter', f);
    await page.selectOption('#interp', 'tin');
    await page.click('#btnRun');
    await page.evaluate(() => window.__lab.ready());
    const r = await page.evaluate(() => ({ k: window.__lab.state.result.confusion.kappa, rmse: window.__lab.state.result.errors.all.rmse }));
    assert.ok(Number.isFinite(r.k) && Number.isFinite(r.rmse), `${f}: ${JSON.stringify(r)}`);
    kappa[f] = r.k;
  }
  assert.ok(kappa.smrf > 0.75, `SMRF agrees with the reference on the fixture: κ ${kappa.smrf}`);
  for (const m of interps) {
    await page.selectOption('#filter', 'smrf');
    await page.selectOption('#interp', m);
    await page.click('#btnRun');
    await page.evaluate(() => window.__lab.ready());
    const rmse = await page.evaluate(() => window.__lab.state.result.errors.all.rmse);
    assert.ok(rmse < 0.5, `${m}: RMSE ${rmse}`);  // edge cells next to a building are extrapolated (TIN leaves them empty)
  }
  assert.equal(await page.evaluate(() => window.__lab.state.history.length), filters.length + interps.length);
  assert.equal(await page.$$eval('#histTable tr', (r) => r.length), 1 + filters.length + interps.length);
  assert.notEqual(await page.textContent('#vKappa'), '—');
  await shot(page, 'lab-3d');

  // Parameters reach the worker: a 3 m PMF window keeps more roof than the default 33 m.
  await page.selectOption('#filter', 'pmf');
  await page.selectOption('#interp', 'tin');
  await page.fill('#filterForm input[data-key="maxWindow"]', '3');
  await page.dispatchEvent('#filterForm input[data-key="maxWindow"]', 'change');
  await page.click('#btnRun');
  await page.evaluate(() => window.__lab.ready());
  const small = await page.evaluate(() => window.__lab.state.result.confusion.typeII);
  await page.click('#btnFilterDefaults');
  await page.click('#btnRun');
  await page.evaluate(() => window.__lab.ready());
  const big = await page.evaluate(() => window.__lab.state.result.confusion.typeII);
  assert.ok(small >= big, `Type II with a 3-cell window (${small}) ≥ with 33 cells (${big})`);

  // Tabs: maps, profile, metrics show results.
  for (const tab of ['maps', 'profile', 'metrics', 'history']) {
    await page.click(`[data-tab="${tab}"]`);
    assert.ok(await page.isVisible(`[data-panel="${tab}"]`));
    await shot(page, `lab-${tab}`);
  }
  const ink = await page.evaluate(() => { const c = document.getElementById('mapDz'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; return d.length; });
  assert.ok(ink > 0, 'Δz map drawn');
  assert.match(await page.textContent('#errTable'), /Voids/);

  // CSV download.
  await page.click('[data-tab="history"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#btnCsv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8').trim().split('\n');
  assert.equal(csv.length, 1 + filters.length + interps.length + 2);
  assert.match(csv[0], /^n,tile,filter/);

  // Language switch keeps results and persists.
  await page.click('[data-lang="pt-BR"]');
  assert.equal(await page.getAttribute('html', 'lang'), 'pt-BR');
  assert.match(await page.textContent('[data-tab="metrics"]'), /Métricas/);
  assert.equal(await page.evaluate(() => localStorage.getItem('monorepo_lang')), 'pt-BR');
  assert.equal(await page.evaluate(() => new URL(location.href).searchParams.get('lang')), 'pt-BR');
  await ctx.close();

  // ------------------------------------------------------------ comparison page
  const cctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const cmp = await cctx.newPage(); watch(cmp);
  await cmp.goto(`${base}/comparacao.html?${FIX}&lang=en`);
  await cmp.waitForFunction(() => window.__cmp);
  assert.equal(await cmp.evaluate(() => window.__cmp.ready()), true);
  assert.equal(await cmp.$$eval('#sumTable tr', (r) => r.length), 1 + 3 * 2, 'three filters × two interpolators');
  for (const layer of ['dtm', 'dz', 't1', 't2', 'ref', 'zones']) {
    await cmp.selectOption('[data-side="left"] [data-role="layer"]', layer);
    await cmp.waitForTimeout(100);
    assert.ok(await cmp.$eval('[data-side="left"] canvas', (c) => c.width > 0), layer);
  }
  const href = await cmp.getAttribute('#sumTable a[download]', 'href');
  assert.equal((await cmp.request.get(href)).status(), 200, 'GeoTIFF download is served');
  await shot(cmp, 'compare');
  await cctx.close();

  // ------------------------------------------------------------ theory page and mobile layout
  const tctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const th = await tctx.newPage(); watch(th);
  await th.goto(`${base}/teoria.html?lang=pt`);
  assert.ok(await th.isVisible('text=Filtragem de solo'));
  await th.click('[data-lang="en"]');
  assert.ok(await th.isVisible('h2#s2 >> text=Ground filtering'));
  for (const p of ['teoria.html', `index.html?${FIX}&cx=331005&cy=7102180&size=25&viewer=off`, `comparacao.html?${FIX}`]) {
    await th.goto(`${base}/${p}`);
    await th.waitForTimeout(500);
    const overflow = await th.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(overflow <= 1, `${p}: no horizontal scroll at 390 px (overflow ${overflow})`);
  }
  await shot(th, 'mobile');
  await tctx.close();

  assert.deepEqual(external, [], 'no external requests');
  assert.deepEqual(errors, [], 'no console errors');
  await browser.close();
  server.close();
  console.log('browser test passed');
})().catch(async (e) => { console.error(e); process.exit(1); });
