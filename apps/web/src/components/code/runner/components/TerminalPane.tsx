// src/components/code/runner/components/TerminalPane.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RunResult } from "@/lib/code/types";
import type { TermLine } from "../types";
import { cleanTermText } from "../utils/text";

const lineCls = (t: TermLine["type"]) => {
    switch (t) {
        case "err":
            return "font-semibold text-rose-600 dark:text-rose-300";
        case "sys":
            return "text-neutral-500 dark:text-white/60";
        default:
            return "text-neutral-900 dark:text-white/85";
    }
};

function fmtMeta(r: RunResult) {
    const time = r.time ? ` • ${r.time}s` : "";
    const mem = r.memory ? ` • ${Math.round((Number(r.memory) || 0) / 1024)}MB` : "";
    return `${r.status}${time}${mem}`;
}

function statusLabel(busy: boolean, awaitingInput: boolean) {
    if (busy) return "Running";
    if (awaitingInput) return "Waiting";
    return "Idle";
}

function clamp(n: number, lo: number, hi: number) {
    return Math.max(lo, Math.min(hi, n));
}

export default function TerminalPane(props: {
    terminal: TermLine[];
    stdinBuffer: string;
    awaitingInput: boolean;
    inputPrompt: string;
    inputLine: string;
    setInputLine: (v: string) => void;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    busy: boolean;
    disabled: boolean;
    lastResult: RunResult | null;
    onSubmitInput: () => void;
    typedLines: string[];
}) {
    const {
        terminal,
        awaitingInput,
        inputPrompt,
        inputLine,
        setInputLine,
        inputRef,
        busy,
        disabled,
        lastResult,
        onSubmitInput,
        typedLines,
    } = props;

    const scrollRef = useRef<HTMLDivElement | null>(null);

    const [caret, setCaret] = useState<number>(0);
    const [histPos, setHistPos] = useState<number | null>(null);
    const [histDraft, setHistDraft] = useState<string>("");

    const [isCoarsePointer, setIsCoarsePointer] = useState(false);
    const [isNarrowScreen, setIsNarrowScreen] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;

        const coarseMq = window.matchMedia("(pointer: coarse)");
        const narrowMq = window.matchMedia("(max-width: 767px)");

        const update = () => {
            setIsCoarsePointer(coarseMq.matches);
            setIsNarrowScreen(narrowMq.matches);
        };

        update();

        const add = (mq: MediaQueryList, fn: () => void) => {
            if (typeof mq.addEventListener === "function") mq.addEventListener("change", fn);
            else mq.addListener(fn);
        };

        const remove = (mq: MediaQueryList, fn: () => void) => {
            if (typeof mq.removeEventListener === "function") mq.removeEventListener("change", fn);
            else mq.removeListener(fn);
        };

        add(coarseMq, update);
        add(narrowMq, update);

        return () => {
            remove(coarseMq, update);
            remove(narrowMq, update);
        };
    }, []);

    const useBottomPrompt = isCoarsePointer || isNarrowScreen;

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [terminal, awaitingInput, inputLine, useBottomPrompt]);

    useEffect(() => {
        if (!awaitingInput || disabled) return;

        const id = window.setTimeout(() => {
            const el = inputRef.current;
            if (!el) return;
            const len = (inputLine ?? "").length;
            el.focus();
            try {
                el.setSelectionRange(len, len);
            } catch {}
            setCaret(len);
        }, 0);

        return () => window.clearTimeout(id);
    }, [awaitingInput, disabled, inputRef, inputLine]);

    useEffect(() => {
        setCaret((c) => clamp(c, 0, (inputLine ?? "").length));
    }, [inputLine]);

    useEffect(() => {
        if (awaitingInput) {
            const len = (inputLine ?? "").length;
            setCaret(len);
            setHistPos(null);
            setHistDraft("");
        }
    }, [awaitingInput]); // eslint-disable-line react-hooks/exhaustive-deps

    const terminalHasError = !!lastResult && lastResult.ok === false && !awaitingInput;

    const livePrompt = useMemo(() => {
        const p = String(inputPrompt ?? "");
        return p;
    }, [inputPrompt]);

    const syncCaretFromNative = () => {
        const el = inputRef.current;
        if (!el) return;
        setCaret(el.selectionStart ?? 0);
    };

    const placeCaret = (pos: number) => {
        const el = inputRef.current;
        if (!el) return;

        requestAnimationFrame(() => {
            el.focus();
            try {
                el.setSelectionRange(pos, pos);
            } catch {}
            setCaret(pos);
        });
    };

    const placeCaretAtEnd = (value: string) => {
        placeCaret(value.length);
    };

    const recallHistory = (nextPos: number | null) => {
        if (nextPos == null) {
            setHistPos(null);
            setInputLine(histDraft);
            placeCaretAtEnd(histDraft);
            return;
        }

        const line = String(typedLines[nextPos] ?? "");
        setHistPos(nextPos);
        setInputLine(line);
        placeCaretAtEnd(line);
    };

    const insertAtSelection = (text: string) => {
        const el = inputRef.current;
        if (!el) return;

        const value = inputLine ?? "";
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const next = value.slice(0, start) + text + value.slice(end);

        setInputLine(next);

        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            try {
                el.setSelectionRange(pos, pos);
            } catch {}
            setCaret(pos);
        });
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const raw = e.target.value ?? "";
        const next = raw.replace(/\r?\n/g, "");
        setInputLine(next);

        const sel = e.target.selectionStart ?? next.length;
        setCaret(clamp(sel, 0, next.length));
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!awaitingInput || disabled || busy) return;

        if (e.ctrlKey && !e.metaKey) {
            if (e.key.toLowerCase() === "a") {
                e.preventDefault();
                placeCaret(0);
                return;
            }
            if (e.key.toLowerCase() === "e") {
                e.preventDefault();
                placeCaretAtEnd(inputLine ?? "");
                return;
            }
        }

        if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            onSubmitInput();
            return;
        }

        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (!typedLines.length) return;

            if (histPos == null) {
                setHistDraft(String(inputLine ?? ""));
                recallHistory(typedLines.length - 1);
            } else {
                recallHistory(Math.max(0, histPos - 1));
            }
            return;
        }

        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (histPos == null) return;

            if (histPos >= typedLines.length - 1) {
                recallHistory(null);
            } else {
                recallHistory(histPos + 1);
            }
            return;
        }

        if (e.key === "Tab") {
            e.preventDefault();
            insertAtSelection("  ");
            return;
        }

        if (e.key === "Escape") {
            e.preventDefault();
            setInputLine("");
            setHistPos(null);
            setHistDraft("");
            placeCaret(0);
            return;
        }

        requestAnimationFrame(syncCaretFromNative);
    };

    const handleKeyUp = () => {
        syncCaretFromNative();
    };

    const handleSelect = () => {
        syncCaretFromNative();
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        if (!awaitingInput || disabled || busy) return;

        e.preventDefault();

        const text = e.clipboardData.getData("text") ?? "";
        const cleaned = text.replace(/\r?\n/g, " ");
        if (!cleaned) return;

        insertAtSelection(cleaned);
    };

    const inputBefore = cleanTermText(String(inputLine ?? "").slice(0, caret));
    const inputAfter = cleanTermText(String(inputLine ?? "").slice(caret));

    const sharedTextareaProps = {
        ref: inputRef,
        value: inputLine,
        onChange: handleChange,
        onKeyDown: handleKeyDown,
        onKeyUp: handleKeyUp,
        onSelect: handleSelect,
        onClick: handleSelect,
        onPaste: handlePaste,
        rows: 1,
        wrap: "off" as const,
        autoComplete: "off",
        autoCapitalize: "off" as const,
        autoCorrect: "off" as const,
        spellCheck: false,
        inputMode: "text" as const,
        enterKeyHint: "send" as const,
        "aria-label": inputPrompt
            ? `Terminal input. ${String(inputPrompt).trim()}`
            : "Terminal input",
        style: { caretColor: "transparent" as const },
    };

    return (
        <>
            <style jsx global>{`
        @keyframes ui-term-blink {
          0%,
          49% {
            opacity: 1;
          }
          50%,
          100% {
            opacity: 0;
          }
        }

        .ui-term-cursor {
          display: inline-block;
          margin-left: 1px;
          opacity: 0.75;
          animation: ui-term-blink 1s step-end infinite;
          will-change: opacity;
        }
      `}</style>

            <div
                className={[
                    "h-full rounded-2xl border-t p-2 sm:p-3 flex flex-col",
                    "bg-white/80 dark:bg-black/40",
                    terminalHasError ? "border-rose-300/30" : "border-neutral-200 dark:border-white/10",
                ].join(" ")}
            >
                <div className="flex items-center justify-between gap-2">
                    <div className="text-[10px] sm:text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                        Terminal
                    </div>

                    <div className="text-[10px] sm:text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                        {statusLabel(busy, awaitingInput)}
                        {lastResult && !awaitingInput ? ` • ${fmtMeta(lastResult)}` : ""}
                    </div>
                </div>

                <div
                    ref={scrollRef}
                    role="log"
                    aria-live="polite"
                    aria-relevant="additions text"
                    className={[
                        "mt-2 flex-1 overflow-auto border-t py-2",
                        "bg-white/60 dark:bg-black/30",
                        terminalHasError ? "border-rose-300/20" : "border-neutral-200 dark:border-white/10",
                    ].join(" ")}
                >
                    <div
                        className={[
                            "relative font-mono text-[11px] sm:text-xs leading-[1.35rem] sm:leading-5",
                            "whitespace-pre-wrap px-2 break-words",
                            "mx-1",
                        ].join(" ")}
                    >
                        {terminal.map((l, i) => {
                            const isLast = i === terminal.length - 1;
                            const showInlineInput = awaitingInput && !useBottomPrompt && isLast;

                            return (
                                <React.Fragment key={i}>
                  <span className={`${lineCls(l.type)} pb-[10rem]`}>
                    {cleanTermText(l.text)}
                  </span>

                                    {showInlineInput ? (
                                        <>
    <span
        aria-hidden="true"
        className={[
            "pointer-events-none font-mono text-[11px] sm:text-xs leading-[1.35rem] sm:leading-5 whitespace-pre-wrap break-words",
            lineCls("in"),
        ].join(" ")}
    >
      {inputBefore}
        <span className="ui-term-cursor">▋</span>
        {inputAfter}
    </span>

                                            <textarea
                                                {...sharedTextareaProps}
                                                className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent opacity-[0.01] text-[16px] text-transparent outline-none"
                                            />
                                        </>
                                    ) : null}

                                    {!isLast ? "\n" : null}
                                </React.Fragment>
                            );
                        })}

                        {awaitingInput && !useBottomPrompt && terminal.length === 0 ? (
                            <div className="relative min-h-[1.25rem]">
                                <div
                                    aria-hidden="true"
                                    className={[
                                        "pointer-events-none font-mono text-[11px] sm:text-xs leading-[1.35rem] sm:leading-5 whitespace-pre-wrap break-words",
                                        lineCls("in"),
                                    ].join(" ")}
                                >
                                    {livePrompt}
                                    {inputBefore}
                                    <span className="ui-term-cursor">▋</span>
                                    {inputAfter}
                                </div>

                                <textarea
                                    {...sharedTextareaProps}
                                    className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent opacity-[0.01] text-[16px] text-transparent outline-none"
                                />
                            </div>
                        ) : null}
                    </div>
                </div>

                {awaitingInput && useBottomPrompt ? (
                    <div
                        className={[
                            "relative mt-2 border-t px-2.5 py-2 sm:px-3",
                            "bg-white/70 dark:bg-black/25",
                            "border-neutral-200 dark:border-white/10",
                        ].join(" ")}
                    >
                        <div
                            aria-hidden="true"
                            className={[
                                "pointer-events-none font-mono text-[11px] sm:text-xs leading-[1.35rem] sm:leading-5 whitespace-pre-wrap break-words",
                                lineCls("in"),
                            ].join(" ")}
                        >
                            {livePrompt}
                            {inputBefore}
                            <span className="ui-term-cursor">▋</span>
                            {inputAfter}
                        </div>

                        <textarea
                            {...sharedTextareaProps}
                            className="absolute inset-0 h-full w-full resize-none border-0 bg-transparent opacity-[0.01] text-[16px] text-transparent outline-none"
                        />
                    </div>
                ) : null}
            </div>
        </>
    );
}