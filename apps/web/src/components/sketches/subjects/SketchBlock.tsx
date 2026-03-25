"use client";

import React, { useCallback, useMemo, useState } from "react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

import type { SavedSketchState } from "./types";
import type { SketchEntry } from "./registryTypes";
import type { SketchSpec } from "./specTypes";

import { getSketchEntry } from "./registry";
import { defaultStateForSpec } from "./defaults";
import { migrateSketchState } from "./migrate";
import { useDebouncedEmit } from "@/components/sketches/_shared/useDebouncedEmit";
import { cn, SKETCH_BTN, SKETCH_BTN_PRIMARY } from "@/components/sketches/_shared/sketchUi";
import { SketchShell } from "@/components/sketches/_shared/shells";
import SketchRenderer from "./SketchRenderer";
import { useTaggedT } from "@/i18n/tagged";

function mergeSpec(base: SketchSpec, patch?: Record<string, unknown>): SketchSpec {
    if (!patch) return base;
    return { ...(base as any), ...(patch as any) } as SketchSpec;
}

export default function SketchBlock(props: {
    cardId: string;
    title?: string;
    sketchId: string;
    height?: number;
    propsPatch?: Record<string, unknown>;
    initialState?: SavedSketchState | null;
    onStateChange?: (s: SavedSketchState) => void;
    done?: boolean;
    onMarkDone?: () => void;
    prereqsMet?: boolean;
    locked?: boolean;
}) {
    const tt = useTaggedT();               // for tagged keys like "@:sketches...."
    const ui = useTaggedT("sketchBlockUi"); // for UI strings

    const {
        cardId,
        title,
        sketchId,
        height,
        propsPatch,
        initialState,
        onStateChange,
        done = false,
        onMarkDone,
        prereqsMet = true,
        locked = false,
    } = props;

    const entry: SketchEntry | null = useMemo(() => getSketchEntry(sketchId), [sketchId]);
    const [confirmReset, setConfirmReset] = useState(false);

    const resolved = useMemo(() => {
        if (!entry) return null;

        if (entry.kind === "custom") {
            const s0 = initialState ?? entry.defaultState ?? null;
            return { entry, spec: null as any, state: s0 };
        }

        const spec = mergeSpec(entry.spec, propsPatch);
        const base0 = initialState ?? entry.defaultState ?? defaultStateForSpec(spec);
        const migrated = migrateSketchState(spec, base0);
        return { entry, spec, state: migrated };
    }, [entry, initialState, propsPatch]);

    const [state, setState] = useState<SavedSketchState | null>(() => resolved?.state ?? null);

    React.useEffect(() => {
        setState(resolved?.state ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cardId, sketchId]);

    const emit = useCallback((s: SavedSketchState) => onStateChange?.(s), [onStateChange]);
    useDebouncedEmit(state, (s) => s && emit(s), { enabled: Boolean(onStateChange), delayMs: 350 });

    const readOnly = locked || !prereqsMet;

    if (!entry) {
        return (
            <div className="ui-soft p-3 text-xs font-extrabold text-neutral-700 dark:text-white/70">
                {ui.t("unknownSketch", { id: sketchId }, `Unknown sketchId: ${sketchId}`)}
                <span className="ml-2 font-mono">{sketchId}</span>
            </div>
        );
    }

    const footer = (
        <div className="flex flex-wrap items-center justify-between gap-2">
            {!prereqsMet ? (
                <div className="ui-sketch-muted font-extrabold">{ui.t("finishPrereqs")}</div>
            ) : locked ? (
                <div className="ui-sketch-muted font-extrabold">{ui.t("locked")}</div>
            ) : (
                <div className="ui-sketch-muted font-extrabold">{ui.t("autosave")}</div>
            )}

            <div className="flex items-center gap-2">
                <button type="button" className={SKETCH_BTN} onClick={() => setConfirmReset(true)} disabled={readOnly}>
                    {ui.t("reset")}
                </button>

                {onMarkDone ? (
                    <button
                        type="button"
                        className={cn(SKETCH_BTN_PRIMARY, done && "opacity-70")}
                        onClick={onMarkDone}
                        disabled={!prereqsMet}
                        data-flow-focus="1"
                        title={ui.t("markReadTitle")}
                    >
                        {done ? ui.t("markedRead") : ui.t("markRead")}
                    </button>
                ) : null}
            </div>
        </div>
    );

    // CUSTOM
    if (entry.kind === "custom") {
        const Comp = entry.Component;

        const shellTitle = tt.resolve(title ?? null);

        return (
            <>
                <SketchShell
                    title={shellTitle || undefined}
                    height={height}
                    left={
                        <Comp
                            value={state}
                            onChange={(next) => {
                                setState(next);
                                onStateChange?.(next);
                            }}
                            readOnly={readOnly}
                            height={height}
                            title={shellTitle || undefined}
                        />
                    }
                    footer={footer}
                />

                <ConfirmDialog
                    open={confirmReset}
                    onOpenChange={setConfirmReset}
                    danger
                    title={ui.t("resetDialog.title")}
                    confirmLabel={ui.t("resetDialog.confirm")}
                    description={
                        <div className="grid gap-2">
                            <div>{ui.t("resetDialog.line1")}</div>
                            <div className="ui-sketch-muted font-extrabold">{ui.t("resetDialog.line2")}</div>
                        </div>
                    }
                    onConfirm={() => {
                        const fresh = initialState ?? entry.defaultState ?? null;
                        if (fresh) {
                            setState(fresh);
                            onStateChange?.(fresh);
                        } else {
                            setState({ version: 1, updatedAt: new Date().toISOString(), data: {} });
                        }
                    }}
                />
            </>
        );
    }

    // ARCHETYPE
    const spec: SketchSpec = resolved?.spec;
    const s: SavedSketchState = state ?? defaultStateForSpec(spec);

    const shellTitle = tt.resolve(title ?? spec.title);
    const subtitle = tt.resolve(spec.subtitle ?? null);
    const rightMarkdown = tt.resolve(spec.hudMarkdown ?? null);

    return (
        <>
            <SketchShell
                title={shellTitle || undefined}
                subtitle={subtitle || undefined}
                tone={spec.tone}
                height={height}
                rightMarkdown={rightMarkdown || undefined}
                left={
                    <SketchRenderer
                        spec={spec}
                        value={s}
                        onChange={(next) => {
                            setState(next);
                            onStateChange?.(next);
                        }}
                        readOnly={readOnly}
                    />
                }
                footer={footer}
            />

            <ConfirmDialog
                open={confirmReset}
                onOpenChange={setConfirmReset}
                danger
                title={ui.t("resetDialog.title")}
                confirmLabel={ui.t("resetDialog.confirm")}
                description={
                    <div className="grid gap-2">
                        <div>{ui.t("resetDialog.line1")}</div>
                        <div className="ui-sketch-muted font-extrabold">{ui.t("resetDialog.line2")}</div>
                    </div>
                }
                onConfirm={() => {
                    const fresh = defaultStateForSpec(spec);
                    setState(fresh);
                    onStateChange?.(fresh);
                }}
            />
        </>
    );
}