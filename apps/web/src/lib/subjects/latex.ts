// src/lib/review/latex.ts
export function fmtVec2Latex(x: number, y: number) {
  return String.raw`\begin{bmatrix}${x}\\ ${y}\end{bmatrix}`;
}

export function fmtNum(n: number, digits = 2) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toFixed(digits);
}

export function fmtSigned(n: number, digits = 2) {
  const v = Number.isFinite(n) ? n : 0;
  const s = v >= 0 ? "+" : "-";
  return `${s}${Math.abs(v).toFixed(digits)}`;
}
