// src/components/practice/kinds/VectorDragDotExerciseUI.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Exercise, Vec3 } from "@/lib/practice/types";
import type { VectorPadState } from "@/components/vectorpad/types";
import VectorPad from "@/components/vectorpad/VectorPad";
import {ExercisePrompt} from "@/components/practice/kinds/KindHelper";

function fmt(v: Vec3) {
  const z = v.z ?? 0;
  return `(${v.x}, ${v.y}${z !== 0 ? `, ${z}` : ""})`;
}

function dot3(a: Vec3, b: Vec3) {
  const az = a.z ?? 0;
  const bz = b.z ?? 0;
  return a.x * b.x + a.y * b.y + az * bz;
}

function toVec3(v: any, fallback: Vec3): Vec3 {
  return {
    x: Number(v?.x ?? fallback.x),
    y: Number(v?.y ?? fallback.y),
    z: Number(v?.z ?? fallback.z ?? 0),
  };
}

export default function VectorDragDotExerciseUI({
  exercise,
  a,
  onChange,
  padRef,
  disabled,
}: {
  exercise: Exercise;
  a: Vec3;
  onChange: (a: Vec3) => void;
  padRef: React.MutableRefObject<VectorPadState>;
  disabled: boolean;
}) {
  const zHeldRef = useRef(false);
  const interactive = !disabled;

  const initA = (exercise as any).initialA as Vec3 | undefined;

  const bFromExercise = ((exercise as any).b ?? { x: 0, y: 0, z: 0 }) as Vec3;
  const targetDot = Number((exercise as any).targetDot ?? 0);
  const tol = Number((exercise as any).tolerance ?? 0);

  const [liveA, setLiveA] = useState<Vec3>(() =>
    toVec3(a, { x: 0, y: 0, z: 0 }),
  );
  const [liveB, setLiveB] = useState<Vec3>(() =>
    toVec3(bFromExercise, { x: 0, y: 0, z: 0 }),
  );

  // ✅ init only when the EXERCISE identity changes
  const exId = String((exercise as any).id ?? (exercise as any).key ?? "");

  useEffect(() => {
    const pad: any = padRef.current;
    if (!pad) return;

    pad.mode = "2d";
    pad.b = { ...bFromExercise, z: bFromExercise.z ?? 0 };

    const seedA = interactive
      ? (initA ?? a ?? { x: 0, y: 0, z: 0 })
      : (a ?? { x: 0, y: 0, z: 0 });
    pad.a = { ...seedA, z: seedA.z ?? 0 };

    setLiveA(toVec3(pad.a, seedA));
    setLiveB(toVec3(pad.b, bFromExercise));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exId]);

  const liveDot = useMemo(() => dot3(liveA, liveB), [liveA, liveB]);
  const ok = Math.abs(liveDot - targetDot) <= tol;

  function reset() {
    if (!interactive) return;
    if (!initA || !padRef.current) return;
    const pad: any = padRef.current;
    pad.a = { ...initA, z: initA.z ?? 0 };
    setLiveA(toVec3(pad.a, initA));
    onChange(initA);
  }

  return (
    <div className="grid gap-3">
      <ExercisePrompt exercise={exercise} />

      <div className="ui-soft p-3 text-xs text-neutral-700 dark:text-white/70">
        Drag <span className="font-extrabold">A</span>.{" "}
        <span className="font-extrabold">B</span> stays fixed as the reference
        vector.
        <div className="mt-2 text-[11px] text-neutral-500 dark:text-white/60">
          Goal: <span className="font-mono">A·B ≈ {targetDot}</span> (±
          <span className="font-mono">{tol}</span>)
        </div>
      </div>

      <VectorPad
        mode="2d"
        stateRef={padRef}
        zHeldRef={zHeldRef}
        handles={{ a: interactive, b: false }}
        onPreview={
          interactive
            ? (aNow) => {
                const nextA = toVec3(aNow, liveA);
                setLiveA(nextA);
                const pad: any = padRef.current;
                setLiveB(toVec3(pad?.b, bFromExercise));
              }
            : undefined
        }
        onCommit={
          interactive
            ? (aNow) => {
                const nextA = toVec3(aNow, liveA);
                setLiveA(nextA);
                onChange(nextA);
              }
            : undefined
        }
        previewThrottleMs={50}
        className="relative h-[420px] w-full"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!interactive || !initA}
          onClick={reset}
          className="h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-extrabold hover:bg-white/15 disabled:opacity-60"
        >
          Reset
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2 text-[11px] text-white/60">
          <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 font-mono">
            A={fmt(liveA)}
          </span>
          <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 font-mono">
            B={fmt(liveB)}
          </span>
          <span className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 font-mono">
            A·B={Number.isFinite(liveDot) ? liveDot.toFixed(3) : "—"}
          </span>

          <span
            className={[
              "rounded-lg border px-2 py-1 font-extrabold",
              ok
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-white/10 bg-white/5 text-white/60",
            ].join(" ")}
          >
            {ok ? "within tolerance" : "not yet"}
          </span>
        </div>
      </div>
    </div>
  );
}
