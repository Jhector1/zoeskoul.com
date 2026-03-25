// src/lib/practice/validate/utils/latex.ts
export function matrixToLatex(values: number[][]) {
  const rows = values
    .map((r) => r.map((v) => String(v)).join(" & "))
    .join(" \\\\ ");
  return String.raw`\begin{bmatrix} ${rows} \end{bmatrix}`;
}

export function vecToLatex(v: { x: number; y: number; z?: number }) {
  const z = typeof v.z === "number" ? `, ${v.z}` : "";
  return String.raw`\langle ${v.x}, ${v.y}${z} \rangle`;
}
