// Live lab: load a tile from the COPC, run a ground filter and an interpolator in a worker, and score
// both against the reference classification. window.__lab exposes the state for tests/browser.cjs.
import { bootLanguage, onLanguage, plain, t } from './i18n.mjs';
import { FILTERS, byId as FILTER } from './core/filters/index.mjs';
import { INTERPOLATORS, byId as INTERP } from './core/interp/index.mjs';
import { ZONES } from './core/pipeline.mjs';
import { COPC_URL, PRESETS } from './config.mjs';
import { loadTile } from './loader.mjs';
import { buildForm, readForm, fillSelect, setTabs, fmtPct, fmtM, fmtInt } from './ui.mjs';
import { drawHillshade, drawDiverging, drawOutcome, drawRate } from './views/maps.mjs';
import { drawProfile } from './views/profile.mjs';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const state = { tile: null, result: null, runOpts: null, history: [], viewer: null, busy: Promise.resolve() };
const compute = new Worker(new URL('./worker/compute_worker.mjs', import.meta.url), { type: 'module' });
let seq = 0;
const ask = (msg, transfer = []) => new Promise((resolve, reject) => {
  const id = ++seq;
  const on = (e) => {
    if (e.data.id !== id) return;
    compute.removeEventListener('message', on);
    e.data.ok ? resolve(e.data) : reject(new Error(e.data.error));
  };
  compute.addEventListener('message', on);
  compute.postMessage({ ...msg, id }, transfer);
});
const track = (p) => { state.busy = state.busy.then(() => p, () => p); return p; };

// ---------------------------------------------------------------- controls
function labelSelects() {
  fillSelect($('preset'), [...PRESETS, { id: '' }], (p) => (p.id ? `preset.${p.id}` : 'o.custom'));
  fillSelect($('filter'), FILTERS, (f) => `flt.${f.id}`);
  fillSelect($('interp'), INTERPOLATORS, (m) => `int.${m.id}`);
  $('filterDesc').textContent = plain(`fd.${$('filter').value}`);
  $('interpDesc').textContent = plain(`id.${$('interp').value}`);
  $('dataSource').textContent = t('st.source', { url: COPC_URL });
}

function setPreset(id) {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) return;
  $('cx').value = p.cx; $('cy').value = p.cy; $('size').value = '50';
}

function tileBox() {
  const cx = Number($('cx').value), cy = Number($('cy').value), s = Number($('size').value);
  return [cx - s / 2, cy - s / 2, cx + s / 2, cy + s / 2];
}

const filterForm = () => buildForm($('filterForm'), FILTER[$('filter').value], {}, () => {});
const interpForm = () => buildForm($('interpForm'), INTERP[$('interp').value], {}, () => {});

function stepState(n, s) {
  const el = $(`step${n}`);
  el.classList.toggle('step-done', s === 'done');
  el.classList.toggle('step-active', s === 'active');
}

// ---------------------------------------------------------------- 3D view
async function startViewer() {
  if (typeof Potree === 'undefined' || q.get('viewer') === 'off') return;
  try {
    const v3 = await import('./views/viewer3d.mjs');
    state.v3 = v3;
    state.viewer = v3.createViewer($('potree_render_area'), COPC_URL, {
      onReady: (s) => {
        const b = s.pointcloud.getBoundingBoxWorld();
        s.zRange = [b.min.z, b.max.z];
        s.zBase = Math.floor(b.min.z);
        drawTileBox();
        if (state.result) drawOverlays();
      },
    });
    v3.onPick(state.viewer, (loc) => {
      $('cx').value = Math.round(loc.x); $('cy').value = Math.round(loc.y); $('preset').value = '';
      drawTileBox();
    });
  } catch (err) {
    $('tileStatus').textContent = t('st.viewerError', { msg: err.message });
  }
}

function drawTileBox() {
  const v = state.viewer;
  if (!v || !state.v3) return;
  const [zmin, zmax] = state.tile?.zRange || v.zRange || [0, 1];
  state.v3.setTileBox(v, tileBox(), zmin, zmax);
}

function drawOverlays() {
  const v = state.viewer, r = state.result;
  if (!v || !state.v3 || !r) return;
  state.v3.showOutcome(v, state.tile.points, r.outcome, state.tile.origin, $('showOverlay').checked);
  state.v3.showDtm(v, r.geom, r.dtm, state.tile.origin, $('showDtm').checked);
}

// ---------------------------------------------------------------- load and run
async function load() {
  const box = tileBox();
  const depth = Number($('depth').value);
  $('btnLoad').disabled = true; $('btnRun').disabled = true;
  $('tileStatus').textContent = t('st.loading');
  stepState(1, 'active');
  try {
    const tile = await loadTile(new URL(COPC_URL, location.href).href, box, depth >= 99 ? Infinity : depth);
    if (!tile.points.n) { $('tileStatus').textContent = t('st.empty'); return; }
    let zmin = Infinity, zmax = -Infinity;
    for (const z of tile.points.z) { if (z < zmin) zmin = z; if (z > zmax) zmax = z; }
    tile.zRange = [zmin, zmax];
    tile.box = box; tile.depth = depth;
    state.tile = tile; state.result = null;
    await ask({ type: 'tile', points: tile.points, size: tile.size });
    const s = tile.stats, area = tile.size[0] * tile.size[1];
    $('tileStatus').textContent = t('st.loaded', { n: fmtInt(s.n), ms: Math.round(s.ms), workers: s.workers, nodes: s.nodes, density: Math.round(s.n / area) });
    stepState(1, 'done'); stepState(2, 'active');
    $('btnRun').disabled = false;
    drawTileBox();
    if (state.viewer && state.v3) { state.v3.showOutcome(state.viewer, null); state.v3.showDtm(state.viewer, null); }
    showResults(false);
  } catch (err) {
    $('tileStatus').textContent = t('st.error', { msg: err.message });
  } finally {
    $('btnLoad').disabled = false;
  }
}

async function run() {
  if (!state.tile) return;
  const opts = {
    filter: $('filter').value, filterParams: readForm($('filterForm')),
    interp: $('interp').value, interpParams: readForm($('interpForm')),
    cell: Number($('cell').value), eq: Number($('eq').value) || 1,
  };
  $('btnRun').disabled = true;
  $('runStatus').textContent = t('st.running');
  try {
    const { result } = await ask({ type: 'run', opts });
    state.result = result; state.runOpts = opts;
    $('runStatus').textContent = t('st.done', { f: Math.round(result.timings.filterMs), i: Math.round(result.timings.interpMs), s: fmtInt(result.samples) });
    [2, 3, 4].forEach((n) => stepState(n, 'done'));
    addHistory(opts, result);
    render();
  } catch (err) {
    $('runStatus').textContent = t('st.error', { msg: err.message });
  } finally {
    $('btnRun').disabled = false;
  }
}

// ---------------------------------------------------------------- rendering
function showResults(on) {
  document.querySelectorAll('[data-results]').forEach((el) => { el.hidden = !on; });
  document.querySelectorAll('[data-waiting]').forEach((el) => { el.hidden = on; });
  if (!on) ['vTypeI', 'vTypeII', 'vKappa', 'vRmse'].forEach((id) => { $(id).textContent = '—'; });
}

function render() {
  const r = state.result;
  if (!r) return;
  showResults(true);
  const c = r.confusion;
  $('vTypeI').textContent = fmtPct(c.typeI);
  $('vTypeII').textContent = fmtPct(c.typeII);
  $('vKappa').textContent = fmtM(c.kappa, 3);
  $('vRmse').textContent = Number.isFinite(r.errors.all.rmse) ? `${fmtM(r.errors.all.rmse)} m` : '—';
  renderMaps(); renderProfile(); renderTables(); drawOverlays();
}

function renderMaps() {
  const r = state.result, g = r.geom;
  drawHillshade($('mapDtm'), r.dtm, g.w, g.h, g.cell);
  drawHillshade($('mapRef'), r.ref.surface, g.w, g.h, g.cell);
  const abs = [...r.dz].filter(Number.isFinite).map(Math.abs).sort((a, b) => a - b);
  const p95 = abs.length ? abs[Math.floor(0.95 * (abs.length - 1))] : 1;
  const limit = Math.max(0.1, Math.ceil(p95 * 10) / 10);
  $('dzLimit').textContent = `±${limit.toFixed(1)} m`;
  drawDiverging($('mapDz'), r.dz, g.w, g.h, limit);
  drawOutcome($('mapOutcome'), state.tile.points, r.outcome, state.tile.size);
  $('figVar').hidden = !r.variance;
  if (r.variance) {
    const sd = r.variance.map(Math.sqrt);
    const max = Math.max(1e-6, ...[...sd].filter(Number.isFinite));
    drawRate($('mapVar'), sd.map((v) => v / max), g.w, g.h, 'typeI');
  }
}

function renderProfile() {
  const r = state.result;
  if (!r) return;
  const f = Number($('profileY').value), yAt = f * state.tile.size[1];
  $('profileYv').textContent = `${(state.tile.origin[1] + yAt).toFixed(1)} m`;
  drawProfile($('profileCanvas'), $('profileTip'), {
    points: state.tile.points, outcome: r.outcome, geom: r.geom, dtm: r.dtm, refSurface: r.ref.surface, yAt,
    labels: { dtm: plain('m.dtmLine'), ref: plain('m.refLine') },
  });
}

function renderTables() {
  const r = state.result, c = r.confusion;
  $('confTable').innerHTML = `
    <tr><th>${plain('c.ref')}</th><th class="num">${plain('c.saysGround')}</th><th class="num">${plain('c.saysObject')}</th><th class="num">${plain('c.rate')}</th></tr>
    <tr><td>${plain('c.ground')}</td><td class="num">a · ${fmtInt(c.a)}</td><td class="num">b · ${fmtInt(c.b)}</td><td class="num">I · ${fmtPct(c.typeI)}</td></tr>
    <tr><td>${plain('c.object')}</td><td class="num">c · ${fmtInt(c.c)}</td><td class="num">d · ${fmtInt(c.d)}</td><td class="num">II · ${fmtPct(c.typeII)}</td></tr>
    <tr><td>${plain('c.total')}</td><td class="num" colspan="2">κ ${fmtM(c.kappa)}</td><td class="num">${fmtPct(c.total)}</td></tr>`;
  const head = ['e.zone', 'e.cells', 'e.mean', 'e.rmse', 'e.le90', 'e.max', 'e.pec'].map((k, i) => `<th${i ? ' class="num"' : ''}>${plain(k)}</th>`).join('');
  const rows = ZONES.map((z) => {
    const e = r.errors[z];
    return `<tr><td>${plain(`z.${z}`)}</td><td class="num">${fmtInt(e.n)}</td><td class="num">${fmtM(e.mean)}</td><td class="num">${fmtM(e.rmse)}</td><td class="num">${fmtM(e.le90)}</td><td class="num">${fmtM(e.maxAbs)}</td><td class="num pec">${e.pec ?? '—'}</td></tr>`;
  }).join('');
  $('errTable').innerHTML = `<tr>${head}</tr>${rows}`;
  const msgs = [];
  if (!(r.samples >= 3)) msgs.push(['error', 'msg.fewGround']);
  if (c.typeI > 0.05 && c.typeI > 2 * c.typeII) msgs.push(['warn', 'msg.typeIdom']);
  if (c.typeII > 0.05 && c.typeII > 2 * c.typeI) msgs.push(['warn', 'msg.typeIIdom']);
  if (r.errors.voids.n > 20 && r.errors.voids.rmse > 3 * r.errors.open.rmse && r.errors.voids.rmse > 0.5) msgs.push(['warn', 'msg.buildingsLeft']);
  $('messages').innerHTML = msgs.map(([k, key]) => `<div class="msg ${k}">${t(key)}</div>`).join('');
}

// ---------------------------------------------------------------- history
function paramText(algo, params) {
  return algo.params.map((p) => `${p.key}=${params[p.key]}`).join(' ');
}

function addHistory(opts, r) {
  state.history.push({
    n: state.history.length + 1,
    tile: `${Math.round(Number($('cx').value))},${Math.round(Number($('cy').value))} · ${state.tile.size[0]} m · d${state.tile.depth >= 99 ? '∞' : state.tile.depth}`,
    filter: opts.filter, fparams: paramText(FILTER[opts.filter], opts.filterParams),
    interp: opts.interp, iparams: paramText(INTERP[opts.interp], opts.interpParams), cell: opts.cell,
    typeI: r.confusion.typeI, typeII: r.confusion.typeII, kappa: r.confusion.kappa,
    rmse: Object.fromEntries(ZONES.map((z) => [z, r.errors[z].rmse])), mean: r.errors.all.mean,
    ms: r.timings.totalMs,
  });
  renderHistory();
}

function renderHistory() {
  const head = ['hst.run', 'hst.tile', 'hst.filter', 'hst.params', 'hst.interp', 'k.typeI', 'k.typeII', 'k.kappa', 'e.mean', ...ZONES.map((z) => `z.${z}`), 'hst.time'];
  const th = head.map((k, i) => `<th${i > 4 ? ' class="num"' : ''}>${plain(k)}${i >= 9 && i < 9 + ZONES.length ? ' RMSE' : ''}</th>`).join('');
  const rows = state.history.slice().reverse().map((h) => `<tr><td>${h.n}</td><td class="mono">${h.tile}</td><td>${plain(`flt.${h.filter}`).split(' (')[0]}</td><td class="mono">${h.fparams}</td><td>${plain(`int.${h.interp}`)} <span class="mono">${h.iparams} cell=${h.cell}</span></td>
    <td class="num">${fmtPct(h.typeI)}</td><td class="num">${fmtPct(h.typeII)}</td><td class="num">${fmtM(h.kappa)}</td><td class="num">${fmtM(h.mean)}</td>
    ${ZONES.map((z) => `<td class="num">${fmtM(h.rmse[z])}</td>`).join('')}<td class="num">${Math.round(h.ms)} ms</td></tr>`).join('');
  $('histTable').innerHTML = `<tr>${th}</tr>${rows}`;
}

function downloadCsv() {
  const cols = ['n', 'tile', 'filter', 'fparams', 'interp', 'iparams', 'cell', 'typeI', 'typeII', 'kappa', 'mean', ...ZONES.map((z) => `rmse_${z}`), 'ms'];
  const esc = (v) => (typeof v === 'string' && /[",;\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [cols.join(',')].concat(state.history.map((h) => cols.map((c) => esc(c.startsWith('rmse_') ? h.rmse[c.slice(5)] : h[c])).join(',')));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
  a.download = 'dtm_lab_runs.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------------------------------------------------------------- boot
function boot() {
  bootLanguage();
  labelSelects();
  setTabs(document.querySelector('.col-right .card'));
  document.querySelector('.col-right .card').addEventListener('tab', (e) => {
    if (e.detail === 'profile') renderProfile();
  });
  $('preset').addEventListener('change', () => { setPreset($('preset').value); drawTileBox(); });
  ['cx', 'cy', 'size'].forEach((id) => $(id).addEventListener('change', () => { if (id !== 'size') $('preset').value = ''; drawTileBox(); }));
  $('filter').addEventListener('change', () => { filterForm(); $('filterDesc').textContent = plain(`fd.${$('filter').value}`); });
  $('interp').addEventListener('change', () => { interpForm(); $('interpDesc').textContent = plain(`id.${$('interp').value}`); });
  $('btnFilterDefaults').addEventListener('click', filterForm);
  $('btnLoad').addEventListener('click', () => track(load()));
  $('btnRun').addEventListener('click', () => track(run()));
  $('profileY').addEventListener('input', renderProfile);
  $('coloring').addEventListener('change', () => state.viewer && state.v3?.setColoring(state.viewer, $('coloring').value));
  $('showOverlay').addEventListener('change', drawOverlays);
  $('showDtm').addEventListener('change', drawOverlays);
  $('btnFocus').addEventListener('click', () => state.viewer && state.v3?.focusTile(state.viewer));
  $('btnCsv').addEventListener('click', downloadCsv);
  $('btnClear').addEventListener('click', () => { state.history = []; renderHistory(); });
  onLanguage(() => { labelSelects(); filterForm(); interpForm(); renderHistory(); if (state.result) render(); });

  // URL parameters make a tile reproducible (and drive the browser test).
  for (const k of ['filter', 'interp']) if (q.get(k) && (k === 'filter' ? FILTER : INTERP)[q.get(k)]) $(k).value = q.get(k);
  labelSelects(); filterForm(); interpForm();
  if (q.get('cx') && q.get('cy')) {
    $('cx').value = q.get('cx'); $('cy').value = q.get('cy'); $('preset').value = '';
  } else {
    $('preset').value = 'mixed'; setPreset('mixed');
  }
  if (q.get('size')) $('size').value = q.get('size');
  if (q.get('depth')) $('depth').value = q.get('depth');
  renderHistory();
  showResults(false);
  stepState(1, 'active');
  startViewer();
  track(load());
}

window.__lab = {
  state,
  ready: () => state.busy.then(() => true),
  load: () => track(load()),
  run: () => track(run()),
};
boot();
