"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import VectorPad from "@/components/vectorpad/VectorPad";
import type { VectorPadState } from "@/components/vectorpad/types";
import type { Mode, Vec3 } from "@/lib/math/vec3";
import { mag, safeUnit, mul, cross, areCollinear2D } from "@/lib/math/vec3";
import { useZHeldRef } from "@/components/vectorpad/useZHeldRef";
import { useRafForceUpdate } from "@/components/vectorpad/useRafForceUpdate";
import { useTranslations } from "next-intl";

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}
function fmt(n: number) {
  return (Math.round(n * 100) / 100).toFixed(2);
}
function fmt3(n: number) {
  return (Math.round(n * 1000) / 1000).toFixed(3);
}
function det2(a: Vec3, b: Vec3) {
  return a.x * b.y - a.y * b.x;
}
function dot(a: Vec3, b: Vec3) {
  return a.x * b.x + a.y * b.y + (a.z ?? 0) * (b.z ?? 0);
}
function angleRad(a: Vec3, b: Vec3) {
  const ma = mag(a);
  const mb = mag(b);
  if (ma < 1e-9 || mb < 1e-9) return 0;
  const c = clamp(dot(a, b) / (ma * mb), -1, 1);
  return Math.acos(c);
}
function vecStr(v: Vec3, mode: Mode, fmtNum: (n: number) => string) {
  return mode === "3d"
    ? `(${fmtNum(v.x)}, ${fmtNum(v.y)}, ${fmtNum(v.z ?? 0)})`
    : `(${fmtNum(v.x)}, ${fmtNum(v.y)})`;
}
function rand(lo: number, hi: number) {
  return lo + Math.random() * (hi - lo);
}
function randInt(lo: number, hi: number) {
  return Math.floor(rand(lo, hi + 1));
}
function isFiniteVec(v: Vec3) {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z ?? 0);
}

export default function SpanBasisModule({
  mode = "2d",
  className,
}: {
  mode?: Mode;
  className?: string;
}) {
  const t = useTranslations("SpanBasis");

  // ✅ shared z tracking
  const { zHeldRef } = useZHeldRef();

  // ✅ smooth rerender helper (RAF-throttled)
  const bump = useRafForceUpdate();

  // Single source of truth for VectorPad + overlays
  const stateRef = useRef<VectorPadState>({
    a: { x: 2, y: 1, z: 0 },
    b: { x: 1, y: 2, z: 0 },

    scale: 80,

    showGrid: true,
    autoGridStep: true,
    snapToGrid: true,
    gridStep: 1,

    showComponents: false,
    showAngle: false,
    showProjection: false,
    showPerp: false,
    showUnitB: false,

    depthMode: false,

    view: "span",
    showSpan: true,
    showCell: true,
    alpha: 1,
    beta: 1,
  });

  const st = stateRef.current;

  // -----------------------------
  // Fun extras (UI-only state)
  // -----------------------------
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 0.25..3
  const phaseRef = useRef(0);

  const [targetEnabled, setTargetEnabled] = useState(true);
  const [target, setTarget] = useState<Vec3>({ x: 2, y: 2, z: 0 });

  // Keep target.z aligned with mode
  useEffect(() => {
    setTarget((tt) => ({ ...tt, z: mode === "3d" ? (tt.z ?? 0) : 0 }));
  }, [mode]);

  // α/β animator (mutates ref, then bumps render)
  useEffect(() => {
    if (!playing) return;

    let raf = 0;
    const tick = () => {
      phaseRef.current += 0.018 * speed;
      const p = phaseRef.current;

      st.alpha = clamp(Math.sin(p) * 2.4 + Math.sin(p * 0.5) * 0.5, -3, 3);
      st.beta = clamp(Math.cos(p * 0.9) * 2.4, -3, 3);

      bump();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed]);

  // -----------------------------
  // Derived math for UI
  // -----------------------------
  const A = st.a;
  const B = st.b;

  const alpha = st.alpha ?? 1;
  const beta = st.beta ?? 1;

  const X: Vec3 = useMemo(
    () => ({
      x: A.x * alpha + B.x * beta,
      y: A.y * alpha + B.y * beta,
      z: mode === "3d" ? (A.z ?? 0) * alpha + (B.z ?? 0) * beta : 0,
    }),
    [A.x, A.y, A.z, B.x, B.y, B.z, alpha, beta, mode]
  );

  const dependent = useMemo(() => {
    if (mag(A) < 1e-9 || mag(B) < 1e-9) return true;
    if (mode === "2d") return areCollinear2D(A, B);
    return mag(cross(A, B)) < 1e-6;
  }, [A.x, A.y, A.z, B.x, B.y, B.z, mode]);

  const spanDim = dependent ? 1 : 2;

  const area2D = Math.abs(det2(A, B));
  const n = cross(A, B);
  const planeArea3D = mag(n);
  const angDeg = (angleRad(A, B) * 180) / Math.PI;

  const targetDiff = useMemo(() => {
    const dz = mode === "3d" ? (X.z ?? 0) - (target.z ?? 0) : 0;
    return {
      dx: X.x - target.x,
      dy: X.y - target.y,
      dz,
      dist: Math.hypot(X.x - target.x, X.y - target.y, dz),
    };
  }, [X.x, X.y, X.z, target.x, target.y, target.z, mode]);

  // -----------------------------
  // Overlays (live sync)
  // -----------------------------
  const overlay2D = ({
    s,
    W,
    H,
    origin,
    worldToScreen2,
  }: {
    s: any;
    W: number;
    H: number;
    origin: () => { x: number; y: number };
    worldToScreen2: (v: Vec3) => { x: number; y: number };
  }) => {
    const stLive = stateRef.current;
    if (stLive.view !== "span") return;

    const A2 = stLive.a;
    const B2 = stLive.b;
    const a2 = stLive.alpha ?? 1;
    const b2 = stLive.beta ?? 1;

    const X2: Vec3 = { x: A2.x * a2 + B2.x * b2, y: A2.y * a2 + B2.y * b2, z: 0 };

    const dep2 = mag(A2) < 1e-9 || mag(B2) < 1e-9 ? true : areCollinear2D(A2, B2);

    const o = origin();
    const showSpan = !!stLive.showSpan;
    const showCell = !!stLive.showCell;

    const drawArrow = (from: { x: number; y: number }, to: { x: number; y: number }, weight = 4) => {
      s.push();
      s.stroke("rgba(255,255,255,0.85)");
      s.strokeWeight(weight);
      s.noFill();
      s.line(from.x, from.y, to.x, to.y);
      const ang = Math.atan2(to.y - from.y, to.x - from.x);
      const headLen = 12;
      s.push();
      s.translate(to.x, to.y);
      s.rotate(ang);
      s.line(0, 0, -headLen, -headLen * 0.55);
      s.line(0, 0, -headLen, headLen * 0.55);
      s.pop();
      s.pop();
    };

    // 1) subspace line if dependent
    if (showSpan && dep2) {
      const dir = safeUnit(A2) ?? safeUnit(B2);
      if (dir) {
        const Lpx = Math.max(W, H);
        const L = Lpx / stLive.scale;
        const p1 = worldToScreen2(mul(dir, -L));
        const p2 = worldToScreen2(mul(dir, L));

        s.push();
        s.stroke("rgba(255,255,255,0.16)");
        s.strokeWeight(8);
        s.line(p1.x, p1.y, p2.x, p2.y);
        s.pop();

        s.push();
        s.noStroke();
        s.fill("rgba(255,255,255,0.80)");
        s.textSize(12);
        s.textAlign(s.LEFT, s.TOP);
        s.text(t("overlay.spanCollapses"), 12, 44);
        s.pop();
      }
    }

    // 2) cell parallelogram if independent
    if (showCell && !dep2) {
      const pA = worldToScreen2(A2);
      const pB = worldToScreen2(B2);
      const pAB = worldToScreen2({ x: A2.x + B2.x, y: A2.y + B2.y, z: 0 });

      s.push();
      s.noStroke();
      s.fill("rgba(122,162,255,0.08)");
      s.beginShape();
      s.vertex(o.x, o.y);
      s.vertex(pA.x, pA.y);
      s.vertex(pAB.x, pAB.y);
      s.vertex(pB.x, pB.y);
      s.endShape(s.CLOSE);
      s.pop();

      s.push();
      s.stroke("rgba(255,255,255,0.22)");
      s.strokeWeight(2);
      s.noFill();
      s.line(o.x, o.y, pA.x, pA.y);
      s.line(o.x, o.y, pB.x, pB.y);
      s.line(pA.x, pA.y, pAB.x, pAB.y);
      s.line(pB.x, pB.y, pAB.x, pAB.y);
      s.pop();

      s.push();
      s.noStroke();
      s.fill("rgba(255,255,255,0.80)");
      s.textSize(12);
      s.textAlign(s.LEFT, s.TOP);
      s.text(t("overlay.cellLattice"), 12, 44);
      s.pop();
    }

    // 3) combo vector x = αa + βb
    const tip = worldToScreen2(X2);
    drawArrow(o, tip, 4);

    s.push();
    s.noStroke();
    s.fill("rgba(255,255,255,0.88)");
    s.textSize(12);
    s.textAlign(s.LEFT, s.CENTER);
    s.text(t("overlay.combo", { alpha: fmt(a2), beta: fmt(b2) }), tip.x + 10, tip.y);
    s.pop();

    // 4) target overlay
    let dist = 0;
    if (targetEnabled) {
      dist = Math.hypot(X2.x - target.x, X2.y - target.y);

      const tTip = worldToScreen2(target);
      s.push();
      s.stroke("rgba(80,255,180,0.9)");
      s.strokeWeight(3);
      s.line(o.x, o.y, tTip.x, tTip.y);
      s.pop();

      s.push();
      s.noStroke();
      s.fill("rgba(80,255,180,0.9)");
      s.textSize(12);
      s.textAlign(s.LEFT, s.CENTER);
      s.text(t("overlay.targetLabel"), tTip.x + 10, tTip.y);
      s.pop();
    }

    // 5) status badge
    s.push();
    s.noStroke();
    s.fill("rgba(0,0,0,0.35)");
    s.rect(10, H - 52, 460, 40, 12);
    s.fill("rgba(255,255,255,0.86)");
    s.textSize(12);
    s.textAlign(s.LEFT, s.CENTER);

    const badge = dep2
      ? t("overlay.badgeDependent")
      : t("overlay.badgeIndependent", { det: fmt(det2(A2, B2)) });

    const extra = targetEnabled ? `  |  ${t("overlay.error", { value: fmt3(dist) })}` : "";

    s.text(badge + extra, 22, H - 32);
    s.pop();
  };

  const overlay3D = ({
    s,
    W,
    H,
    labelAt,
  }: {
    s: any;
    W: number;
    H: number;
    labelAt: (x: number, y: number, z: number, text: string, col: string) => void;
  }) => {
    const stLive = stateRef.current;
    if (stLive.view !== "span") return;

    const A3 = stLive.a;
    const B3 = stLive.b;
    const a3 = stLive.alpha ?? 1;
    const b3 = stLive.beta ?? 1;

    const X3: Vec3 = {
      x: A3.x * a3 + B3.x * b3,
      y: A3.y * a3 + B3.y * b3,
      z: (A3.z ?? 0) * a3 + (B3.z ?? 0) * b3,
    };

    const dep3 = mag(A3) < 1e-9 || mag(B3) < 1e-9 ? true : mag(cross(A3, B3)) < 1e-6;

    const sc = stLive.scale;

    // plane patch if independent
    if (stLive.showSpan && !dep3) {
      const k = 3;
      const p = (u: number, v: number) => ({
        x: (A3.x * u + B3.x * v) * k * sc,
        y: (-A3.y * u - B3.y * v) * k * sc,
        z: ((A3.z ?? 0) * u + (B3.z ?? 0) * v) * k * sc,
      });

      const p00 = p(-1, -1);
      const p10 = p(1, -1);
      const p11 = p(1, 1);
      const p01 = p(-1, 1);

      s.push();
      s.noStroke();
      s.fill("rgba(122,162,255,0.08)");
      s.beginShape();
      s.vertex(p00.x, p00.y, p00.z);
      s.vertex(p10.x, p10.y, p10.z);
      s.vertex(p11.x, p11.y, p11.z);
      s.vertex(p01.x, p01.y, p01.z);
      s.endShape(s.CLOSE);
      s.pop();

      s.push();
      s.stroke("rgba(255,255,255,0.22)");
      s.strokeWeight(2);
      s.noFill();
      s.beginShape();
      s.vertex(p00.x, p00.y, p00.z);
      s.vertex(p10.x, p10.y, p10.z);
      s.vertex(p11.x, p11.y, p11.z);
      s.vertex(p01.x, p01.y, p01.z);
      s.endShape(s.CLOSE);
      s.pop();

      labelAt(0, 0, 0, t("overlay3d.plane"), "rgba(255,255,255,0.78)");
    }

    // draw combo vector x
    s.push();
    s.stroke("rgba(255,255,255,0.88)");
    s.strokeWeight(4);
    s.line(0, 0, 0, X3.x * sc, -X3.y * sc, (X3.z ?? 0) * sc);
    s.pop();

    labelAt(
      X3.x * sc,
      -X3.y * sc,
      (X3.z ?? 0) * sc,
      t("overlay3d.combo", { alpha: fmt(a3), beta: fmt(b3) }),
      "rgba(255,255,255,0.88)"
    );

    // target vector t
    if (targetEnabled) {
      const dz = (X3.z ?? 0) - (target.z ?? 0);
      const dist = Math.hypot(X3.x - target.x, X3.y - target.y, dz);

      s.push();
      s.stroke("rgba(80,255,180,0.9)");
      s.strokeWeight(3);
      s.line(0, 0, 0, target.x * sc, -target.y * sc, (target.z ?? 0) * sc);
      s.pop();

      labelAt(
        target.x * sc,
        -target.y * sc,
        (target.z ?? 0) * sc,
        t("overlay3d.target", { value: fmt3(dist) }),
        "rgba(80,255,180,0.9)"
      );
    }

    // badge
    s.push();
    s.resetMatrix();
    s.translate(-W / 2, -H / 2);
    s.noStroke();
    s.fill("rgba(0,0,0,0.35)");
    s.rect(10, H - 52, 520, 40, 12);
    s.fill("rgba(255,255,255,0.86)");
    s.textSize(12);
    s.textAlign(s.LEFT, s.CENTER);

    const badge = dep3 ? t("overlay3d.badgeDependent") : t("overlay3d.badgeIndependent");
    s.text(badge, 22, H - 32);
    s.pop();
  };

  // -----------------------------
  // UI helpers (mutate ref + bump)
  // -----------------------------
  const setAlpha = (v: number) => {
    st.alpha = clamp(v, -3, 3);
    bump();
  };
  const setBeta = (v: number) => {
    st.beta = clamp(v, -3, 3);
    bump();
  };

  const setA = (patch: Partial<Vec3>) => {
    const next = { ...st.a, ...patch };
    if (!isFiniteVec(next)) return;
    st.a = next;
    bump();
  };
  const setB = (patch: Partial<Vec3>) => {
    const next = { ...st.b, ...patch };
    if (!isFiniteVec(next)) return;
    st.b = next;
    bump();
  };

  const reset = () => {
    st.a = { x: 2, y: 1, z: 0 };
    st.b = { x: 1, y: 2, z: 0 };
    st.alpha = 1;
    st.beta = 1;
    setTarget({ x: 2, y: 2, z: 0 });
    phaseRef.current = 0;
    setPlaying(false);
    bump();
  };

  const randomIndependent = () => {
    for (let i = 0; i < 12; i++) {
      const aV: Vec3 = { x: randInt(-3, 3), y: randInt(-3, 3), z: mode === "3d" ? randInt(-2, 2) : 0 };
      const bV: Vec3 = { x: randInt(-3, 3), y: randInt(-3, 3), z: mode === "3d" ? randInt(-2, 2) : 0 };
      if (mag(aV) < 1e-9 || mag(bV) < 1e-9) continue;

      const dep = mode === "2d" ? areCollinear2D(aV, bV) : mag(cross(aV, bV)) < 1e-6;

      if (!dep) {
        st.a = aV;
        st.b = bV;
        bump();
        return;
      }
    }
    st.a = { x: 2, y: 1, z: 0 };
    st.b = { x: 1, y: 2, z: 0 };
    bump();
  };

  const makeDependent = () => {
    const k = randInt(-3, 3) || 2;
    st.b = { x: st.a.x * k, y: st.a.y * k, z: (st.a.z ?? 0) * k };
    bump();
  };

  const snapAlphaBeta = () => {
    st.alpha = clamp(Math.round(st.alpha ?? 0), -3, 3);
    st.beta = clamp(Math.round(st.beta ?? 0), -3, 3);
    bump();
  };

  const newTarget = () => {
    setTarget({
      x: randInt(-4, 4),
      y: randInt(-4, 4),
      z: mode === "3d" ? randInt(-3, 3) : 0,
    });
  };

  const fmtNum = (n: number) => fmt(n);

  return (
    <div className={className ?? "grid grid-cols-1 gap-3 lg:grid-cols-[1fr_380px]"}>
      <div className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <VectorPad
          mode={mode}
          stateRef={stateRef}
          zHeldRef={zHeldRef}
          overlay2D={mode === "2d" ? overlay2D : undefined}
          overlay3D={mode === "3d" ? overlay3D : undefined}
          onPreview={() => bump()}
          onCommit={() => bump()}
          previewThrottleMs={16}
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/30 p-4 text-white">
        <div className="mb-3">
          <div className="text-lg font-semibold">{t("title", { mode: mode.toUpperCase() })}</div>
          <div className="text-sm text-white/70">{t("subtitle")}</div>
        </div>

        {/* Action row */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            onClick={reset}
          >
            {t("buttons.reset")}
          </button>
          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            onClick={randomIndependent}
          >
            {t("buttons.randomIndependent")}
          </button>
          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            onClick={makeDependent}
          >
            {t("buttons.makeDependent")}
          </button>
          <button
            className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
            onClick={snapAlphaBeta}
          >
            {t("buttons.snap")}
          </button>
        </div>

        {/* Toggles */}
        <div className="space-y-3">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm text-white/80">{t("toggles.showSpan")}</span>
            <input
              type="checkbox"
              checked={!!st.showSpan}
              onChange={(e) => {
                st.showSpan = e.target.checked;
                bump();
              }}
            />
          </label>

          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-sm text-white/80">{t("toggles.showCell")}</span>
            <input
              type="checkbox"
              checked={!!st.showCell}
              onChange={(e) => {
                st.showCell = e.target.checked;
                bump();
              }}
            />
          </label>

          {mode === "3d" && (
            <label className="flex cursor-pointer items-center justify-between gap-3">
              <span className="text-sm text-white/80">{t("toggles.depthMode")}</span>
              <input
                type="checkbox"
                checked={!!st.depthMode}
                onChange={(e) => {
                  st.depthMode = e.target.checked;
                  bump();
                }}
              />
            </label>
          )}
        </div>

        {/* Vector inputs */}
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="text-sm font-semibold text-white/90">{t("vectors.title")}</div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="mb-2 text-xs text-white/60">{t("vectors.a")}</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  value={String(A.x)}
                  onChange={(e) => setA({ x: Number(e.target.value) })}
                />
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  value={String(A.y)}
                  onChange={(e) => setA({ y: Number(e.target.value) })}
                />
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  disabled={mode !== "3d"}
                  value={String(mode === "3d" ? (A.z ?? 0) : 0)}
                  onChange={(e) => setA({ z: Number(e.target.value) })}
                />
              </div>
              <div className="mt-1 text-[11px] text-white/45">{t("vectors.xyz")}</div>
            </div>

            <div>
              <div className="mb-2 text-xs text-white/60">{t("vectors.b")}</div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  value={String(B.x)}
                  onChange={(e) => setB({ x: Number(e.target.value) })}
                />
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  value={String(B.y)}
                  onChange={(e) => setB({ y: Number(e.target.value) })}
                />
                <input
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                  disabled={mode !== "3d"}
                  value={String(mode === "3d" ? (B.z ?? 0) : 0)}
                  onChange={(e) => setB({ z: Number(e.target.value) })}
                />
              </div>
              <div className="mt-1 text-[11px] text-white/45">{t("vectors.xyz")}</div>
            </div>
          </div>
        </div>

        {/* α/β controls + animator */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">{t("mix.title")}</div>

            <div className="flex items-center gap-2">
              <button
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
                onClick={() => setPlaying((p) => !p)}
              >
                {playing ? t("mix.pause") : t("mix.play")}
              </button>
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/60">{t("mix.speed")}</span>
                <input
                  className="w-28"
                  type="range"
                  min={0.25}
                  max={3}
                  step={0.05}
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">{t("mix.alpha")}</span>
                <span className="text-sm text-white/80">{fmt(alpha)}</span>
              </div>
              <input
                className="w-full"
                type="range"
                min={-3}
                max={3}
                step={0.01}
                value={alpha}
                onChange={(e) => setAlpha(Number(e.target.value))}
              />
              <input
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                value={String(alpha)}
                onChange={(e) => setAlpha(Number(e.target.value))}
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-white/80">{t("mix.beta")}</span>
                <span className="text-sm text-white/80">{fmt(beta)}</span>
              </div>
              <input
                className="w-full"
                type="range"
                min={-3}
                max={3}
                step={0.01}
                value={beta}
                onChange={(e) => setBeta(Number(e.target.value))}
              />
              <input
                className="mt-2 w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
                value={String(beta)}
                onChange={(e) => setBeta(Number(e.target.value))}
              />
            </div>
          </div>
        </div>

        {/* Target mini-game */}
        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white/90">{t("target.title")}</div>
              <div className="text-xs text-white/60">{t("target.subtitle")}</div>
            </div>

            <label className="flex items-center gap-2 text-sm text-white/80">
              <span>{t("target.on")}</span>
              <input type="checkbox" checked={targetEnabled} onChange={(e) => setTargetEnabled(e.target.checked)} />
            </label>
          </div>

          <div className="mb-3 flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
              onClick={newTarget}
              disabled={!targetEnabled}
            >
              {t("target.newTarget")}
            </button>
            <button
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
              onClick={() => setTarget(X)}
              disabled={!targetEnabled}
            >
              {t("target.setTargetEqualsX")}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <input
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
              disabled={!targetEnabled}
              value={String(target.x)}
              onChange={(e) => setTarget((tt) => ({ ...tt, x: Number(e.target.value) }))}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
              disabled={!targetEnabled}
              value={String(target.y)}
              onChange={(e) => setTarget((tt) => ({ ...tt, y: Number(e.target.value) }))}
            />
            <input
              className="w-full rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-sm"
              disabled={!targetEnabled || mode !== "3d"}
              value={String(mode === "3d" ? (target.z ?? 0) : 0)}
              onChange={(e) => setTarget((tt) => ({ ...tt, z: Number(e.target.value) }))}
            />
          </div>

          <div className="mt-2 text-xs text-white/70">
            {t("target.error")} <span className="text-white">{fmt3(targetDiff.dist)}</span>
          </div>
        </div>

        {/* Live data dashboard */}
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-sm font-semibold text-white/90">{t("live.title")}</div>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-white/60">{t("live.a")}</span>
              <span className="font-mono">{vecStr(A, mode, fmtNum)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">{t("live.b")}</span>
              <span className="font-mono">{vecStr(B, mode, fmtNum)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60">{t("live.x")}</span>
              <span className="font-mono">{vecStr(X, mode, fmtNum)}</span>
            </div>

            <div className="mt-1 h-px bg-white/10" />

            <div className="flex items-center justify-between">
              <span className="text-white/60">{t("live.independent")}</span>
              <span className={dependent ? "text-red-200" : "text-emerald-200"}>
                {dependent ? t("live.dependentNo") : t("live.independentYes")}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/60">{t("live.spanDim")}</span>
              <span className="text-white/85">{spanDim}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-white/60">{t("live.angle")}</span>
              <span className="text-white/85">{fmt(angDeg)}°</span>
            </div>

            {mode === "2d" ? (
              <div className="flex items-center justify-between">
                <span className="text-white/60">{t("live.det")}</span>
                <span className="text-white/85">
                  {fmt(det2(A, B))} <span className="text-white/50">({t("live.area", { value: fmt(area2D) })})</span>
                </span>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">{t("live.crossMag")}</span>
                  <span className="text-white/85">{fmt(planeArea3D)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-white/60">{t("live.normal")}</span>
                  <span className="font-mono text-white/85">{vecStr(n, "3d", fmtNum)}</span>
                </div>
              </>
            )}
          </div>

          <div className="text-xs text-white/55">{t("live.tip")}</div>
        </div>
      </div>
    </div>
  );
}
