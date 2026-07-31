"use client";

import * as React from "react";
import type { Mode, Vec3 } from "@/lib/math/vec3";
import { clamp, mag } from "@/lib/math/vec3";
import type { VectorPadState } from "@/components/vectorpad/types";
import { useTranslations } from "next-intl";
import { useZHeldRef } from "@/components/vectorpad/useZHeldRef";

import LeftPanel from "./mod0/LeftPanel";
import CanvasPanel from "./mod0/CanvasPanel";
import { useRafBus } from "./mod0/hooks/useRafBus";
import { usePracticeEngine } from "./mod0/hooks/usePracticeEngine";

function defaultVectors(mode: Mode) {
  if (mode === "3d") return { a: { x: 3, y: 2, z: 1 }, b: { x: 2, y: 4, z: -1 } } as const;
  return { a: { x: 3, y: 2, z: 0 }, b: { x: 2, y: 4, z: 0 } } as const;
}

function createInitialState(mode: Mode): VectorPadState {
  const { a, b } = defaultVectors(mode);
  return {
    mode,
    scale: 40,
    gridStep: 1,
    autoGridStep: false,
    snapToGrid: true,
    showGrid: true,
    showComponents: true,
    showAngle: true,
    showProjection: true,
    showUnitB: false,
    showPerp: false,
    depthMode: false,
    a,
    b,
  };
}

export default function Module0VectorSimulatorP5Hybrid({ mode = "2d" }: { mode?: Mode }) {
  const t = useTranslations("Module0");
  const bus = useRafBus();
  const { zHeldRef, zKeyUI } = useZHeldRef();

  // ✅ Correct: NO "()"
  const stateRef = React.useRef<VectorPadState>(createInitialState(mode));

  // UI settings (rare changes)
  const [scale, setScale] = React.useState(stateRef.current.scale);
  const [gridStep, setGridStep] = React.useState(stateRef.current.gridStep);
  const [snapToGrid, setSnapToGrid] = React.useState(stateRef.current.snapToGrid);

  const [showGrid, setShowGrid] = React.useState(stateRef.current.showGrid);
  const [showComponents, setShowComponents] = React.useState(stateRef.current.showComponents);
  const [showAngle, setShowAngle] = React.useState(stateRef.current.showAngle);
  const [showProjection, setShowProjection] = React.useState(stateRef.current.showProjection);
  const [showUnitB, setShowUnitB] = React.useState(stateRef.current.showUnitB);
  const [showPerp, setShowPerp] = React.useState(stateRef.current.showPerp);
  const [depthMode, setDepthMode] = React.useState(stateRef.current.depthMode);

  // mode changes: clamp z=0 for 2d
  React.useEffect(() => {
    stateRef.current.mode = mode;
    if (mode === "2d") {
      stateRef.current.a = { ...stateRef.current.a, z: 0 };
      stateRef.current.b = { ...stateRef.current.b, z: 0 };
    }
    bus.emit(); // refresh panels
  }, [mode, bus]);

  // stable setters patch both
  const setScaleBoth = React.useCallback((v: number) => {
    const clamped = clamp(v, 20, 280);
    setScale(clamped);
    stateRef.current.scale = clamped;
  }, []);

  const setGridStepBoth = React.useCallback((v: number) => {
    setGridStep(v);
    stateRef.current.gridStep = v;
  }, []);

  const setSnapToGridBoth = React.useCallback((v: boolean) => {
    setSnapToGrid(v);
    stateRef.current.snapToGrid = v;
  }, []);

  const setShowGridBoth = React.useCallback((v: boolean) => {
    setShowGrid(v);
    stateRef.current.showGrid = v;
  }, []);

  const setShowComponentsBoth = React.useCallback((v: boolean) => {
    setShowComponents(v);
    stateRef.current.showComponents = v;
  }, []);

  const setShowAngleBoth = React.useCallback((v: boolean) => {
    setShowAngle(v);
    stateRef.current.showAngle = v;
  }, []);

  const setShowProjectionBoth = React.useCallback((v: boolean) => {
    setShowProjection(v);
    stateRef.current.showProjection = v;
  }, []);

  const setShowUnitBBoth = React.useCallback((v: boolean) => {
    setShowUnitB(v);
    stateRef.current.showUnitB = v;
  }, []);

  const setShowPerpBoth = React.useCallback((v: boolean) => {
    setShowPerp(v);
    stateRef.current.showPerp = v;
  }, []);

  const setDepthModeBoth = React.useCallback((v: boolean) => {
    setDepthMode(v);
    stateRef.current.depthMode = v;
  }, []);

  // ✅ VectorPad callbacks: correct signatures, stable identities
  const onScaleChange = React.useCallback((next: number) => setScaleBoth(next), [setScaleBoth]);
  const onPreview = React.useCallback((_a: Vec3, _b: Vec3) => bus.emitRaf(), [bus]);
  const onCommit = React.useCallback((_a: Vec3, _b: Vec3) => bus.emit(), [bus]);

  // actions
  const onRandomize = React.useCallback(() => {
    const r = () => Math.round((Math.random() * 10 - 5) * 2) / 2;

    let A: Vec3 = { x: r(), y: r(), z: mode === "3d" ? r() : 0 };
    let B: Vec3 = { x: r(), y: r(), z: mode === "3d" ? r() : 0 };

    if (mag(B) < 1) B = { x: 3, y: 2, z: mode === "3d" ? 1.5 : 0 };
    if (mag(A) < 1) A = { x: 4, y: -1.5, z: mode === "3d" ? -1 : 0 };

    stateRef.current.a = A;
    stateRef.current.b = B;
    bus.emit();
  }, [mode, bus]);

  const onReset = React.useCallback(() => {
    const { a, b } = defaultVectors(mode);
    stateRef.current.a = a as Vec3;
    stateRef.current.b = b as Vec3;
    bus.emit();
  }, [mode, bus]);

  const onZeroA = React.useCallback(() => {
    stateRef.current.a = { x: 0, y: 0, z: 0 };
    bus.emit();
  }, [bus]);

  const onZeroB = React.useCallback(() => {
    stateRef.current.b = { x: 0, y: 0, z: 0 };
    bus.emit();
  }, [bus]);

  const practice = usePracticeEngine({ mode, t, stateRef });

  return (
      <div className="min-h-screen p-3 md:p-4 bg-neutral-50 text-neutral-900 dark:bg-[radial-gradient(1200px_700px_at_20%_0%,#151a2c_0%,#0b0d12_55%)] dark:text-white/90">
        <div className="grid gap-3 md:gap-4 lg:grid-cols-[380px_1fr]">
          <LeftPanel
              mode={mode}
              t={t}
              stateRef={stateRef}
              subscribe={bus.subscribe}
              scale={scale}
              setScaleBoth={setScaleBoth}
              gridStep={gridStep}
              setGridStepBoth={setGridStepBoth}
              snapToGrid={snapToGrid}
              setSnapToGridBoth={setSnapToGridBoth}
              showGrid={showGrid}
              setShowGridBoth={setShowGridBoth}
              showComponents={showComponents}
              setShowComponentsBoth={setShowComponentsBoth}
              showAngle={showAngle}
              setShowAngleBoth={setShowAngleBoth}
              showProjection={showProjection}
              setShowProjectionBoth={setShowProjectionBoth}
              showUnitB={showUnitB}
              setShowUnitBBoth={setShowUnitBBoth}
              showPerp={showPerp}
              setShowPerpBoth={setShowPerpBoth}
              depthMode={depthMode}
              setDepthModeBoth={setDepthModeBoth}
              zKeyUI={zKeyUI}
              onRandomize={onRandomize}
              onReset={onReset}
              onZeroA={onZeroA}
              onZeroB={onZeroB}
              {...practice}
          />

          <CanvasPanel
              mode={mode}
              t={t}
              stateRef={stateRef}
              zHeldRef={zHeldRef}
              onScaleChange={onScaleChange}
              onPreview={onPreview}
              onCommit={onCommit}
          />
        </div>

        <div className="mt-3 text-xs text-neutral-500 dark:text-white/50">{t("footerTip")}</div>
      </div>
  );
}
