// West–east profile across the tile at northing `yAt`: points within ±band coloured by outcome,
// the reference surface (dashed) and the simulated DTM (solid). Hover shows a crosshair and values.
import { palette } from './maps.mjs';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export function drawProfile(canvas, tip, { points, outcome, geom, dtm, refSurface, yAt, band = 0.5, labels }) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth || 600, H = canvas.clientHeight || 280;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const P = palette(), colors = [P.objectOk, P.groundOk, P.typeI, P.typeII];
  const row = Math.max(0, Math.min(geom.h - 1, Math.floor(yAt / geom.cell)));
  const sel = [];
  let zmin = Infinity, zmax = -Infinity;
  for (let i = 0; i < points.n; i++) {
    if (Math.abs(points.y[i] - yAt) > band) continue;
    sel.push(i);
    zmin = Math.min(zmin, points.z[i]); zmax = Math.max(zmax, points.z[i]);
  }
  for (let c = 0; c < geom.w; c++) for (const v of [dtm[row * geom.w + c], refSurface[row * geom.w + c]]) {
    if (Number.isFinite(v)) { zmin = Math.min(zmin, v); zmax = Math.max(zmax, v); }
  }
  if (!Number.isFinite(zmin)) return;
  const pad = { l: 52, r: 12, t: 10, b: 28 };
  const span = geom.w * geom.cell, zr = Math.max(1, zmax - zmin);
  const X = (x) => pad.l + (x / span) * (W - pad.l - pad.r);
  const Y = (z) => H - pad.b - ((z - zmin + 0.05 * zr) / (1.1 * zr)) * (H - pad.t - pad.b);
  // Recessive grid and axes.
  ctx.strokeStyle = css('--grid'); ctx.fillStyle = css('--muted'); ctx.lineWidth = 1;
  ctx.font = '11px ' + css('--font-mono');
  const step = niceStep(zr / 4);
  for (let z = Math.ceil(zmin / step) * step; z <= zmax + 1e-9; z += step) {
    ctx.beginPath(); ctx.moveTo(pad.l, Y(z)); ctx.lineTo(W - pad.r, Y(z)); ctx.stroke();
    ctx.fillText(z.toFixed(step < 1 ? 1 : 0), 4, Y(z) + 4);
  }
  const xs = niceStep(span / 5);
  for (let x = 0; x <= span + 1e-9; x += xs) ctx.fillText(`${x.toFixed(0)} m`, X(x) - 10, H - 8);
  // Points: correct classes first, errors on top.
  for (const pass of [[0, 1], [2, 3]]) for (const code of pass) {
    ctx.fillStyle = `rgb(${colors[code].join(',')})`;
    for (const i of sel) if (outcome[i] === code) ctx.fillRect(X(points.x[i]) - 1.5, Y(points.z[i]) - 1.5, 3, 3);
  }
  const line = (arr, dash, width, color) => {
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
    let pen = false;
    for (let c = 0; c < geom.w; c++) {
      const v = arr[row * geom.w + c];
      if (!Number.isFinite(v)) { pen = false; continue; }
      const px = X((c + 0.5) * geom.cell), py = Y(v);
      pen ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      pen = true;
    }
    ctx.stroke(); ctx.setLineDash([]);
  };
  line(refSurface, [5, 4], 1.5, css('--muted'));
  line(dtm, [], 2, css('--ink'));
  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect(), mx = e.clientX - rect.left;
    const x = ((mx - pad.l) / (W - pad.l - pad.r)) * span;
    if (x < 0 || x > span) { tip.hidden = true; return; }
    const c = Math.min(geom.w - 1, Math.floor(x / geom.cell)), k = row * geom.w + c;
    const d = dtm[k], r = refSurface[k];
    tip.hidden = false;
    tip.style.left = `${Math.min(mx + 12, W - 180)}px`; tip.style.top = '8px';
    tip.innerHTML = `x ${x.toFixed(1)} m<br>${labels.dtm}: ${fmt(d)}<br>${labels.ref}: ${fmt(r)}<br>Δz: ${Number.isFinite(d - r) ? (d - r).toFixed(2) + ' m' : '—'}`;
  };
  canvas.onmouseleave = () => { tip.hidden = true; };
}

const fmt = (v) => (Number.isFinite(v) ? `${v.toFixed(2)} m` : '—');

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
