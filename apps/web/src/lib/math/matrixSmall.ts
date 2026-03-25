export type Vec2 = { x: number; y: number };
export type Mat2 = [[number, number], [number, number]];

export function mul2x2(A: Mat2, v: Vec2): Vec2 {
  return {
    x: A[0][0] * v.x + A[0][1] * v.y,
    y: A[1][0] * v.x + A[1][1] * v.y,
  };
}

export function mul2x2Mat(A: Mat2, B: Mat2): Mat2 {
  return [
    [
      A[0][0] * B[0][0] + A[0][1] * B[1][0],
      A[0][0] * B[0][1] + A[0][1] * B[1][1],
    ],
    [
      A[1][0] * B[0][0] + A[1][1] * B[1][0],
      A[1][0] * B[0][1] + A[1][1] * B[1][1],
    ],
  ];
}

export function transpose2(A: Mat2): Mat2 {
  return [
    [A[0][0], A[1][0]],
    [A[0][1], A[1][1]],
  ];
}

export function det2(A: Mat2): number {
  return A[0][0] * A[1][1] - A[0][1] * A[1][0];
}

export function trace2(A: Mat2): number {
  return A[0][0] + A[1][1];
}

export function frob2(A: Mat2): number {
  const s =
    A[0][0] * A[0][0] +
    A[0][1] * A[0][1] +
    A[1][0] * A[1][0] +
    A[1][1] * A[1][1];
  return Math.sqrt(s);
}

export function frobDistance2(A: Mat2, B: Mat2): number {
  return frob2([
    [A[0][0] - B[0][0], A[0][1] - B[0][1]],
    [A[1][0] - B[1][0], A[1][1] - B[1][1]],
  ]);
}

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

export function mag2(v: Vec2) {
  return Math.hypot(v.x, v.y);
}

export function dot2(a: Vec2, b: Vec2) {
  return a.x * b.x + a.y * b.y;
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function mul2(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function safeUnit2(v: Vec2): Vec2 | null {
  const m = mag2(v);
  if (!Number.isFinite(m) || m < 1e-12) return null;
  return { x: v.x / m, y: v.y / m };
}

/**
 * Rank test using simple elimination with tolerance for a 2x2 matrix.
 */
export function rank2(A: Mat2, tol = 1e-10): 0 | 1 | 2 {
  const a = A[0][0],
    b = A[0][1],
    c = A[1][0],
    d = A[1][1];

  const allZero =
    Math.abs(a) < tol &&
    Math.abs(b) < tol &&
    Math.abs(c) < tol &&
    Math.abs(d) < tol;
  if (allZero) return 0;

  const det = det2(A);
  if (Math.abs(det) >= tol) return 2;

  // det ~ 0 but not all zero => rank 1
  return 1;
}

/**
 * Rank of augmented [A | b] where A is 2x2 and b is 2x1.
 * Returns 0/1/2.
 */
export function rankAug2(A: Mat2, b: Vec2, tol = 1e-10): 0 | 1 | 2 {
  // elimination on a 2x3 matrix
  const M = [
    [A[0][0], A[0][1], b.x],
    [A[1][0], A[1][1], b.y],
  ];

  let r = 0;

  // pivot col 0
  const p0 = Math.abs(M[0][0]) >= Math.abs(M[1][0]) ? 0 : 1;
  if (Math.abs(M[p0][0]) > tol) {
    if (p0 === 1) [M[0], M[1]] = [M[1], M[0]];
    const f = M[1][0] / M[0][0];
    for (let j = 0; j < 3; j++) M[1][j] -= f * M[0][j];
    r++;
  }

  // pivot col 1 (on row 1 if row 0 had pivot)
  const row = r === 1 ? 1 : 0;
  if (Math.abs(M[row][1]) > tol) r++;

  // if no pivot yet, try col 1 as first pivot
  if (r === 0) {
    const p1 = Math.abs(M[0][1]) >= Math.abs(M[1][1]) ? 0 : 1;
    if (Math.abs(M[p1][1]) > tol) r = 1;
  }

  return r as 0 | 1 | 2;
}

/**
 * Nullspace basis for 2x2:
 * - if rank 2 => empty (null)
 * - if rank 1 => returns a unit direction n such that A n = 0
 * - if rank 0 => all vectors; returns e1
 */
export function nullspace2(A: Mat2, tol = 1e-10): Vec2 | null {
  const r = rank2(A, tol);
  if (r === 2) return null;
  if (r === 0) return { x: 1, y: 0 };

  // pick a nonzero row and build a perpendicular vector to that row
  const row0: Vec2 = { x: A[0][0], y: A[0][1] };
  const row1: Vec2 = { x: A[1][0], y: A[1][1] };

  const use = mag2(row0) > mag2(row1) ? row0 : row1;
  // if use = [p q], then n = [q, -p] satisfies use·n = 0
  const n = { x: use.y, y: -use.x };
  return safeUnit2(n);
}

/**
 * Eigenvalues for 2x2 real matrix: roots of λ^2 - tr(A) λ + det(A) = 0
 */
export function eigvals2(A: Mat2): { ok: true; l1: number; l2: number } | { ok: false } {
  const tr = trace2(A);
  const det = det2(A);
  const disc = tr * tr - 4 * det;
  if (disc < 0) return { ok: false };
  const s = Math.sqrt(disc);
  return { ok: true, l1: (tr + s) / 2, l2: (tr - s) / 2 };
}

export function detShifted2(A: Mat2, lambda: number): number {
  // det(A - λI)
  return det2([
    [A[0][0] - lambda, A[0][1]],
    [A[1][0], A[1][1] - lambda],
  ]);
}
