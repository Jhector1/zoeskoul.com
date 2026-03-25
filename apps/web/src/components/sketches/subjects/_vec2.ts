// src/components/review/sketches/_vec2.ts
import type { Vec3 } from "@/lib/math/vec3";

export type Overlay2DArgs = {
  s: any;
  W: number;
  H: number;
  origin: () => { x: number; y: number };
  worldToScreen2: (v: Vec3) => { x: number; y: number };
};

export function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

export function dot2(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}

export function len(v: Vec3) {
  return Math.hypot(v.x, v.y, v.z ?? 0);
}

export function len2(v: Vec3) {
  return dot2(v, v);
}

export function unit2(v: { x: number; y: number }) {
  const m = Math.hypot(v.x, v.y);
  return m < 1e-12 ? { x: 0, y: 0 } : { x: v.x / m, y: v.y / m };
}

export function mul(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: (v.z ?? 0) * s };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: (a.z ?? 0) - (b.z ?? 0) };
}

export function arrowHead2D(
  s: any,
  from: { x: number; y: number },
  to: { x: number; y: number },
  col: string,
  size = 12
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const L = Math.hypot(dx, dy) || 1;
  const ux = dx / L;
  const uy = dy / L;
  const px = -uy;
  const py = ux;

  const p1 = {
    x: to.x - ux * size - px * (size * 0.55),
    y: to.y - uy * size - py * (size * 0.55),
  };
  const p2 = {
    x: to.x - ux * size + px * (size * 0.55),
    y: to.y - uy * size + py * (size * 0.55),
  };

  s.push();
  s.noStroke();
  s.fill(col);
  s.triangle(to.x, to.y, p1.x, p1.y, p2.x, p2.y);
  s.pop();
}
