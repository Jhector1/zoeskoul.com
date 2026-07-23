"use client";

import * as React from "react";
import MathMarkdown from "@/components/markdown/MathMarkdown";
import type {
    AlgorithmAnimationNode,
    AlgorithmAnimationSpec,
} from "@/components/sketches/subjects/specTypes";
import type { SavedSketchState } from "@/components/sketches/subjects/types";

function clampStep(value: unknown, stepCount: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, Math.min(stepCount - 1, Math.floor(parsed)));
}

function readStep(value: SavedSketchState, stepCount: number) {
    const data = value?.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
    return clampStep((data as Record<string, unknown>).step, stepCount);
}

function nodeTone(node: AlgorithmAnimationNode) {
    if (node.dimmed) {
        return "border-neutral-300 bg-neutral-100 text-neutral-400 dark:border-white/10 dark:bg-white/5 dark:text-white/35";
    }

    switch (node.tone) {
        case "good":
            return "border-emerald-500/60 bg-emerald-500/10 text-emerald-900 dark:text-emerald-100";
        case "warn":
            return "border-amber-500/60 bg-amber-500/10 text-amber-950 dark:text-amber-100";
        case "danger":
            return "border-rose-500/60 bg-rose-500/10 text-rose-950 dark:text-rose-100";
        case "info":
            return "border-sky-500/60 bg-sky-500/10 text-sky-950 dark:text-sky-100";
        default:
            return "ui-border ui-bg-surface text-neutral-900 dark:text-white";
    }
}

function edgeTone(tone: string | undefined) {
    switch (tone) {
        case "good":
            return "text-emerald-500";
        case "warn":
            return "text-amber-500";
        case "danger":
            return "text-rose-500";
        case "info":
            return "text-sky-500";
        default:
            return "text-neutral-400 dark:text-white/30";
    }
}

function nodeShape(node: AlgorithmAnimationNode) {
    switch (node.shape) {
        case "circle":
            return "aspect-square rounded-full";
        case "pill":
            return "rounded-full";
        default:
            return "rounded-xl";
    }
}

function usePrefersReducedMotion() {
    const [reduced, setReduced] = React.useState(false);

    React.useEffect(() => {
        const media = window.matchMedia("(prefers-reduced-motion: reduce)");
        const update = () => setReduced(media.matches);
        update();
        media.addEventListener?.("change", update);
        return () => media.removeEventListener?.("change", update);
    }, []);

    return reduced;
}

export default function AlgorithmAnimationSketch({
    spec,
    value,
    onChange,
    readOnly,
}: {
    spec: AlgorithmAnimationSpec;
    value: SavedSketchState;
    onChange: (next: SavedSketchState) => void;
    readOnly?: boolean;
}) {
    const steps = spec.steps ?? [];
    const reducedMotion = usePrefersReducedMotion();
    const stepIndex = readStep(value, Math.max(steps.length, 1));
    const step = steps[stepIndex];
    const [playing, setPlaying] = React.useState(false);
    const autoPlayStartedRef = React.useRef(false);

    const setStep = React.useCallback(
        (next: number) => {
            if (!steps.length) return;
            const clamped = clampStep(next, steps.length);
            onChange({
                version: spec.specVersion,
                updatedAt: new Date().toISOString(),
                data: { step: clamped },
            });
        },
        [onChange, spec.specVersion, steps.length],
    );

    React.useEffect(() => {
        if (!playing || readOnly || reducedMotion || steps.length < 2) return;

        if (stepIndex >= steps.length - 1) {
            setPlaying(false);
            return;
        }

        const timer = window.setTimeout(() => {
            setStep(stepIndex + 1);
        }, Math.max(500, spec.intervalMs ?? 1200));

        return () => window.clearTimeout(timer);
    }, [
        playing,
        readOnly,
        reducedMotion,
        setStep,
        spec.intervalMs,
        stepIndex,
        steps.length,
    ]);

    React.useEffect(() => {
        if (
            autoPlayStartedRef.current ||
            !spec.autoPlay ||
            reducedMotion ||
            readOnly ||
            stepIndex !== 0
        ) {
            return;
        }

        autoPlayStartedRef.current = true;
        setPlaying(true);
    }, [readOnly, reducedMotion, spec.autoPlay, stepIndex]);

    if (!step) {
        return (
            <div className="ui-soft p-4 text-sm ui-text-muted">
                This animation has no authored steps.
            </div>
        );
    }

    const nodesById = new Map(step.nodes.map((node) => [node.id, node]));
    const canvasHeight = Math.max(220, spec.canvasHeight ?? 330);

    return (
        <div className="grid gap-3">
            {spec.title ? (
                <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                    {spec.title}
                </div>
            ) : null}

            {spec.contextMarkdown ? (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3 text-sm">
                    <MathMarkdown content={spec.contextMarkdown} />
                </div>
            ) : null}

            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-sm font-extrabold text-neutral-900 dark:text-white">
                        {step.title}
                    </div>
                    {spec.showStepCounter !== false ? (
                        <div className="mt-0.5 text-xs ui-text-muted">
                            Step {stepIndex + 1} of {steps.length}
                        </div>
                    ) : null}
                </div>

                {spec.showControls !== false ? (
                    <div className="flex items-center gap-2" aria-label="Animation controls">
                        <button
                            type="button"
                            className="ui-btn-ide-border px-3 py-1.5 text-xs font-bold"
                            onClick={() => setStep(stepIndex - 1)}
                            disabled={readOnly || stepIndex === 0}
                            aria-label="Previous animation step"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            className="ui-btn-ide-border min-w-16 px-3 py-1.5 text-xs font-bold"
                            onClick={() => {
                                if (stepIndex >= steps.length - 1) setStep(0);
                                setPlaying((current) => !current);
                            }}
                            disabled={readOnly || reducedMotion || steps.length < 2}
                            title={
                                reducedMotion
                                    ? "Automatic playback is disabled by reduced-motion preferences."
                                    : undefined
                            }
                        >
                            {playing ? "Pause" : stepIndex >= steps.length - 1 ? "Replay" : "Play"}
                        </button>
                        <button
                            type="button"
                            className="ui-btn-ide-border px-3 py-1.5 text-xs font-bold"
                            onClick={() => setStep(stepIndex + 1)}
                            disabled={readOnly || stepIndex >= steps.length - 1}
                            aria-label="Next animation step"
                        >
                            Next
                        </button>
                    </div>
                ) : null}
            </div>

            <div
                className="relative overflow-hidden rounded-2xl border ui-border ui-bg-surface-2"
                style={{ height: canvasHeight }}
            >
                <svg
                    className="absolute inset-0 h-full w-full"
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    aria-hidden="true"
                >
                    {(step.edges ?? []).map((edge) => {
                        const from = nodesById.get(edge.from);
                        const to = nodesById.get(edge.to);
                        if (!from || !to) return null;

                        return (
                            <g key={`${edge.from}-${edge.to}-${edge.label ?? ""}`} className={edgeTone(edge.tone)}>
                                <line
                                    x1={from.x}
                                    y1={from.y}
                                    x2={to.x}
                                    y2={to.y}
                                    stroke="currentColor"
                                    strokeWidth={edge.active ? 1.1 : 0.65}
                                    strokeDasharray={edge.dashed ? "2 2" : undefined}
                                    vectorEffect="non-scaling-stroke"
                                />
                                {edge.label ? (
                                    <text
                                        x={(from.x + to.x) / 2}
                                        y={(from.y + to.y) / 2 - 1.5}
                                        textAnchor="middle"
                                        fill="currentColor"
                                        fontSize="3.2"
                                        fontWeight="700"
                                    >
                                        {edge.label}
                                    </text>
                                ) : null}
                            </g>
                        );
                    })}
                </svg>

                {step.nodes.map((node) => (
                    <div
                        key={node.id}
                        className={[
                            "absolute grid -translate-x-1/2 -translate-y-1/2 place-items-center border px-2 py-2 text-center shadow-sm",
                            "transition-[left,top,transform,opacity,background-color,border-color] duration-500",
                            reducedMotion ? "!transition-none" : "",
                            nodeShape(node),
                            nodeTone(node),
                            node.active ? "ring-2 ring-sky-500/60 ring-offset-2 ring-offset-transparent" : "",
                        ]
                            .filter(Boolean)
                            .join(" ")}
                        style={{
                            left: `${node.x}%`,
                            top: `${node.y}%`,
                            width: node.width ? `${node.width}%` : node.shape === "circle" ? 54 : 92,
                            minHeight: node.shape === "circle" ? 54 : 46,
                        }}
                    >
                        <div className="text-xs font-black leading-tight sm:text-sm">{node.label}</div>
                        {node.detail ? (
                            <div className="mt-0.5 text-[10px] font-semibold leading-tight opacity-70 sm:text-xs">
                                {node.detail}
                            </div>
                        ) : null}
                    </div>
                ))}
            </div>

            <div className="flex items-center justify-center gap-1.5" aria-label="Animation progress">
                {steps.map((candidate, index) => (
                    <button
                        key={candidate.id}
                        type="button"
                        className={[
                            "h-2 rounded-full transition-all",
                            index === stepIndex ? "w-6 bg-current" : "w-2 bg-current opacity-25",
                        ].join(" ")}
                        onClick={() => setStep(index)}
                        disabled={readOnly}
                        aria-label={`Show animation step ${index + 1}`}
                        aria-current={index === stepIndex ? "step" : undefined}
                    />
                ))}
            </div>

            {step.bodyMarkdown ? (
                <div className="rounded-xl border ui-border ui-bg-surface px-4 py-3">
                    <MathMarkdown content={step.bodyMarkdown} />
                </div>
            ) : null}

            {step.formula || step.code ? (
                <div className="grid gap-3 lg:grid-cols-2">
                    {step.formula ? (
                        <div className="rounded-xl border ui-border ui-bg-surface px-4 py-3 font-mono text-sm">
                            <MathMarkdown content={step.formula} />
                        </div>
                    ) : null}
                    {step.code ? (
                        <pre className="overflow-x-auto rounded-xl border ui-border bg-neutral-950 px-4 py-3 text-xs leading-relaxed text-neutral-100">
                            <code>{step.code}</code>
                        </pre>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
