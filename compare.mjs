// Whole-cloud comparison: PDAL products of scripts/build_products.py (manifest + quantised rasters).
import { bootLanguage, onLanguage, plain, t } from './i18n.mjs';
import { PRODUCTS_URL } from './config.mjs';
import { pecClass } from './core/metrics.mjs';
import { ZONES } from './core/pipeline.mjs';
import { fmtPct, fmtM } from './ui.mjs';
import { drawHillshade, drawDiverging, drawRate, palette } from './views/maps.mjs';

const $ = (id) => document.getElementById(id);
const LAYERS = ['dtm', 'dz', 't1', 't2', 'ref', 'zones'];
const state = { manifest: null, cache: new Map(), sides: {} };

async function fetchRaster(name) {
  if (state.cache.has(name)) return state.cache.get(name);
  const p = fetch(new URL(name, new URL(PRODUCTS_URL, location.href))).then((r) => {
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r.arrayBuffer();
  }).then((buf) => {
    const g = state.manifest.grid;
    if (name.endsWith('.u16')) {
      const v = new Uint16Array(buf);
      return Float32Array.from(v, (q) => (q === 65535 ? NaN : g.zbase + q / 100));
    }
    const v = new Uint8Array(buf);
    return name === 'zones.u8' ? v : Float32Array.from(v, (q) => (q === 255 ? NaN : q / 250));
  });
  state.cache.set(name, p);
  return p;
}

function renderTable() {
  const m = state.manifest, eq = Number($('eq').value) || 1;
  const zones = ZONES;
  const head = ['cmp.filter', 'cmp.interp', 'k.typeI', 'k.typeII', 'c.total', 'k.kappa', 'e.mean', ...zones.map((z) => `z.${z}`), 'e.pec', 'cmp.seconds', 'cmp.download'];
  const th = head.map((k, i) => `<th${i > 1 ? ' class="num"' : ''}>${plain(k)}${i >= 7 && i < 7 + zones.length ? ' RMSE' : ''}</th>`).join('');
  const rows = [];
  for (const [f, res] of Object.entries(m.results)) {
    const c = res.confusion;
    for (const [i, d] of Object.entries(res.dtms)) {
      const e = d.errors;
      rows.push(`<tr><td>${plain(`flt.${f}`).split(' (')[0]}</td><td>${plain(`int.${i}`)}</td>
        <td class="num">${fmtPct(c.typeI)}</td><td class="num">${fmtPct(c.typeII)}</td><td class="num">${fmtPct(c.total)}</td><td class="num">${fmtM(c.kappa)}</td>
        <td class="num">${fmtM(e.all.mean)}</td>${zones.map((z) => `<td class="num">${fmtM(e[z]?.rmse)}</td>`).join('')}
        <td class="num pec">${pecClass(e.all, eq) ?? '—'}</td><td class="num">${res.filterSeconds}</td>
        <td><a href="${new URL(`cog/${f}_${i}.tif`, new URL(PRODUCTS_URL, location.href)).href}" download>${plain('cmp.download')}</a></td></tr>`);
    }
  }
  $('sumTable').innerHTML = `<tr>${th}</tr>${rows.join('')}`;
}

function sideControls(side) {
  const root = document.querySelector(`[data-side="${side}"]`);
  const sel = (role) => root.querySelector(`[data-role="${role}"]`);
  const fill = (s, items, key) => {
    const cur = s.value;
    s.innerHTML = items.map((v) => `<option value="${v}">${plain(key(v)).split(' (')[0]}</option>`).join('');
    if (items.includes(cur)) s.value = cur;
  };
  fill(sel('layer'), LAYERS, (v) => `cmp.l.${v}`);
  fill(sel('filter'), Object.keys(state.manifest.results), (v) => `flt.${v}`);
  fill(sel('interp'), state.manifest.interpolators, (v) => `int.${v}`);
  return { root, sel };
}

async function drawSide(side) {
  const { root, sel } = state.sides[side];
  const layer = sel('layer').value, f = sel('filter').value, i = sel('interp').value;
  sel('filter').disabled = layer === 'ref' || layer === 'zones';
  sel('interp').disabled = !['dtm', 'dz'].includes(layer);
  const g = state.manifest.grid, canvas = sel('map'), legend = sel('legend');
  let values, describe;
  if (layer === 'dtm' || layer === 'ref') {
    values = await fetchRaster(layer === 'ref' ? 'ref_tin.u16' : `${f}_${i}.u16`);
    drawHillshade(canvas, values, g.w, g.h, g.cell);
    legend.innerHTML = '';
    describe = (v) => `${fmtM(v, 2)} m`;
  } else if (layer === 'dz') {
    const [d, r] = await Promise.all([fetchRaster(`${f}_${i}.u16`), fetchRaster('ref_tin.u16')]);
    values = d.map((v, k) => v - r[k]);
    drawDiverging(canvas, values, g.w, g.h, 2);
    legend.innerHTML = `<span><i class="sw sw-neg"></i>−2 m</span><span><i class="sw sw-mid"></i>0</span><span><i class="sw sw-pos"></i>+2 m</span>`;
    describe = (v) => `Δz ${fmtM(v, 2)} m`;
  } else if (layer === 't1' || layer === 't2') {
    values = await fetchRaster(`${f}_${layer}.u8`);
    drawRate(canvas, values, g.w, g.h, layer === 't2' ? 'typeII' : 'typeI');
    legend.innerHTML = `<span><i class="sw sw-mid"></i>0%</span><span><i class="sw ${layer === 't2' ? 'sw-type2' : 'sw-type1'}"></i>100%</span>`;
    describe = (v) => `${plain('cmp.rate')} ${fmtPct(v)}`;
  } else {
    const z = await fetchRaster('zones.u8'), P = palette();
    const colors = [P.empty, [214, 211, 205], [27, 175, 122], [235, 104, 52]];
    canvas.width = g.w; canvas.height = g.h;
    const ctx = canvas.getContext('2d'), img = ctx.createImageData(g.w, g.h);
    for (let r = 0; r < g.h; r++) for (let c = 0; c < g.w; c++) {
      const col = colors[z[r * g.w + c]], o = ((g.h - 1 - r) * g.w + c) * 4;
      img.data.set([...col, 255], o);
    }
    ctx.putImageData(img, 0, 0);
    values = z;
    legend.innerHTML = ['open', 'vegetation', 'building'].map((k, j) => `<span><i class="sw" style="background:rgb(${colors[j + 1].join(',')})"></i>${plain(`z.${k}`)}</span>`).join('');
    describe = (v) => (v ? plain(`z.${['', 'open', 'vegetation', 'building'][v]}`) : '—');
  }
  const tip = sel('tip');
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const c = Math.floor(((e.clientX - rect.left) / rect.width) * g.w), r = g.h - 1 - Math.floor(((e.clientY - rect.top) / rect.height) * g.h);
    if (c < 0 || c >= g.w || r < 0 || r >= g.h) { tip.hidden = true; return; }
    tip.hidden = false;
    tip.style.left = `${Math.min(e.clientX - rect.left + 12, rect.width - 170)}px`;
    tip.style.top = `${e.clientY - rect.top + 12}px`;
    tip.innerHTML = `E ${(g.x0 + (c + 0.5) * g.cell).toFixed(1)}<br>N ${(g.y0 + (r + 0.5) * g.cell).toFixed(1)}<br>${describe(values[r * g.w + c])}`;
  };
  canvas.onmouseleave = () => { tip.hidden = true; };
  root.dataset.ready = '1';
}

async function boot() {
  bootLanguage();
  $('cmpStatus').textContent = t('cmp.loading');
  try {
    const r = await fetch(new URL('manifest.json', new URL(PRODUCTS_URL, location.href)));
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    state.manifest = await r.json();
  } catch (err) {
    $('cmpStatus').textContent = t('cmp.missing', { msg: err.message });
    window.__cmp = { ready: () => Promise.resolve(false), state };
    return;
  }
  $('cmpStatus').textContent = `${state.manifest.source} · ${state.manifest.grid.w} × ${state.manifest.grid.h} · ${state.manifest.grid.cell} m · ${state.manifest.snapshot}`;
  for (const side of ['left', 'right']) {
    state.sides[side] = sideControls(side);
    state.sides[side].root.querySelectorAll('select').forEach((s) => s.addEventListener('change', () => drawSide(side)));
  }
  state.sides.left.sel('layer').value = 'dz';
  state.sides.right.sel('layer').value = 't2';
  $('eq').addEventListener('change', renderTable);
  onLanguage(() => { renderTable(); for (const side of ['left', 'right']) { sideControls(side); drawSide(side); } });
  renderTable();
  const drawn = Promise.all([drawSide('left'), drawSide('right')]);
  window.__cmp = { ready: () => drawn.then(() => true), state };
}

boot();
