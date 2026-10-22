// Quality measures from the deck "Modelagem Digital de Terreno":
// classification errors (Sithole & Vosselman 2004) and DTM height errors (RMSEz, PEC-PCD).

// Reference ground: class 2 (ground) and class 20 (ground set aside near breaklines by the producer).
export const REF_GROUND = new Set([2, 20]);
export const isRefGround = (c) => REF_GROUND.has(c);

// a: ground kept, b: ground rejected (Type I), c: object accepted (Type II), d: object rejected.
export function confusion(cls, ground) {
  let a = 0, b = 0, c = 0, d = 0;
  for (let i = 0; i < cls.length; i++) {
    const ref = isRefGround(cls[i]);
    if (ref) ground[i] ? a++ : b++;
    else ground[i] ? c++ : d++;
  }
  const n = a + b + c + d;
  return {
    a, b, c, d, n,
    typeI: a + b ? b / (a + b) : 0,
    typeII: c + d ? c / (c + d) : 0,
    total: n ? (b + c) / n : 0,
    // Cohen's kappa, common in the ISPRS filter comparisons alongside the three error rates.
    kappa: (() => {
      if (!n) return 0;
      const po = (a + d) / n, pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (n * n);
      return pe === 1 ? 1 : (po - pe) / (1 - pe);
    })(),
  };
}

// PEC-PCD altimetric classes (Decreto 89.817/1984, ET-CQDG), as fractions of the contour interval.
export const PEC_CLASSES = [
  { name: 'A', pec: 0.27, ep: 1 / 6 },
  { name: 'B', pec: 1 / 2, ep: 1 / 3 },
  { name: 'C', pec: 3 / 5, ep: 2 / 5 },
  { name: 'D', pec: 3 / 4, ep: 1 / 2 },
];

// Height-error statistics of `dtm` against `ref` over the cells where both exist and `zone` (optional) is set.
export function heightErrors(dtm, ref, zone) {
  let n = 0, s = 0, s2 = 0;
  const abs = [];
  for (let k = 0; k < ref.length; k++) {
    if (zone && !zone[k]) continue;
    const e = dtm[k] - ref[k];
    if (!Number.isFinite(e)) continue;
    n++; s += e; s2 += e * e; abs.push(Math.abs(e));
  }
  if (!n) return { n: 0, mean: NaN, rmse: NaN, std: NaN, le90: NaN, maxAbs: NaN };
  abs.sort((p, q) => p - q);
  const mean = s / n, rmse = Math.sqrt(s2 / n);
  return {
    n, mean, rmse,
    std: n > 1 ? Math.sqrt(Math.max(0, (s2 - n * mean * mean) / (n - 1))) : 0,
    le90: abs[Math.min(n - 1, Math.ceil(0.9 * n) - 1)],
    maxAbs: abs[n - 1],
  };
}

// Best PEC-PCD class met for a contour interval `eq`: 90% of |errors| under PEC and RMSE at most EP.
export function pecClass(stats, eq) {
  if (!stats.n) return null;
  for (const cl of PEC_CLASSES) if (stats.le90 <= cl.pec * eq && stats.rmse <= cl.ep * eq) return cl.name;
  return '—';
}

// Smallest contour interval for which the DTM reaches class A (handy for the summary table).
export function minEquidistanceA(stats) {
  if (!stats.n) return NaN;
  return Math.max(stats.le90 / PEC_CLASSES[0].pec, stats.rmse / PEC_CLASSES[0].ep);
}
