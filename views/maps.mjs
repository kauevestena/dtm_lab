// 2D raster views drawn on canvas: hillshade, diverging ΔZ, per-point outcome top view, rate maps.
// Rasters follow core/grid.mjs (row 0 = south); canvases draw north up.
// Colours follow the dataviz reference palette: Type I blue, Type II orange (validated all-pairs,
// both modes), neutrals for correct classes, blue↔red diverging with a grey midpoint.

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const hex = (h) => { const v = parseInt(h.replace('#', ''), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; };
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

export function palette() {
  return {
    typeI: hex(css('--c-type1') || '#2a78d6'),
    typeII: hex(css('--c-type2') || '#eb6834'),
    groundOk: hex(css('--c-groundok') || '#8a7a66'),
    objectOk: hex(css('--c-objectok') || '#c9c6bd'),
    neg: hex(css('--c-div-neg') || '#2a78d6'),
    pos: hex(css('--c-div-pos') || '#e34948'),
    mid: hex(css('--c-div-mid') || '#f0efec'),
    empty: hex(css('--c-empty') || '#f5f5f4'),
  };
}

function put(canvas, w, h, rgbAt) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d'), img = ctx.createImageData(w, h);
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const rgb = rgbAt(r, c), o = ((h - 1 - r) * w + c) * 4;
    img.data[o] = rgb[0]; img.data[o + 1] = rgb[1]; img.data[o + 2] = rgb[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Hillshade: Lambert shading with the sun at azimuth 315° (NW), altitude 45°; x east, y north.
export function hillshade(z, w, h, cell, { exaggeration = 2 } = {}) {
  const out = new Float32Array(w * h).fill(NaN);
  const az = (315 * Math.PI) / 180, alt = (45 * Math.PI) / 180;
  const L = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)];
  const at = (r, c, fb) => { const v = z[Math.max(0, Math.min(h - 1, r)) * w + Math.max(0, Math.min(w - 1, c))]; return Number.isFinite(v) ? v : fb; };
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const z0 = z[r * w + c];
    if (!Number.isFinite(z0)) continue;
    const dx = exaggeration * (at(r, c + 1, z0) - at(r, c - 1, z0)) / (2 * cell);
    const dy = exaggeration * (at(r + 1, c, z0) - at(r - 1, c, z0)) / (2 * cell);
    const norm = Math.hypot(dx, dy, 1);
    out[r * w + c] = Math.max(0, (-dx * L[0] - dy * L[1] + L[2]) / norm);
  }
  return out;
}

export function drawHillshade(canvas, z, w, h, cell) {
  const hs = hillshade(z, w, h, cell), P = palette();
  put(canvas, w, h, (r, c) => {
    const v = hs[r * w + c];
    if (!Number.isFinite(v)) return P.empty;
    const g = Math.round(40 + 200 * v);
    return [g, g, g];
  });
}

// Diverging ΔZ: blue below the reference, red above, grey at zero; saturates at ±limit.
export function drawDiverging(canvas, d, w, h, limit) {
  const P = palette();
  put(canvas, w, h, (r, c) => {
    const v = d[r * w + c];
    if (!Number.isFinite(v)) return P.empty;
    const t = Math.max(-1, Math.min(1, v / limit));
    return t < 0 ? mix(P.mid, P.neg, -t) : mix(P.mid, P.pos, t);
  });
}

// Sequential rate (0..1) in one hue, from the surface tone to the full colour.
export function drawRate(canvas, rate, w, h, which) {
  const P = palette(), full = which === 'typeII' ? P.typeII : P.typeI;
  put(canvas, w, h, (r, c) => {
    const v = rate[r * w + c];
    if (!Number.isFinite(v)) return P.empty;
    return mix(P.mid, full, Math.min(1, v));
  });
}

// Top view of the tile's points coloured by outcome; errors are drawn last so they stay visible.
export function drawOutcome(canvas, points, outcome, size, px = 2) {
  const P = palette(), colors = [P.objectOk, P.groundOk, P.typeI, P.typeII];
  const w = Math.round((size[0] / px) * 4), h = Math.round((size[1] / px) * 4);
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = `rgb(${P.empty.join(',')})`;
  ctx.fillRect(0, 0, w, h);
  const sx = w / size[0], sy = h / size[1];
  for (const pass of [[0, 1], [2, 3]]) {
    for (const code of pass) {
      ctx.fillStyle = `rgb(${colors[code].join(',')})`;
      for (let i = 0; i < points.n; i++) {
        if (outcome[i] !== code) continue;
        ctx.fillRect(points.x[i] * sx, h - points.y[i] * sy, 1.2, 1.2);
      }
    }
  }
}

export const OUTCOME_KEYS = ['out.objectOk', 'out.groundOk', 'out.typeI', 'out.typeII'];
