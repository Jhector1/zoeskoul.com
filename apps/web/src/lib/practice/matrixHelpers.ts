// src/lib/practice/matrixHelpers.ts

// export function clampInt(v: unknown, min: number, max: number) {
//   const n = Math.floor(Number(v));
//   if (!Number.isFinite(n)) return min;
//   return Math.max(min, Math.min(max, n));
// }

export function makeGrid(rows: number, cols: number) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
}

// export function resizeGrid(prev: string[][], rows: number, cols: number) {
//   const next = makeGrid(rows, cols);
//   const pr = prev?.length ?? 0;

//   for (let r = 0; r < Math.min(rows, pr); r++) {
//     const pc = prev?.[r]?.length ?? 0;
//     for (let c = 0; c < Math.min(cols, pc); c++) {
//       next[r][c] = String(prev[r][c] ?? "");
//     }
//   }
//   return next;
// }

export function parseFiniteNumberOrNull(v: unknown) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns number[][] if ALL cells are valid numbers; otherwise null.
 * This prevents "empty value" / NaN submissions.
 */
export function matrixToNumbersOrNull(grid: string[][]) {
  const out: number[][] = [];
  for (const row of grid) {
    const r: number[] = [];
    for (const cell of row) {
      const n = parseFiniteNumberOrNull(cell);
      if (n === null) return null;
      r.push(n);
    }
    out.push(r);
  }
  return out;
}

/**
 * Read initial shape from exercise if present.
 * Add rows/cols to your generator exercise.publicPayload for matrix_input.
 */
export function pickInitialShapeFromExercise(ex: any, fallbackRows = 2, fallbackCols = 2) {
  const rows = clampInt(ex?.rows ?? ex?.matRows ?? ex?.meta?.rows ?? fallbackRows, 1, 12);
  const cols = clampInt(ex?.cols ?? ex?.matCols ?? ex?.meta?.cols ?? fallbackCols, 1, 12);
  return { rows, cols };
}


// src/lib/practice/matrixHelpers.ts
export function clampInt(n: number, min: number, max: number) {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export function resizeGrid(
  prev: string[][] | undefined | null,
  rows: number,
  cols: number,
  fill = "",
) {
  const r = Math.max(1, Math.floor(rows));
  const c = Math.max(1, Math.floor(cols));
  const src = Array.isArray(prev) ? prev : [];

  return Array.from({ length: r }, (_, i) =>
    Array.from({ length: c }, (_, j) => String(src?.[i]?.[j] ?? fill)),
  );
}