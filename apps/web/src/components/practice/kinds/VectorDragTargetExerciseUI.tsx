// src/components/practice/kinds/VectorDragTargetExerciseUI.tsx
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

function toVec3(v: any, fallback: Vec3): Vec3 {
  return {
    x: Number(v?.x ?? fallback.x),
    y: Number(v?.y ?? fallback.y),
    z: Number(v?.z ?? fallback.z ?? 0),
  };
}

export default function VectorDragTargetExerciseUI({
  exercise,
  a,
  b,
  onChange,
  padRef,
  disabled,
}: {
  exercise: Exercise;
  a: Vec3;
  b: Vec3;
  onChange: (a: Vec3, b: Vec3) => void;
  padRef: React.MutableRefObject<VectorPadState>;
  disabled: boolean;
}) {
  const zHeldRef = useRef(false);
  const interactive = !disabled;

  const initA = (exercise as any).initialA as Vec3 | undefined;
  const initB = (exercise as any).initialB as Vec3 | undefined;
  const lockB = Boolean((exercise as any).lockB);

  // stable exercise identity for init effect
  const exId = useMemo(
    () => String((exercise as any).id ?? (exercise as any).key ?? ""),
    [exercise],
  );

  const [liveA, setLiveA] = useState<Vec3>(() =>
    toVec3(a, { x: 0, y: 0, z: 0 }),
  );
  const [liveB, setLiveB] = useState<Vec3>(() =>
    toVec3(b, { x: 0, y: 0, z: 0 }),
  );

  // ✅ init ONLY when the exercise identity changes (not on random rerenders)
  useEffect(() => {
    const pad: any = padRef.current;
    if (!pad) return;

    pad.mode = "2d";

    // seed:
    // - interactive: initA/initB (or props)
    // - review/disabled: saved answers a/b
    const seedA = interactive
      ? initA ?? a ?? { x: 0, y: 0, z: 0 }
      : a ?? { x: 0, y: 0, z: 0 };

    const seedB = interactive
      ? initB ?? b ?? { x: 2, y: 1, z: 0 }
      : b ?? { x: 0, y: 0, z: 0 };

    pad.a = { ...seedA, z: seedA.z ?? 0 };
    pad.b = { ...seedB, z: seedB.z ?? 0 };

    setLiveA(toVec3(pad.a, seedA));
    setLiveB(toVec3(pad.b, seedB));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exId]);

  function reset() {
    if (!interactive) return;
    if (!padRef.current || !initA || !initB) return;

    const pad: any = padRef.current;
    pad.a = { ...initA, z: initA.z ?? 0 };
    pad.b = { ...initB, z: initB.z ?? 0 };

    setLiveA(toVec3(pad.a, initA));
    setLiveB(toVec3(pad.b, initB));
    onChange(initA, initB);
  }

  return (
    <div className="grid gap-3">
      <ExercisePrompt exercise={exercise} />

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/70">
        Drag vectors on the pad. Submitting uses the live vectors.
      </div>

      <VectorPad
        mode="2d"
        stateRef={padRef}
        zHeldRef={zHeldRef}
        handles={{
          a: interactive,
          b: interactive && !lockB,
        }}
        onPreview={
          interactive
            ? (aNow, bNow) => {
                setLiveA((prev) => toVec3(aNow, prev));
                setLiveB((prev) => toVec3(bNow, prev));
              }
            : undefined
        }
        onCommit={
          interactive
            ? (aNow, bNow) => {
                const nextA = toVec3(aNow, liveA);
                const nextB = toVec3(bNow, liveB);
                setLiveA(nextA);
                setLiveB(nextB);
                onChange(nextA, nextB);
              }
            : undefined
        }
        previewThrottleMs={50}
        className="relative h-[420px] w-full"
      />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!interactive || !initA || !initB}
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
        </div>
      </div>
    </div>
  );
}
