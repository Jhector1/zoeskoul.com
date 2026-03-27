"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { RunResult } from "@/lib/code/types";
import {TerminalChunk} from "@/components/code/runner/runtime";
// import type { TerminalChunk } from "@/components/code/runner/hooks/controller/useCodeRunnerController";

function fmtMeta(r: RunResult) {
    const time = r.time ? ` • ${r.time}s` : "";
    const mem = r.memory ? ` • ${Math.round((Number(r.memory) || 0) / 1024)}MB` : "";
    return `${r.status}${time}${mem}`;
}

function statusLabel(busy: boolean, inputEnabled: boolean) {
    if (inputEnabled) return "Interactive";
    if (busy) return "Running";
    return "Idle";
}

function chunkClass(kind: TerminalChunk["kind"]) {
    if (kind === "err") return "text-rose-600 dark:text-rose-300";
    if (kind === "sys") return "text-neutral-500 dark:text-white/50";
    return "text-neutral-900 dark:text-white/85";
}

export default function PlainTerminal(props: {
    terminalFeed: TerminalChunk[];
    inputEnabled: boolean;
    busy: boolean;
    disabled: boolean;
    lastResult: RunResult | null;
    onSendData: (data: string) => void;
}) {
    const {
        terminalFeed,
        inputEnabled,
        busy,
        disabled,
        lastResult,
        onSendData,
    } = props;

    const scrollRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [line, setLine] = useState("");

    const statusText = useMemo(
        () =>
            `${statusLabel(busy, inputEnabled)}${
                lastResult && !inputEnabled ? ` • ${fmtMeta(lastResult)}` : ""
            }`,
        [busy, inputEnabled, lastResult],
    );

    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [terminalFeed, inputEnabled]);

    useEffect(() => {
        if (!inputEnabled || disabled) return;
        const id = window.setTimeout(() => {
            inputRef.current?.focus();
        }, 0);
        return () => window.clearTimeout(id);
    }, [inputEnabled, disabled]);

    useEffect(() => {
        if (!inputEnabled) {
            setLine("");
        }
    }, [inputEnabled]);

    const submit = () => {
        if (!inputEnabled || disabled) return;
        const value = line;
        setLine("");
        onSendData(value + "\n");
    };

    return (
        <div
            className={[
                "h-full rounded-2xl border-t p-2 sm:p-3 flex flex-col",
                "bg-white/80 dark:bg-black/40",
                "border-neutral-200 dark:border-white/10",
            ].join(" ")}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] sm:text-[11px] font-extrabold text-neutral-600 dark:text-white/60">
                    Terminal
                </div>

                <div className="text-[10px] sm:text-[11px] font-extrabold text-neutral-500 dark:text-white/50">
                    {statusText}
                </div>
            </div>

            <div
                ref={scrollRef}
                className={[
                    "mt-2 flex-1 overflow-auto border-t py-2 px-2",
                    "bg-white/60 dark:bg-black/30",
                    "border-neutral-200 dark:border-white/10",
                    "font-mono text-[11px] sm:text-xs whitespace-pre-wrap break-words",
                ].join(" ")}
                role="log"
                aria-live="polite"
            >
                {terminalFeed.length === 0 ? (
                    <div className="text-neutral-400 dark:text-white/30">No output yet.</div>
                ) : (
                    terminalFeed.map((chunk) => (
                        <span key={chunk.id} className={chunkClass(chunk.kind)}>
                            {chunk.data}
                        </span>
                    ))
                )}
            </div>

            <div className="mt-2 border-t border-neutral-200 dark:border-white/10 pt-2">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-neutral-500 dark:text-white/40">
                        &gt;
                    </span>

                    <input
                        ref={inputRef}
                        type="text"
                        value={line}
                        disabled={!inputEnabled || disabled}
                        onChange={(e) => setLine(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                submit();
                            }
                        }}
                        placeholder={
                            inputEnabled
                                ? "Type input and press Enter"
                                : "Program is not waiting for input"
                        }
                        className={[
                            "flex-1 rounded-lg border px-3 py-2 text-sm outline-none",
                            "bg-white dark:bg-white/[0.06]",
                            "border-neutral-200 dark:border-white/10",
                            "text-neutral-900 dark:text-white",
                            "placeholder:text-neutral-400 dark:placeholder:text-white/25",
                            !inputEnabled || disabled ? "opacity-60 cursor-not-allowed" : "",
                        ].join(" ")}
                    />

                    <button
                        type="button"
                        onClick={submit}
                        disabled={!inputEnabled || disabled}
                        className={[
                            "rounded-lg px-3 py-2 text-xs font-extrabold transition",
                            inputEnabled && !disabled
                                ? "bg-emerald-600 text-white hover:bg-emerald-500"
                                : "bg-neutral-200 text-neutral-500 dark:bg-white/10 dark:text-white/35",
                        ].join(" ")}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}