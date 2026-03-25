// src/lib/practice/generator/utils.ts
import type { Difficulty, Exercise, Topic, Vec3 } from "../types";
import { RNG } from "./shared/rng";

export const ALL_TOPICS: Topic[] = [
  "dot",
  "projection",
  "angle",
  "vectors",
  "linear_systems",
  "augmented",
  "rref",
  "solution_types",
  "parametric",
  "matrix_ops",
  "matrix_inverse",
  "vectors_part2",
   "vectors_part1",
  "matrix_properties",


  // ✅ Matrices — Part 1
  "matrices_intro",
  "index_slice",
  "special",
  "elementwise_shift",
  "matmul",
  "matvec",
  "transpose_liveevil",
  "symmetric",

 "norms",
  "colspace",
   "nullspace",
 "rank",
   "det",
  "charpoly",
];

export function normalizeTopic(t: Topic | "all", rng: RNG): Topic {
  return t === "all" ? rng.pick(ALL_TOPICS) : t;
}

export function normalizeDifficulty(d: Difficulty | "all", rng: RNG): Difficulty {
  if (d !== "all") return d;
  return rng.weighted([
    { value: "easy" as const, w: 2 },
    { value: "medium" as const, w: 5 },
    { value: "hard" as const, w: 3 },
  ]);
}

export function roundTo(n: number, decimals: number) {
  const p = Math.pow(10, decimals);
  return Math.round(n * p) / p;
}

export function uniq<T>(arr: T[]) {
  return Array.from(new Set(arr));
}

export function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

export function mag2D(v: Vec3) {
  return Math.hypot(v.x, v.y);
}

export function cloneVec(v: any): Vec3 {
  return { x: Number(v?.x ?? 0), y: Number(v?.y ?? 0), z: Number(v?.z ?? 0) };
}

export function toleranceFor(difficulty: Difficulty, kind: Exercise["kind"]) {
  if (kind === "numeric") {
    if (difficulty === "easy") return 0.5;
    if (difficulty === "medium") return 0.15;
    return 0.05;
  }
  if (kind === "vector_drag_dot" || kind === "vector_drag_target") {
    if (difficulty === "easy") return 0.5;
    if (difficulty === "medium") return 0.35;
    return 0.25;
  }
  return 0.25;
}

export function vec2FromDifficulty(rng: RNG, difficulty: Difficulty): Vec3 {
  if (difficulty === "easy") {
    return { x: rng.int(-4, 4), y: rng.int(-4, 4), z: 0 };
  }
  if (difficulty === "medium") {
    return { x: rng.step(-7, 7, 0.5), y: rng.step(-7, 7, 0.5), z: 0 };
  }
  return { x: rng.step(-12, 12, 0.5), y: rng.step(-12, 12, 0.5), z: 0 };
}

export function nonZeroVec(rng: RNG, difficulty: Difficulty): Vec3 {
  let v = vec2FromDifficulty(rng, difficulty);
  let tries = 0;
  while (Math.abs(v.x) + Math.abs(v.y) < 1 && tries < 40) {
    v = vec2FromDifficulty(rng, difficulty);
    tries++;
  }
  return v;
}

export function randNonZeroInt(rng: RNG, min: number, max: number) {
  let x = 0;
  let tries = 0;
  while (x === 0 && tries < 100) {
    x = rng.int(min, max);
    tries++;
  }
  return x === 0 ? 1 : x;
}

export function make2x2(rng: RNG, range: number) {
  return [
    [rng.int(-range, range), rng.int(-range, range)],
    [rng.int(-range, range), rng.int(-range, range)],
  ];
}

export function fmt2x2(A: number[][]) {
  return `[[${A[0][0]}, ${A[0][1]}], [${A[1][0]}, ${A[1][1]}]]`;
}

export function det2(A: number[][]) {
  return A[0][0] * A[1][1] - A[0][1] * A[1][0];
}



// utils.ts
export function fmt2x2Latex(M: number[][]) {
  return String.raw`\begin{bmatrix}${M[0][0]} & ${M[0][1]}\\ ${M[1][0]} & ${M[1][1]}\end{bmatrix}`;
}

export function fmtAugmented2x3Latex(a: number, b: number, c: number, d: number, e: number, f: number) {
  // [ a b | c ; d e | f ]
  return String.raw`\left[\begin{array}{cc|c}${a} & ${b} & ${c}\\ ${d} & ${e} & ${f}\end{array}\right]`;
}

export function fmtSystem2Latex(a: number, b: number, c: number, d: number, e: number, f: number) {
  return String.raw`\begin{cases}
${a}x + ${b}y = ${c}\\
${d}x + ${e}y = ${f}
\end{cases}`;
}
