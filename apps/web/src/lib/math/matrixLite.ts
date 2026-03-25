// src/lib/math/matrixLite.ts
export type Mat = number[][];
export type Vec2 = { x: number; y: number };

export function parseCell(s: string): number {
  const t = String(s ?? "").trim();
  if (!t) return 0;

  // simple fraction support: "-3/4"
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)\s*\/\s*([+-]?\d+(?:\.\d+)?)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return a / b;
  }

  const v = Number(t);
  return Number.isFinite(v) ? v : 0;
}

export function gridToMat(grid: string[][]): Mat {
  return grid.map((row) => row.map(parseCell));
}

export function shape(A: Mat) {
  return { r: A.length, c: A[0]?.length ?? 0 };
}

export function transpose(A: Mat): Mat {
  const { r, c } = shape(A);
  const T: Mat = Array.from({ length: c }, () => Array(r).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) T[j][i] = A[i][j];
  return T;
}

export function matmul(A: Mat, B: Mat): Mat {
  const { r: ar, c: ac } = shape(A);
  const { r: br, c: bc } = shape(B);
  if (ac !== br) throw new Error(`matmul shape mismatch (${ar}x${ac})·(${br}x${bc})`);
  const C: Mat = Array.from({ length: ar }, () => Array(bc).fill(0));
  for (let i = 0; i < ar; i++) {
    for (let k = 0; k < ac; k++) {
      const aik = A[i][k];
      for (let j = 0; j < bc; j++) C[i][j] += aik * B[k][j];
    }
  }
  return C;
}

export function sub(A: Mat, B: Mat): Mat {
  const { r, c } = shape(A);
  const C: Mat = Array.from({ length: r }, () => Array(c).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) C[i][j] = A[i][j] - B[i][j];
  return C;
}

export function frob(A: Mat): number {
  let s = 0;
  for (const row of A) for (const v of row) s += v * v;
  return Math.sqrt(s);
}

export function trace(A: Mat): number {
  const { r, c } = shape(A);
  const n = Math.min(r, c);
  let t = 0;
  for (let i = 0; i < n; i++) t += A[i][i];
  return t;
}

export function det2(A: Mat): number {
  return (A[0]?.[0] ?? 0) * (A[1]?.[1] ?? 0) - (A[0]?.[1] ?? 0) * (A[1]?.[0] ?? 0);
}

export function addLambdaI2(A: Mat, lam: number): Mat {
  return [
    [A[0][0] + lam, A[0][1]],
    [A[1][0], A[1][1] + lam],
  ];
}

export function subLambdaI2(A: Mat, lam: number): Mat {
  return [
    [A[0][0] - lam, A[0][1]],
    [A[1][0], A[1][1] - lam],
  ];
}

export function mat2MulVec2(A: Mat, v: Vec2): Vec2 {
  return {
    x: A[0][0] * v.x + A[0][1] * v.y,
    y: A[1][0] * v.x + A[1][1] * v.y,
  };
}

export function rank(A: Mat, tol = 1e-10): number {
  const M = A.map((r) => r.slice());
  const { r, c } = shape(M);
  let row = 0;
  let pivots = 0;

  for (let col = 0; col < c && row < r; col++) {
    // find pivot
    let pivotRow = row;
    for (let i = row; i < r; i++) {
      if (Math.abs(M[i][col]) > Math.abs(M[pivotRow][col])) pivotRow = i;
    }
    if (Math.abs(M[pivotRow][col]) <= tol) continue;

    // swap
    [M[row], M[pivotRow]] = [M[pivotRow], M[row]];

    // eliminate below
    const pv = M[row][col];
    for (let i = row + 1; i < r; i++) {
      const f = M[i][col] / pv;
      if (Math.abs(f) <= tol) continue;
      for (let j = col; j < c; j++) M[i][j] -= f * M[row][j];
    }

    pivots++;
    row++;
  }

  return pivots;
}

export function nullDir2(A: Mat, tol = 1e-10): Vec2 | null {
  // find a nontrivial y so that Ay≈0 when rank=1
  const a = A[0][0], b = A[0][1];
  const c = A[1][0], d = A[1][1];

  // pick the row with larger norm, take perpendicular
  const n1 = a * a + b * b;
  const n2 = c * c + d * d;
  const r = n1 >= n2 ? { x: a, y: b } : { x: c, y: d };
  const y = { x: r.y, y: -r.x }; // perpendicular to chosen row

  const Ay = mat2MulVec2(A, y);
  const err = Math.hypot(Ay.x, Ay.y);
  if (err > tol * 10) return null;

  const m = Math.hypot(y.x, y.y) || 1;
  return { x: y.x / m, y: y.y / m };
}
