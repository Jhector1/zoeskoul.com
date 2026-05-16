"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "./practiceType";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import MatrixInputPanel from "./MatrixInputPanel";
import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";
import { useReviewTools } from "@/components/review/module/context/ReviewToolsContext";

async function copyToClipboard(text: string) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        try {
            const ta = document.createElement("textarea");
            ta.value = text;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            return true;
        } catch {
            return false;
        }
    }
}

function matrixToText(values: number[][]) {
    return values.map((r) => r.join(" ")).join("\n");
}



type RevealFillPatch = Partial<QItem> & Record<string, unknown>;

export function buildRevealFillPatches(args: {
    fillPatch: RevealFillPatch;
    isCodeInput: boolean;
}) {
    const itemPatch: RevealFillPatch = {
        ...args.fillPatch,
        ...(args.isCodeInput ? { codeTouched: true } : {}),
        submitted: false,
        feedbackDismissed: true,
        dismissFeedbackOnEdit: true,
        updateOrigin: "user",
    };

    const toolsPatch: RevealFillPatch = args.isCodeInput
        ? {
            ...itemPatch,
            userEdited: true,
            preferSnapshot: true,
            workspaceOrigin: "user",
        }
        : itemPatch;

    return {
        itemPatch,
        toolsPatch,
    };
}

export function applyRevealFillAnswer(args: {
    fillPatch: RevealFillPatch;
    isCodeInput: boolean;
    codeInputId?: string;
    updateCurrent: (patch: Partial<QItem>) => void;
    patchCodeInput?: (id: string, patch: any) => void;
}) {
    const { itemPatch, toolsPatch } = buildRevealFillPatches({
        fillPatch: args.fillPatch,
        isCodeInput: args.isCodeInput,
    });

    args.updateCurrent(itemPatch as Partial<QItem>);

    if (args.isCodeInput && args.codeInputId) {
        args.patchCodeInput?.(args.codeInputId, toolsPatch);
    }

    return {
        itemPatch,
        toolsPatch,
    };
}







function matrixToGridStrings(values: number[][]) {
    return values.map((row) => row.map((v) => String(v)));
}

type RevealModel = {
    title: string;
    copyText: string;
    fillPatch: Partial<QItem> | null;
    node: React.ReactNode;
};

const REVEAL_PANEL = "ui-surface-muted p-3";
const REVEAL_CHIP =
    "ui-pill-neutral max-w-full min-w-0 h-auto items-start px-2 py-1 text-left leading-relaxed whitespace-normal break-words [overflow-wrap:anywhere]";
const REVEAL_PRE =
    "mt-1 overflow-x-auto rounded-md border p-3 font-mono text-xs leading-relaxed ui-border ui-bg-surface ui-text";
const REVEAL_SMALL_LABEL = "ui-meta-strong";

export default function RevealAnswerCard({
                                             exercise,
                                             current,
                                             reveal,
                                             title = "Revealed answer",
                                             updateCurrent,
                                             autoScroll = true,
                                             codeInputId,
                                         }: {
    exercise: Exercise | null;
    current: QItem;
    reveal: any;
    title?: string;
    updateCurrent: (patch: Partial<QItem>) => void;
    autoScroll?: boolean;
    codeInputId?: string;
}) {
    const [copied, setCopied] = useState(false);
    const [filled, setFilled] = useState(false);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const tools = useReviewTools();

    const { raw } = useTaggedT();
    const exT: Exercise | null = useMemo(() => {
        if (!exercise) return null;
        return resolveDeepTagged(exercise, (key) => raw(key, "")) as Exercise;
    }, [exercise, raw]);

    const model: RevealModel | null = useMemo(() => {
        if (!reveal || typeof reveal !== "object") return null;

        const kind = String(reveal.kind ?? exT?.kind ?? exercise?.kind);

        if (kind === "numeric") {
            const v = reveal.value;
            const copyText = v == null ? "" : String(v);
            return {
                title: "Answer",
                copyText,
                fillPatch: copyText ? ({ num: copyText } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <MathMarkdown
                            content={`$$${copyText || "\\text{(empty)}"}$$`}
                            className="max-w-none [&_.katex]:text-[rgb(var(--ui-text)/0.96)]"
                        />
                    </div>
                ),
            };
        }

        if (kind === "code_input") {
            const lang = String(reveal.language ?? current.codeLang ?? "python");
            const code = String(reveal.solutionCode ?? reveal.code ?? "");
            const stdin = String(reveal.stdin ?? "");

            const workspace =
                reveal.workspace && typeof reveal.workspace === "object"
                    ? reveal.workspace
                    : reveal.solutionWorkspace && typeof reveal.solutionWorkspace === "object"
                        ? reveal.solutionWorkspace
                        : reveal.codeWorkspace && typeof reveal.codeWorkspace === "object"
                            ? reveal.codeWorkspace
                            : null;

            const copyText = code.trim() ? code : "";

            return {
                title: `Solution code (${lang})`,
                copyText,
                fillPatch: copyText || workspace
                    ? ({
                        code: copyText,
                        source: copyText,
                        codeLang: lang as any,
                        language: lang as any,
                        lang: lang as any,
                        codeStdin: stdin,
                        stdin,
                        ...(workspace
                            ? {
                                workspace,
                                codeWorkspace: workspace,
                                ideWorkspace: workspace,
                            }
                            : {}),
                    } as Partial<QItem>)
                    : null,
                node: (
                    <div className="ui-surface-muted overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 ui-border ui-bg-surface-soft">
                            <div className="ui-meta-strong">{lang.toUpperCase()}</div>
                            <div className="ui-meta">Copy/paste into the editor, then Submit.</div>
                        </div>

                        <pre className="p-3 overflow-x-auto font-mono text-xs leading-relaxed ui-text">
                            <code>{code?.trim() ? code : "// (no solutionCode provided)"}</code>
                        </pre>

                        {stdin ? (
                            <div className="border-t px-3 py-2 ui-border">
                                <div className={REVEAL_SMALL_LABEL}>stdin</div>
                                <pre className={REVEAL_PRE}>
                                    <code>{stdin}</code>
                                </pre>
                            </div>
                        ) : null}
                    </div>
                ),
            };
        }

        if (kind === "matrix_input") {
            const values = Array.isArray(reveal.values) ? (reveal.values as number[][]) : [];
            const rows = values.length;
            const cols = values[0]?.length ?? 0;

            const copyText = rows && cols ? matrixToText(values) : "";
            return {
                title: "Matrix answer",
                copyText,
                fillPatch:
                    rows && cols
                        ? ({
                            matRows: rows,
                            matCols: cols,
                            mat: matrixToGridStrings(values),
                        } as Partial<QItem>)
                        : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <MatrixInputPanel
                            labelLatex={(reveal.labelLatex as string) ?? String.raw`\mathbf{A}=`}
                            rows={rows}
                            cols={cols}
                            allowResize={false}
                            value={matrixToGridStrings(values)}
                            readOnly={true}
                            requiredRows={rows}
                            requiredCols={cols}
                            onShapeChange={() => {}}
                            onChange={() => {}}
                        />
                    </div>
                ),
            };
        }

        if (kind === "voice_input") {
            const transcript =
                String(reveal.preferred ?? reveal.transcript ?? "").trim() ||
                String((Array.isArray(reveal.answers) ? reveal.answers[0] : "") ?? "").trim();

            const answers = Array.isArray(reveal.answers) ? reveal.answers.map(String) : [];
            const copyText = transcript;

            return {
                title: "Correct transcript",
                copyText,
                fillPatch: transcript ? ({ voiceTranscript: transcript } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>Transcript</div>
                        <div className="mt-1 ui-title-sm">{transcript || "—"}</div>

                        {answers.length ? (
                            <>
                                <div className="mt-3 ui-meta">Also accepted</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {answers.map((a: string) => (
                                        <span key={a} className={REVEAL_CHIP}>
                                            {a}
                                        </span>
                                    ))}
                                </div>
                            </>
                        ) : null}
                    </div>
                ),
            };
        }

        if (kind === "drag_reorder") {
            const order = Array.isArray(reveal.order) ? reveal.order.map(String) : [];
            const tokens = Array.isArray((exT as any)?.tokens) ? (exT as any).tokens : [];
            const byId = new Map(tokens.map((t: any) => [String(t.id), String(t.text ?? t.label ?? t.id)]));

            const copyText = order
                .map((raw: any) => {
                    const sid = String(raw);
                    return byId.get(sid) ?? sid;
                })
                .join(" ");

            return {
                title: "Correct order",
                copyText,
                fillPatch: order.length ? ({ reorder: order, reorderIds: order } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>Correct order</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {order.length ? (
                                order.map((raw: any) => {
                                    const sid = String(raw);
                                    const label = String(byId.get(sid) ?? sid);
                                    return (
                                        <span key={sid} className={REVEAL_CHIP}>
                                            {label}
                                        </span>
                                    );
                                })
                            ) : (
                                <span className="ui-meta">—</span>
                            )}
                        </div>
                    </div>
                ),
            };
        }

        if (
            kind === "text_input" ||
            kind === "listen_build" ||
            kind === "word_bank_arrange" ||
            kind === "fill_blank_choice"
        ) {
            const answers = Array.isArray(reveal.answers) ? reveal.answers.map(String) : [];
            const preferred = String(reveal.preferred ?? reveal.value ?? (answers[0] ?? "")).trim();
            const copyText = preferred || (answers[0] ?? "");

            return {
                title:
                    kind === "fill_blank_choice"
                        ? "Correct choice"
                        : kind === "listen_build"
                            ? "Correct sentence"
                            : kind === "word_bank_arrange"
                                ? "Correct sentence"
                                : "Accepted answers",
                copyText,
                fillPatch: copyText ? ({ text: copyText, single: copyText } as Partial<QItem>) : null,
                node: (
                    <div className={`${REVEAL_PANEL} min-w-0`}>
                        <div className={REVEAL_SMALL_LABEL}>
                            {kind === "text_input" ? "Accepted" : "Answer"}
                        </div>

                        <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                            {answers.length ? (
                                answers.map((a: string) => (
                                    <span key={a} className={REVEAL_CHIP}>
                                        {a}
                                    </span>
                                ))
                            ) : copyText ? (
                                <span className={REVEAL_CHIP}>{copyText}</span>
                            ) : (
                                <span className="ui-meta">—</span>
                            )}
                        </div>
                    </div>
                ),
            };
        }

        if (kind === "single_choice") {
            const optionId = String(reveal.optionId ?? "");
            const options = (exT as any)?.options ?? [];
            const found = options.find((o: any) => String(o.id) === optionId);
            const label = found?.label ?? found?.text ?? found?.markdown ?? found?.latex ?? optionId;

            return {
                title: "Correct choice",
                copyText: optionId,
                fillPatch: optionId ? ({ single: optionId } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>Option</div>
                        <div className="mt-1 text-sm ui-text">
                            <MathMarkdown
                                content={String(label)}
                                className="max-w-none [&_.katex]:text-[rgb(var(--ui-text)/0.96)]"
                            />
                        </div>
                        <div className="mt-2 ui-meta">id: {optionId}</div>
                    </div>
                ),
            };
        }

        if (kind === "multi_choice") {
            const optionIds = Array.isArray(reveal.optionIds) ? reveal.optionIds.map(String) : [];
            const options = (exT as any)?.options ?? [];
            const byId = new Map(options.map((o: any) => [String(o.id), String(o.text ?? o.label ?? o.id)]));

            const copyText = optionIds.join(", ");

            return {
                title: "Correct choices",
                copyText,
                fillPatch: optionIds.length ? ({ multi: optionIds } as Partial<QItem>) : null,
                node: (
                    <div className={`${REVEAL_PANEL} min-w-0`}>
                        <div className={REVEAL_SMALL_LABEL}>Options</div>

                        {optionIds.length ? (
                            <div className="mt-2 flex min-w-0 flex-wrap gap-2">
                                {optionIds.map((id: any) => (
                                    <span key={id} className={REVEAL_CHIP}>
                                        {byId.get(id) ?? id}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-1 ui-meta">—</div>
                        )}
                    </div>
                ),
            };
        }

        if (kind === "vector_drag_target" || kind === "vector_drag_dot") {
            const sol = reveal.solutionA ?? reveal.targetA ?? null;
            const b = reveal.b ?? null;
            const copyText = sol ? JSON.stringify(sol) : "";

            return {
                title: "One valid vector answer",
                copyText,
                fillPatch: sol ? ({ dragA: sol, ...(b ? { dragB: b } : {}) } as Partial<QItem>) : null,
                node: (
                    <div className={REVEAL_PANEL}>
                        <div className={REVEAL_SMALL_LABEL}>a</div>
                        <pre className={REVEAL_PRE}>{JSON.stringify(sol, null, 2)}</pre>
                        {b ? (
                            <>
                                <div className="mt-3 ui-meta-strong">b</div>
                                <pre className={REVEAL_PRE}>{JSON.stringify(b, null, 2)}</pre>
                            </>
                        ) : null}
                    </div>
                ),
            };
        }

        return null;
    }, [reveal, exT, exercise, current.codeLang]);

    useEffect(() => {
        if (!autoScroll) return;
        if (!model) return;

        const el = rootRef.current;
        if (!el) return;

        requestAnimationFrame(() => {
            scrollIntoViewSmart(el, {
                block: "end",
                force: true,
                offsetPx: 12,
            });
        });
    }, [autoScroll, model]);

    if (!model) return null;
    const m = model;

    async function onCopy() {
        if (!m.copyText) return;
        const ok = await copyToClipboard(m.copyText);
        if (!ok) return;
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1200);
    }

    function onFill() {
        if (!m.fillPatch) return;

        const isCodeInput =
            String(reveal?.kind ?? exercise?.kind ?? "") === "code_input";

        applyRevealFillAnswer({
            fillPatch: m.fillPatch,
            isCodeInput,
            codeInputId,
            updateCurrent,
            patchCodeInput: tools?.patchCodeInput,
        });

        setFilled(true);
        window.setTimeout(() => setFilled(false), 1200);
    }
    return (
        <div ref={rootRef} className="mt-3 min-w-0">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0 ui-meta-strong">{title}</div>

                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                    <button
                        onClick={onCopy}
                        disabled={!m.copyText}
                        className="ui-btn-secondary w-full justify-center sm:w-auto"
                    >
                        {copied ? "Copied ✓" : "Copy"}
                    </button>

                    <button
                        onClick={onFill}
                        disabled={!m.fillPatch}
                        className="ui-btn-secondary w-full justify-center sm:w-auto"
                        title="Fill the input with the revealed answer"
                    >
                        {filled ? "Filled ✓" : "Fill answer"}
                    </button>
                </div>
            </div>

            <div className="mt-2 min-w-0">{m.node}</div>
        </div>
    );
}
