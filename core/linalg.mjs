// Dense linear solve by Gaussian elimination with partial pivoting (small systems: kriging, TPS).
// A is a row-major Float64Array of size n·n and is overwritten; b is overwritten with the solution.
export function solve(A, b, n) {
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col * n + col]);
    for (let r = col + 1; r < n; r++) { const v = Math.abs(A[r * n + col]); if (v > best) { best = v; piv = r; } }
    if (best < 1e-12) return false;
    if (piv !== col) {
      for (let c = 0; c < n; c++) { const t = A[col * n + c]; A[col * n + c] = A[piv * n + c]; A[piv * n + c] = t; }
      const t = b[col]; b[col] = b[piv]; b[piv] = t;
    }
    const d = A[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r * n + col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r * n + c] -= f * A[col * n + c];
      b[r] -= f * b[col];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r * n + c] * b[c];
    b[r] = s / A[r * n + r];
  }
  return true;
}
