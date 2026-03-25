// src/lib/practice/validate/utils/math.ts
export function closeEnough(a: number, b: number, tol: number) {
  return Math.abs(a - b) <= tol;
}

export function compareMatrix(got: number[][], exp: number[][], tol: number) {
  const m1 = got.length;
  const m2 = exp.length;
  const n1 = got[0]?.length ?? 0;
  const n2 = exp[0]?.length ?? 0;

  if (m1 !== m2 || n1 !== n2)
    return { ok: false, shapeOk: false, deltaMax: Infinity };

  let deltaMax = 0;
  for (let r = 0; r < m2; r++) {
    for (let c = 0; c < n2; c++) {
      const a = Number(got[r]?.[c]);
      const b = Number(exp[r]?.[c]);
      if (!Number.isFinite(a) || !Number.isFinite(b))
        return { ok: false, shapeOk: true, deltaMax: Infinity };
      const d = Math.abs(a - b);
      if (d > deltaMax) deltaMax = d;
      if (d > tol) return { ok: false, shapeOk: true, deltaMax };
    }
  }
  return { ok: true, shapeOk: true, deltaMax };
}

// Used only for reveal on vector_drag_dot to show *a* valid example
export function solutionForDot(
  b: { x: number; y: number; z?: number },
  targetDot: number,
  minMag: number,
) {
  const bx = Number(b.x ?? 0),
    by = Number(b.y ?? 0),
    bz = Number(b.z ?? 0);
  const b2 = bx * bx + by * by + bz * bz;
  if (!Number.isFinite(b2) || b2 < 1e-9) return { x: minMag, y: 0, z: 0 };

  const k = targetDot / b2;
  let ax = k * bx,
    ay = k * by,
    az = k * bz;

  // perpendicular direction for padding magnitude
  let px = 0,
    py = 0,
    pz = 0;
  if (Math.abs(bx) + Math.abs(by) > 1e-6) {
    px = -by;
    py = bx;
    pz = 0;
  } else {
    px = 0;
    py = -bz;
    pz = by || 1;
  }

  const pm = Math.sqrt(px * px + py * py + pz * pz) || 1;
  px /= pm;
  py /= pm;
  pz /= pm;

  const am = Math.sqrt(ax * ax + ay * ay + az * az);
  const PAD = 1e-6;
  const need = Math.max(0, (minMag + PAD) - am);
  ax += px * need;
  ay += py * need;
  az += pz * need;

  return { x: ax, y: ay, z: az };
}
