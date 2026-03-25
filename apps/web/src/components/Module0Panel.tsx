"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { VectorPadState } from "@/components/vectorpad/types";
import type { Mode, Vec3 } from "@/lib/math/vec3";
import {
  COLORS,
  angleBetween,
  clamp,
  dot,
  fmt,
  fmt2,
  mag,
  projOfAonB,
  radToDeg,
  scalarProjOfAonB,
  sub,
} from "@/lib/math/vec3";

type QuestionType = "dot" | "angle" | "scalarProj" | "projX" | "projY" | "projZ";
type StatusKind = "idle" | "good" | "bad";

type Question = {
  id: string;
  type: QuestionType;
  prompt: string;
  correct: number;
  unit?: string;
  tolerance: number;
  createdAt: number;
};

type VectorPadConfig = {
  handles?: { a?: boolean; b?: boolean };
  overlay2D?: any;
  overlay3D?: any;
  previewThrottleMs?: number;
  onPreview?: any;
  onCommit?: any;
  onScaleChange?: any;
};

export default function Module0Panel({
  active,
  mode,
  setMode,
  stateRef,
  zHeldRef,
  applyConfig,
}: {
  active: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  stateRef: React.MutableRefObject<VectorPadState>;
  zHeldRef: React.MutableRefObject<boolean>;
  applyConfig: (patch: VectorPadConfig) => void;
}) {
  // UI sliders / toggles
  const [scale, setScale] = useState<number>(stateRef.current.scale ?? 80);
  const [gridStep, setGridStep] = useState<number>(stateRef.current.gridStep ?? 1);
  const [snapToGrid, setSnapToGrid] = useState<boolean>(!!stateRef.current.snapToGrid);

  const [showGrid, setShowGrid] = useState(!!stateRef.current.showGrid);
  const [showComponents, setShowComponents] = useState(!!stateRef.current.showComponents);
  const [showAngle, setShowAngle] = useState(!!stateRef.current.showAngle);
  const [showProjection, setShowProjection] = useState(!!stateRef.current.showProjection);
  const [showUnitB, setShowUnitB] = useState(!!stateRef.current.showUnitB);
  const [showPerp, setShowPerp] = useState(!!stateRef.current.showPerp);
  const [depthMode, setDepthMode] = useState(!!stateRef.current.depthMode);

  // label/math UI state (mirror of stateRef.current.a/b)
  const [a, setA] = useState<Vec3>(stateRef.current.a);
  const [b, setB] = useState<Vec3>(stateRef.current.b);

  const [zKeyUI, setZKeyUI] = useState(false);

  const [qType, setQType] = useState<QuestionType>("dot");
  const [answerText, setAnswerText] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const [status, setStatus] = useState<{ kind: StatusKind; msg: string }>({
    kind: "idle",
    msg: "Click “New question”. Use overlays to reason visually, then answer.",
  });

  // --- Z key tracking (shared ref) ---
  useEffect(() => {
    const isZ = (e: KeyboardEvent) => e.code === "KeyZ" || e.key === "z" || e.key === "Z";

    const down = (e: KeyboardEvent) => {
      if (!isZ(e)) return;
      zHeldRef.current = true;
      setZKeyUI(true);
    };

    const up = (e: KeyboardEvent) => {
      if (!isZ(e)) return;
      zHeldRef.current = false;
      setZKeyUI(false);
    };

    const blur = () => {
      zHeldRef.current = false;
      setZKeyUI(false);
    };

    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", blur);

    return () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", blur);
    };
  }, [zHeldRef]);

  // ✅ Sync NON-vector settings into stateRef (never overwrite a/b here)
  useEffect(() => {
    stateRef.current = {
      ...stateRef.current,
      mode,
      scale,
      gridStep,
      autoGridStep: stateRef.current.autoGridStep ?? true,
      snapToGrid,
      showGrid,
      showComponents,
      showAngle,
      showProjection,
      showUnitB,
      showPerp,
      depthMode,
    };
  }, [
    mode,
    scale,
    gridStep,
    snapToGrid,
    showGrid,
    showComponents,
    showAngle,
    showProjection,
    showUnitB,
    showPerp,
    depthMode,
    stateRef,
  ]);

  // Keep z pinned in 2D
  useEffect(() => {
    if (mode !== "2d") return;
    const A = { ...stateRef.current.a, z: 0 };
    const B = { ...stateRef.current.b, z: 0 };
    stateRef.current.a = A;
    stateRef.current.b = B;
    setA(A);
    setB(B);
  }, [mode, stateRef]);

  const derived = useMemo(() => {
    const A = a;
    const B = b;
    const aMag = mag(A);
    const bMag = mag(B);
    const d = dot(A, B);
    const ang = angleBetween(A, B);
    const cosv = aMag > 1e-9 && bMag > 1e-9 ? clamp(d / (aMag * bMag), -1, 1) : NaN;
    const proj = projOfAonB(A, B);
    const perp = sub(A, proj);
    const sp = scalarProjOfAonB(A, B);
    return { aMag, bMag, dot: d, angleDeg: radToDeg(ang), cos: cosv, proj, perp, scalarProj: sp };
  }, [a, b]);

  function buildQuestion(type: QuestionType): Question {
    const A = stateRef.current.a;
    const B = stateRef.current.b;

    const angDeg = radToDeg(angleBetween(A, B));
    const pr = projOfAonB(A, B);
    const sp = scalarProjOfAonB(A, B);

    let prompt = "";
    let correct = NaN;
    let unit = "";
    let tol = 0.25;

    switch (type) {
      case "dot":
        prompt = "Compute the dot product a · b";
        correct = dot(A, B);
        tol = 0.25;
        break;
      case "angle":
        prompt = "Compute the angle θ between a and b (degrees)";
        correct = angDeg;
        unit = "°";
        tol = 1.0;
        break;
      case "scalarProj":
        prompt = "Compute the scalar projection of a on b (shadow length on b)";
        correct = sp;
        tol = 0.25;
        break;
      case "projX":
        prompt = "Compute the x-component of proj_b(a)";
        correct = pr.x;
        tol = 0.25;
        break;
      case "projY":
        prompt = "Compute the y-component of proj_b(a)";
        correct = pr.y;
        tol = 0.25;
        break;
      case "projZ":
        prompt = "Compute the z-component of proj_b(a)";
        correct = pr.z;
        tol = 0.25;
        break;
    }

    return { id: `${type}-${Date.now()}`, type, prompt, correct, unit, tolerance: tol, createdAt: Date.now() };
  }

  function onNewQuestion() {
    const safeType = mode === "2d" && qType === "projZ" ? "projX" : qType;
    const q = buildQuestion(safeType);
    setQuestion(q);
    setAnswerText("");
    setStatus({
      kind: "idle",
      msg: `Question: ${q.prompt}. Enter a number (tolerance ±${q.tolerance}${q.unit ?? ""}).`,
    });
  }

  function parseAnswer(s: string) {
    const cleaned = s.replace(/[^\d\-+.eE]/g, "");
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : NaN;
  }

  function onCheck() {
    if (!question) return setStatus({ kind: "bad", msg: "No active question. Click “New question” first." });
    const user = parseAnswer(answerText);
    if (!Number.isFinite(user)) return setStatus({ kind: "bad", msg: "Please enter a valid number (e.g., 3.5 or -2)." });
    const ok = Math.abs(user - question.correct) <= question.tolerance;
    setStatus(ok ? { kind: "good", msg: `✅ Correct. ${user} is within tolerance.` } : { kind: "bad", msg: `❌ Not quite. You said ${user}. Try again.` });
  }

  function onReveal() {
    if (!question) return setStatus({ kind: "bad", msg: "No question to reveal. Click “New question” first." });
    setStatus({ kind: "good", msg: `Answer: ${question.correct.toFixed(3)}${question.unit ?? ""}` });
  }

  function randomizeVectors() {
    const r = () => Math.round((Math.random() * 10 - 5) * 2) / 2;

    let A: Vec3 = { x: r(), y: r(), z: mode === "3d" ? r() : 0 };
    let B: Vec3 = { x: r(), y: r(), z: mode === "3d" ? r() : 0 };

    if (mag(B) < 1) B = { x: 3, y: 2, z: mode === "3d" ? 1.5 : 0 };
    if (mag(A) < 1) A = { x: 4, y: -1.5, z: mode === "3d" ? -1 : 0 };

    stateRef.current.a = A;
    stateRef.current.b = B;
    setA(A);
    setB(B);
    setStatus({ kind: "idle", msg: "Randomized vectors. Drag tips to explore." });
  }

  function resetVectors() {
    const A: Vec3 = { x: 3, y: 2, z: mode === "3d" ? 1 : 0 };
    const B: Vec3 = { x: 2, y: 4, z: mode === "3d" ? -1 : 0 };
    stateRef.current.a = A;
    stateRef.current.b = B;
    setA(A);
    setB(B);
    setStatus({ kind: "idle", msg: "Reset to default vectors." });
  }

  // ---- Anti-blink: rAF scale update (wheel spam) ----
  const scaleRaf = useRef<number | null>(null);
  const onScaleChange = (next: number) => {
    if (scaleRaf.current) cancelAnimationFrame(scaleRaf.current);
    scaleRaf.current = requestAnimationFrame(() => setScale(next));
  };

  // ---- when active, install VectorPad config for this tool ----
  useEffect(() => {
    if (!active) return;

    applyConfig({
      handles: { a: true, b: true },
      overlay2D: undefined,
      overlay3D: undefined,
      previewThrottleMs: 60,
      onScaleChange,
      onPreview: (na: Vec3, nb: Vec3) => {
        // VectorPad already updated stateRef.current.a/b
        setA(na);
        setB(nb);
      },
      onCommit: (na: Vec3, nb: Vec3) => {
        setA(na);
        setB(nb);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, mode]);

  const statusClass =
    status.kind === "good"
      ? "border-emerald-300/30 bg-emerald-300/10 text-white/90"
      : status.kind === "bad"
      ? "border-rose-300/30 bg-rose-300/10 text-white/90"
      : "border-white/10 bg-black/20 text-white/70";

  const aLabel = mode === "2d" ? `(${fmt2(a.x)}, ${fmt2(a.y)})` : `(${fmt2(a.x)}, ${fmt2(a.y)}, ${fmt2(a.z)})`;
  const bLabel = mode === "2d" ? `(${fmt2(b.x)}, ${fmt2(b.y)})` : `(${fmt2(b.x)}, ${fmt2(b.y)}, ${fmt2(b.z)})`;

  const Toggle = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 cursor-pointer">
      <span className="text-xs font-extrabold text-white/70">{label}</span>
      <input type="checkbox" className="scale-110 cursor-pointer accent-blue-500" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );

  const KV = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="text-xs font-extrabold text-white/70">{label}</div>
      <div className="font-extrabold tabular-nums text-white/90">{value}</div>
    </div>
  );

  return (
    <div className="h-full rounded-2xl border border-white/10 bg-white/[0.04] shadow-[0_18px_60px_rgba(0,0,0,0.35)] overflow-hidden">
      <div className="border-b border-white/10 bg-black/20 px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <div className="text-sm font-black tracking-tight">Module 0 Visual Simulator</div>
          <span className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] font-extrabold text-white/70">
            {mode.toUpperCase()} • Vectors • Dot • Projection
          </span>
        </div>

        <p className="mt-1 text-xs leading-relaxed text-white/70">
          {mode === "2d" ? (
            <>Drag vector tips. Projection shows <b>proj₍b₎(a)</b> and optional perpendicular.</>
          ) : (
            <>
              Orbit the camera. Drag spheres. Hold{" "}
              <span className="rounded-md border border-white/10 bg-white/10 px-1.5 py-0.5 font-mono text-[11px]">Z</span>{" "}
              (or enable Depth mode) to change z.
            </>
          )}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${mode === "2d" ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-white/10"}`}
            onClick={() => setMode("2d")}
          >
            2D Mode
          </button>
          <button
            className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${mode === "3d" ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-white/10"}`}
            onClick={() => setMode("3d")}
          >
            3D Mode
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 p-3">
        <div className="grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="text-xs font-extrabold text-white/70">{mode === "2d" ? "Scale (px per unit)" : "Visual scale"}</div>
          <div className="font-extrabold tabular-nums">{scale}</div>
        </div>

        <input className="mt-2 w-full" type="range" min={20} max={280} value={scale} onChange={(e) => setScale(Number(e.target.value))} />

        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
          <div className="text-xs font-extrabold text-white/70">Snap to grid</div>
          <input type="checkbox" className="scale-110 accent-blue-500" checked={snapToGrid} onChange={(e) => setSnapToGrid(e.target.checked)} />
        </div>

        {mode === "3d" ? (
          <>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
              <div className="text-xs font-extrabold text-white/70">Depth mode (force Z-drag)</div>
              <input type="checkbox" className="scale-110 accent-blue-500" checked={depthMode} onChange={(e) => setDepthMode(e.target.checked)} />
            </div>
            <div className="mt-2 text-xs text-white/60">
              Z key detected:{" "}
              <span className={zKeyUI ? "text-emerald-300 font-extrabold" : "text-white/70 font-extrabold"}>
                {zKeyUI ? "ON" : "off"}
              </span>
            </div>
          </>
        ) : null}

        <div className="mt-2 grid grid-cols-[1fr_120px] items-center gap-2">
          <div className="text-xs font-extrabold text-white/70">Grid step (units)</div>
          <input
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-extrabold tabular-nums text-white/90 outline-none"
            type="number"
            min={0.5}
            step={0.5}
            value={gridStep}
            onChange={(e) => setGridStep(Number(e.target.value))}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-extrabold" onClick={randomizeVectors}>
            Randomize a & b
          </button>
          <button className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold" onClick={resetVectors}>
            Reset
          </button>
        </div>
      </div>

      <div className="border-b border-white/10 p-3">
        <div className="mb-2 text-sm font-black">Overlays</div>
        <div className="grid grid-cols-2 gap-2">
          <Toggle label="Show grid + axes" checked={showGrid} onChange={setShowGrid} />
          <Toggle label="Show components" checked={showComponents} onChange={setShowComponents} />
          <Toggle label="Show angle θ" checked={showAngle} onChange={setShowAngle} />
          <Toggle label="Show projection" checked={showProjection} onChange={setShowProjection} />
          <Toggle label="Show unit vector of b" checked={showUnitB} onChange={setShowUnitB} />
          <Toggle label="Show perpendicular part" checked={showPerp} onChange={setShowPerp} />
        </div>
      </div>

      <div className="border-b border-white/10 p-3">
        <div className="mb-2 text-sm font-black">Live Math</div>

        <div className="grid grid-cols-3 gap-2">
          <KV label={`a = ${mode === "2d" ? "(ax, ay)" : "(ax, ay, az)"}`} value={aLabel} />
          <KV label="|a|" value={fmt(derived.aMag)} />
          <KV label="dot a·b" value={fmt(derived.dot)} />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <KV label={`b = ${mode === "2d" ? "(bx, by)" : "(bx, by, bz)"}`} value={bLabel} />
          <KV label="|b|" value={fmt(derived.bMag)} />
          <KV label="cos(θ)" value={fmt(derived.cos)} />
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2">
          <KV label="θ (deg)" value={fmt2(derived.angleDeg)} />
          <KV label="shadow length on b" value={fmt(derived.scalarProj)} />
          <KV label="proj_b(a) len" value={fmt(mag(derived.proj))} />
        </div>
      </div>

      <div className="p-3">
        <div className="mb-2 text-sm font-black">Practice Mode</div>

        <div className="grid grid-cols-[1fr_170px] items-center gap-2">
          <div className="text-xs font-extrabold text-white/70">Question type</div>
          <select
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-extrabold text-white/90 outline-none"
            value={qType}
            onChange={(e) => setQType(e.target.value as QuestionType)}
          >
            <option value="dot">Dot product a·b</option>
            <option value="angle">Angle θ (degrees)</option>
            <option value="scalarProj">Shadow length on b</option>
            <option value="projX">proj_b(a) x-component</option>
            <option value="projY">proj_b(a) y-component</option>
            <option value="projZ" disabled={mode === "2d"}>
              proj_b(a) z-component (3D)
            </option>
          </select>
        </div>

        <div className="mt-2 grid grid-cols-[1fr_170px] items-center gap-2">
          <div className="text-xs font-extrabold text-white/70">Your answer</div>
          <input
            className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm font-extrabold tabular-nums text-white/90 outline-none"
            value={answerText}
            onChange={(e) => setAnswerText(e.target.value)}
            placeholder="e.g. 3.5"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 px-3 py-2 text-xs font-extrabold" onClick={onNewQuestion}>
            New question
          </button>
          <button className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold" onClick={onCheck}>
            Check
          </button>
          <button className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-xs font-extrabold" onClick={onReveal}>
            Reveal
          </button>
        </div>

        <div className={`mt-3 rounded-xl border px-3 py-2 text-xs leading-relaxed ${statusClass}`}>
          {question ? (
            <div className="mb-1">
              <span className="font-extrabold text-white/90">Active:</span>{" "}
              <span className="text-white/80">{question.prompt}</span>
            </div>
          ) : null}
          {status.msg}
        </div>

        <div className="mt-3 text-xs text-white/55">
          Legend:{" "}
          <span className="font-extrabold" style={{ color: COLORS.a }}>a</span>,{" "}
          <span className="font-extrabold" style={{ color: COLORS.b }}>b</span>,{" "}
          <span className="font-extrabold" style={{ color: COLORS.proj }}>proj</span>,{" "}
          <span className="font-extrabold" style={{ color: COLORS.perp }}>a⊥</span>
        </div>
      </div>
    </div>
  );
}
