// src/lib/math/vec3.ts
export type Mode = "2d" | "3d";
export type Vec3 = { x: number; y: number; z: number };

export const COLORS = {
  bg: "#0b0d12",
  text: "rgba(232,236,255,0.92)",
  muted: "rgba(170,179,214,0.92)",
  a: "#7aa2ff",
  b: "#ff6bd6",
  proj: "#53f7b6",
  perp: "#ffdf6b",
  axis: "rgba(255,255,255,0.18)",
  grid: "rgba(255,255,255,0.07)",
};

export function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}
export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}
export function mul(v: Vec3, k: number): Vec3 {
  return { x: v.x * k, y: v.y * k, z: v.z * k };
}
export function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
export function mag(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z);
}
export function safeUnit(v: Vec3): Vec3 | null {
  const m = mag(v);
  if (!Number.isFinite(m) || m <= 1e-9) return null;
  return { x: v.x / m, y: v.y / m, z: v.z / m };
}
export function angleBetween(a: Vec3, b: Vec3) {
  const ma = mag(a);
  const mb = mag(b);
  if (ma <= 1e-9 || mb <= 1e-9) return NaN;
  const c = clamp(dot(a, b) / (ma * mb), -1, 1);
  return Math.acos(c);
}
export function radToDeg(r: number) {
  return (r * 180) / Math.PI;
}
export function fmt(n: number, d = 3) {
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}
export function fmt2(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

export function projOfAonB(a: Vec3, b: Vec3): Vec3 {
  const bb = dot(b, b);
  if (bb <= 1e-9) return { x: NaN, y: NaN, z: NaN };
  const k = dot(a, b) / bb;
  return mul(b, k);
}
export function scalarProjOfAonB(a: Vec3, b: Vec3) {
  const ub = safeUnit(b);
  if (!ub) return NaN;
  return dot(a, ub);
}



export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function areCollinear2D(a: Vec3, b: Vec3, eps = 1e-6) {
  return Math.abs(a.x * b.y - a.y * b.x) < eps;
}
