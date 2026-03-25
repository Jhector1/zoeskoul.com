"use client";

import * as React from "react";
import type { Mode } from "@/lib/math/vec3";
import type { VectorPadState } from "@/components/vectorpad/types";
import LiveMathPanel from "./LiveMathPanel";
import { Toggle, killEvent, StatusBox } from "./ui";
import {QuestionType} from "@/components/mod0/hooks/usePracticeEngine";
// import type { QuestionType } from "./usePracticeEngine";

export default React.memo(function LeftPanel({
                                                 mode,
                                                 t,
                                                 stateRef,
                                                 subscribe,
                                                 // settings
                                                 scale,
                                                 setScaleBoth,
                                                 gridStep,
                                                 setGridStepBoth,
                                                 snapToGrid,
                                                 setSnapToGridBoth,
                                                 showGrid,
                                                 setShowGridBoth,
                                                 showComponents,
                                                 setShowComponentsBoth,
                                                 showAngle,
                                                 setShowAngleBoth,
                                                 showProjection,
                                                 setShowProjectionBoth,
                                                 showUnitB,
                                                 setShowUnitBBoth,
                                                 showPerp,
                                                 setShowPerpBoth,
                                                 depthMode,
                                                 setDepthModeBoth,
                                                 zKeyUI,

                                                 // actions
                                                 onRandomize,
                                                 onReset,
                                                 onZeroA,
                                                 onZeroB,

                                                 // practice
                                                 qType,
                                                 setQType,
                                                 answerText,
                                                 setAnswerText,
                                                 question,
                                                 status,
                                                 onNewQuestion,
                                                 onCheck,
                                                 onReveal,
                                             }: {
    mode: Mode;
    t: (key: string, values?: Record<string, any>) => string;

    stateRef: React.MutableRefObject<VectorPadState>;
    subscribe: (cb: () => void) => () => void;

    scale: number;
    setScaleBoth: (v: number) => void;

    gridStep: number;
    setGridStepBoth: (v: number) => void;

    snapToGrid: boolean;
    setSnapToGridBoth: (v: boolean) => void;

    showGrid: boolean;
    setShowGridBoth: (v: boolean) => void;

    showComponents: boolean;
    setShowComponentsBoth: (v: boolean) => void;

    showAngle: boolean;
    setShowAngleBoth: (v: boolean) => void;

    showProjection: boolean;
    setShowProjectionBoth: (v: boolean) => void;

    showUnitB: boolean;
    setShowUnitBBoth: (v: boolean) => void;

    showPerp: boolean;
    setShowPerpBoth: (v: boolean) => void;

    depthMode: boolean;
    setDepthModeBoth: (v: boolean) => void;

    zKeyUI: boolean;

    onRandomize: () => void;
    onReset: () => void;
    onZeroA: () => void;
    onZeroB: () => void;

    qType: QuestionType;
    setQType: (v: QuestionType) => void;
    answerText: string;
    setAnswerText: (v: string) => void;
    question: any;
    status: { kind: "idle" | "good" | "bad"; msg: string };
    onNewQuestion: () => void;
    onCheck: () => void;
    onReveal: () => void;
}) {
    return (
        <div className="ui-card overflow-hidden relative z-20" onPointerDownCapture={killEvent} onWheelCapture={killEvent}>
            {/* header */}
            <div className="ui-soft border-b border-neutral-200 dark:border-white/10 px-4 pt-4 pb-3">
                <div className="flex items-center gap-2">
                    <div className="text-sm font-black tracking-tight text-neutral-900 dark:text-white/90">
                        {t("title")}
                    </div>
                    <span className="ui-pill ui-pill--neutral">
            {t("badges.meta", { mode: mode.toUpperCase() })}
          </span>
                </div>

                <p className="mt-1 text-xs leading-relaxed text-neutral-600 dark:text-white/70">
                    {mode === "2d" ? (
                        <>{t("desc.2d")}</>
                    ) : (
                        <>
                            {t("desc.3d.beforeZ")}{" "}
                            <span className="rounded-md border border-neutral-200 bg-white px-1.5 py-0.5 font-mono text-[11px] dark:border-white/10 dark:bg-white/[0.06]">
                Z
              </span>{" "}
                            {t("desc.3d.afterZ")}
                        </>
                    )}
                </p>
            </div>

            {/* controls */}
            <div className="border-b border-neutral-200 dark:border-white/10 p-3">
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">
                        {mode === "2d" ? t("labels.scale2d") : t("labels.scale3d")}
                    </div>
                    <div className="font-extrabold tabular-nums text-neutral-900 dark:text-white/90">{scale}</div>
                </div>

                <input
                    className="mt-2 w-full"
                    type="range"
                    min={20}
                    max={280}
                    value={scale}
                    onChange={(e) => setScaleBoth(Number(e.target.value))}
                />

                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                    <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">{t("labels.snapToGrid")}</div>
                    <input
                        type="checkbox"
                        className="scale-110 accent-emerald-500"
                        checked={snapToGrid}
                        onChange={(e) => setSnapToGridBoth(e.target.checked)}
                    />
                </div>

                {mode === "3d" ? (
                    <>
                        <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2">
                            <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">{t("labels.depthMode")}</div>
                            <input
                                type="checkbox"
                                className="scale-110 accent-emerald-500"
                                checked={depthMode}
                                onChange={(e) => setDepthModeBoth(e.target.checked)}
                            />
                        </div>
                        <div className="mt-2 text-xs text-neutral-500 dark:text-white/60">
                            {t("labels.zKeyDetected")}{" "}
                            <span className={zKeyUI ? "text-emerald-700 font-extrabold dark:text-emerald-300" : "font-extrabold"}>
                {zKeyUI ? t("labels.on") : t("labels.off")}
              </span>
                        </div>
                    </>
                ) : null}

                <div className="mt-2 grid grid-cols-[1fr_120px] items-center gap-2">
                    <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">{t("labels.gridStep")}</div>
                    <input
                        className="ui-quiz-input w-full"
                        type="number"
                        min={0.5}
                        step={0.5}
                        value={gridStep}
                        onChange={(e) => setGridStepBoth(Number(e.target.value))}
                    />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    <button className="ui-btn ui-btn-primary" onClick={onRandomize}>
                        {t("buttons.randomize")}
                    </button>
                    <button className="ui-btn ui-btn-secondary" onClick={onReset}>
                        {t("buttons.reset")}
                    </button>
                    <button
                        className="ui-btn ui-btn-secondary border-rose-300/60 bg-rose-50 text-rose-950 hover:bg-rose-100 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-white/90 dark:hover:bg-rose-300/15"
                        onClick={onZeroA}
                    >
                        {t("buttons.zeroA")}
                    </button>
                    <button
                        className="ui-btn ui-btn-secondary border-rose-300/60 bg-rose-50 text-rose-950 hover:bg-rose-100 dark:border-rose-300/30 dark:bg-rose-300/10 dark:text-white/90 dark:hover:bg-rose-300/15"
                        onClick={onZeroB}
                    >
                        {t("buttons.zeroB")}
                    </button>
                </div>
            </div>

            {/* overlays */}
            <div className="border-b border-neutral-200 dark:border-white/10 p-3">
                <div className="mb-2 text-sm font-black text-neutral-900 dark:text-white/90">{t("sections.overlays")}</div>
                <div className="grid grid-cols-2 gap-2">
                    <Toggle label={t("toggles.gridAxes")} checked={showGrid} onChange={setShowGridBoth} />
                    <Toggle label={t("toggles.components")} checked={showComponents} onChange={setShowComponentsBoth} />
                    <Toggle label={t("toggles.angle")} checked={showAngle} onChange={setShowAngleBoth} />
                    <Toggle label={t("toggles.projection")} checked={showProjection} onChange={setShowProjectionBoth} />
                    <Toggle label={t("toggles.unitB")} checked={showUnitB} onChange={setShowUnitBBoth} />
                    <Toggle label={t("toggles.perp")} checked={showPerp} onChange={setShowPerpBoth} />
                </div>
            </div>

            {/* live math (isolated rerenders) */}
            <LiveMathPanel mode={mode} t={t} stateRef={stateRef} subscribe={subscribe} />

            {/* practice */}
            <div className="p-3">
                <div className="mb-2 text-sm font-black text-neutral-900 dark:text-white/90">{t("sections.practice")}</div>

                <div className="grid grid-cols-[1fr_170px] items-center gap-2">
                    <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">{t("practice.questionType")}</div>
                    <select
                        className="ui-quiz-input w-full"
                        value={qType}
                        onChange={(e) => setQType(e.target.value as any)}
                    >
                        <option value="dot">{t("practice.options.dot")}</option>
                        <option value="angle">{t("practice.options.angle")}</option>
                        <option value="scalarProj">{t("practice.options.scalarProj")}</option>
                        <option value="projX">{t("practice.options.projX")}</option>
                        <option value="projY">{t("practice.options.projY")}</option>
                        <option value="projZ" disabled={mode === "2d"}>
                            {t("practice.options.projZ")}
                        </option>
                    </select>
                </div>

                <div className="mt-2 grid grid-cols-[1fr_170px] items-center gap-2">
                    <div className="text-xs font-extrabold text-neutral-600 dark:text-white/60">{t("practice.yourAnswer")}</div>
                    <input
                        className="ui-quiz-input w-full"
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder={t("practice.placeholder")}
                    />
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                    <button className="ui-quiz-action ui-quiz-action--primary" onClick={onNewQuestion}>
                        {t("buttons.newQuestion")}
                    </button>
                    <button className="ui-quiz-action ui-quiz-action--primary" onClick={onCheck}>
                        {t("buttons.check")}
                    </button>
                    <button className="ui-quiz-action ui-quiz-action--ghost" onClick={onReveal}>
                        {t("buttons.reveal")}
                    </button>
                </div>

                <StatusBox kind={status.kind}>
                    {question ? (
                        <div className="mb-1">
                            <span className="font-extrabold">{t("practice.active")}</span>{" "}
                            <span className="opacity-90">{question.prompt}</span>
                        </div>
                    ) : null}
                    {status.msg}
                </StatusBox>
            </div>
        </div>
    );
});
