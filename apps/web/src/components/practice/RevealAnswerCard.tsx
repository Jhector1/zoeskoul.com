"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { Exercise } from "@/lib/practice/types";
import type { QItem } from "./practiceType";

import MathMarkdown from "@/components/markdown/MathMarkdown";
import MatrixInputPanel from "./MatrixInputPanel";
import { scrollIntoViewSmart } from "@/lib/ui/flowScroll";

// ✅ NEW: resolve @: keys so reveal never shows raw keys
import { useTaggedT } from "@/i18n/tagged";
import { resolveDeepTagged } from "@/i18n/resolveDeepTagged";

function cn(...cls: Array<string | false | undefined | null>) {
    return cls.filter(Boolean).join(" ");
}

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

function matrixToGridStrings(values: number[][]) {
    return values.map((row) => row.map((v) => String(v)));
}

type RevealModel = {
    title: string;
    copyText: string;
    fillPatch: Partial<QItem> | null;
    node: React.ReactNode;
};

export default function RevealAnswerCard({
                                             exercise,
                                             current,
                                             result,
                                             updateCurrent,
                                         }: {
    exercise: Exercise | null;
    current: QItem;
    result: any;
    updateCurrent: (patch: Partial<QItem>) => void;
}) {
    // Prefer new API shape, fallback to old `expected`
    const reveal = (result?.revealAnswer ?? result?.reveal ?? result?.expected) as any;

    const [copied, setCopied] = useState(false);

    // ✅ MUST be declared before any conditional returns (Rules of Hooks)
    const rootRef = useRef<HTMLDivElement | null>(null);

    // ✅ Resolve @: keys inside exercise (options, prompt fragments, etc.)
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <MathMarkdown
                            content={`$$${copyText || "\\text{(empty)}"}$$`}
                            className="prose prose-invert max-w-none prose-p:my-2 prose-strong:text-white prose-code:text-white"
                        />
                    </div>
                ),
            };
        }

        if (kind === "code_input") {
            const lang = String(reveal.language ?? current.codeLang ?? "python");
            const code = String(reveal.solutionCode ?? reveal.code ?? "");
            const stdin = String(reveal.stdin ?? "");
            const copyText = code.trim() ? code : "";

            return {
                title: `Solution code (${lang})`,
                copyText,
                fillPatch: copyText
                    ? ({
                        code: copyText,
                        codeLang: lang as any,
                        codeStdin: stdin,
                    } as Partial<QItem>)
                    : null,
                node: (
                    <div className="rounded-2xl border border-white/10 bg-black/20 overflow-hidden">
                        <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-black/30 px-3 py-2">
                            <div className="text-[11px] font-extrabold text-white/70">{lang.toUpperCase()}</div>
                            <div className="text-[11px] text-white/45">Copy/paste into the editor, then Submit.</div>
                        </div>

                        {/* ✅ render solution as plain text (no markdown parsing) */}
                        <pre className="p-3 text-xs leading-relaxed text-white/85 overflow-x-auto">
              <code>{code?.trim() ? code : "// (no solutionCode provided)"}</code>
            </pre>

                        {stdin ? (
                            <div className="border-t border-white/10 px-3 py-2">
                                <div className="text-[11px] font-extrabold text-white/60">stdin</div>
                                <pre className="mt-1 text-xs text-white/80 overflow-x-auto">
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-extrabold text-white/70">Transcript</div>
                        <div className="mt-1 text-sm font-black text-white/90">{transcript || "—"}</div>

                        {answers.length ? (
                            <>
                                <div className="mt-3 text-xs font-extrabold text-white/60">Also accepted</div>
                                <div className="mt-2 flex flex-wrap gap-2">
                                    {answers.map((a: string) => (
                                        <span
                                            key={a}
                                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"
                                        >
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-extrabold text-white/70">Correct order</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {order.length ? (
                                order.map((raw: any) => {
                                    const sid = String(raw);
                                    const label = String(byId.get(sid) ?? sid);
                                    return (
                                        <span
                                            key={sid}
                                            className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"
                                        >
                      {label}
                    </span>
                                    );
                                })
                            ) : (
                                <span className="text-xs text-white/60">—</span>
                            )}
                        </div>
                    </div>
                ),
            };
        }

        // ✅ unified branch for text-like answers
        if (
            kind === "text_input" ||
            kind === "listen_build" ||
            kind === "word_bank_arrange" ||
            kind === "fill_blank_choice"
        ) {
            const answers = Array.isArray(reveal.answers) ? reveal.answers.map(String) : [];
            const preferred = String(reveal.preferred ?? reveal.value ?? (answers[0] ?? "")).trim();
            const copyText = preferred || (answers[0] ?? "");

            const title =
                kind === "fill_blank_choice"
                    ? "Correct choice"
                    : kind === "listen_build"
                        ? "Correct sentence"
                        : kind === "word_bank_arrange"
                            ? "Correct sentence"
                            : "Accepted answers";

            return {
                title,
                copyText,
                fillPatch: copyText ? ({ text: copyText, single: copyText } as Partial<QItem>) : null,
                node: (
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs font-extrabold text-white/70">
                            {kind === "text_input" ? "Accepted" : "Answer"}
                        </div>

                        <div className="mt-2 flex flex-wrap gap-2">
                            {answers.length ? (
                                answers.map((a: string) => (
                                    <span
                                        key={a}
                                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"
                                    >
                    {a}
                  </span>
                                ))
                            ) : copyText ? (
                                <span className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85">
                  {copyText}
                </span>
                            ) : (
                                <span className="text-xs text-white/60">—</span>
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs text-white/70 font-extrabold">Option</div>
                        <div className="mt-1 text-sm text-white/90">
                            <MathMarkdown
                                content={String(label)}
                                className="prose prose-invert max-w-none prose-p:my-2 prose-strong:text-white prose-code:text-white"
                            />
                        </div>
                        <div className="mt-2 text-[11px] text-white/50">id: {optionId}</div>
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                        <div className="text-xs text-white/70 font-extrabold">Options</div>

                        {optionIds.length ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {optionIds.map((id: any) => (
                                    <span
                                        key={id}
                                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-1 text-xs font-extrabold text-white/85"
                                    >
                    {byId.get(id) ?? id}
                  </span>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-1 text-sm text-white/60">—</div>
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
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs text-white/80">
                        <div className="font-extrabold text-white/85">a</div>
                        <pre className="mt-1 overflow-x-auto">{JSON.stringify(sol, null, 2)}</pre>
                        {b ? (
                            <>
                                <div className="mt-3 font-extrabold text-white/85">b</div>
                                <pre className="mt-1 overflow-x-auto">{JSON.stringify(b, null, 2)}</pre>
                            </>
                        ) : null}
                    </div>
                ),
            };
        }

        return null;
    }, [reveal, exT, exercise, current.codeLang]);

    // ✅ scroll when the reveal block appears/changes
    useEffect(() => {
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
    }, [model]);

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
        updateCurrent({ ...m.fillPatch, submitted: false, result: null });
    }

    return (
        <div ref={rootRef} className="mt-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[11px] font-extrabold text-white/70">Revealed answer</div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={onCopy}
                        disabled={!m.copyText}
                        className={cn(
                            "rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-extrabold hover:bg-white/15 disabled:opacity-50"
                        )}
                    >
                        {copied ? "Copied ✓" : "Copy"}
                    </button>

                    <button
                        onClick={onFill}
                        disabled={!m.fillPatch}
                        className="rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-[11px] font-extrabold hover:bg-white/15 disabled:opacity-50"
                        title="Fill the input with the revealed answer"
                    >
                        Fill answer
                    </button>
                </div>
            </div>

            <div className="mt-2">{m.node}</div>
        </div>
    );
}