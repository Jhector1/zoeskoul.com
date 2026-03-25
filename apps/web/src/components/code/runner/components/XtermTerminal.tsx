"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { RunResult } from "@/lib/code/types";
import type { TerminalChunk } from "../hooks/useCodeRunnerController";

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

function getTheme(isDark: boolean) {
    return isDark
        ? {
            background: "rgba(0,0,0,0)",
            foreground: "#f5f5f5",
            cursor: "#34d399",
            cursorAccent: "#0a0a0a",
            selectionBackground: "rgba(255,255,255,0.18)",
        }
        : {
            background: "rgba(0,0,0,0)",
            foreground: "#171717",
            cursor: "#059669",
            cursorAccent: "#ffffff",
            selectionBackground: "rgba(0,0,0,0.12)",
        };
}

export default function XtermTerminal(props: {
    terminalFeed: TerminalChunk[];
    inputEnabled: boolean;
    busy: boolean;
    disabled: boolean;
    lastResult: RunResult | null;
    onSendData: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
}) {
    const {
        terminalFeed,
        inputEnabled,
        busy,
        disabled,
        lastResult,
        onSendData,
        onResize,
    } = props;

    const hostRef = useRef<HTMLDivElement | null>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const renderedCountRef = useRef(0);
    const rafRef = useRef<number | null>(null);

    const isReadyForInput = inputEnabled && !disabled;

    const statusText = useMemo(
        () =>
            `${statusLabel(busy, inputEnabled)}${
                lastResult && !inputEnabled ? ` • ${fmtMeta(lastResult)}` : ""
            }`,
        [busy, inputEnabled, lastResult],
    );

    useEffect(() => {
        const host = hostRef.current;
        if (!host || termRef.current) return;

        const isDark = document.documentElement.classList.contains("dark");

        const term = new Terminal({
            convertEol: false,
            cursorBlink: false,
            disableStdin: true,
            allowTransparency: true,
            fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
            fontSize: 12,
            lineHeight: 1.35,
            scrollback: 5000,
            theme: getTheme(isDark),
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        term.open(host);

        termRef.current = term;
        fitRef.current = fitAddon;

        const safeFit = () => {
            const el = hostRef.current;
            const t = termRef.current;
            const f = fitRef.current;
            if (!el || !t || !f) return;

            if (!document.body.contains(el)) return;

            const width = el.clientWidth;
            const height = el.clientHeight;

            if (width < 20 || height < 20) return;

            try {
                f.fit();
                if (t.cols > 0 && t.rows > 0) {
                    onResize(t.cols, t.rows);
                }
            } catch (err) {
                console.error("xterm fit failed", err);
            }
        };

        rafRef.current = window.setTimeout(() => {
            safeFit();
        }, 0) as unknown as number;

        const ro = new ResizeObserver(() => {
            if (rafRef.current != null) {
                window.clearTimeout(rafRef.current);
            }
            rafRef.current = window.setTimeout(() => {
                safeFit();
            }, 0) as unknown as number;
        });

        ro.observe(host);

        const mo = new MutationObserver(() => {
            const current = termRef.current;
            if (!current) return;
            const dark = document.documentElement.classList.contains("dark");
            current.options.theme = getTheme(dark);
        });

        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        const focusTerminal = () => termRef.current?.focus();
        host.addEventListener("click", focusTerminal);

        return () => {
            host.removeEventListener("click", focusTerminal);
            ro.disconnect();
            mo.disconnect();

            if (rafRef.current != null) {
                window.clearTimeout(rafRef.current);
                rafRef.current = null;
            }

            try {
                term.dispose();
            } catch {}

            termRef.current = null;
            fitRef.current = null;
        };
    }, [onResize]);

    useEffect(() => {
        const term = termRef.current;
        if (!term) return;

        term.options.cursorBlink = isReadyForInput;
        term.options.disableStdin = !isReadyForInput;

        if (isReadyForInput) {
            term.focus();
        }
    }, [isReadyForInput]);

    useEffect(() => {
        const term = termRef.current;
        if (!term) return;

        const sub = term.onData((data) => {
            if (!isReadyForInput) return;
            onSendData(data);
        });

        return () => {
            sub.dispose();
        };
    }, [isReadyForInput, onSendData]);

    useEffect(() => {
        const term = termRef.current;
        if (!term) return;

        if (terminalFeed.length === 0 && renderedCountRef.current > 0) {
            term.clear();
            term.reset();
            renderedCountRef.current = 0;
            return;
        }

        if (terminalFeed.length <= renderedCountRef.current) return;

        for (let i = renderedCountRef.current; i < terminalFeed.length; i++) {
            const chunk = terminalFeed[i];

            if (chunk.kind === "pty") {
                term.write(chunk.data);
            } else if (chunk.kind === "err") {
                term.write(`\x1b[31m${chunk.data}\x1b[0m`);
            } else {
                term.write(`\x1b[90m${chunk.data}\x1b[0m`);
            }
        }

        renderedCountRef.current = terminalFeed.length;
    }, [terminalFeed]);

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
                className={[
                    "mt-2 flex-1 min-h-0 overflow-hidden border-t py-2",
                    "bg-white/60 dark:bg-black/30",
                    "border-neutral-200 dark:border-white/10",
                ].join(" ")}
            >
                <div
                    ref={hostRef}
                    className="h-full w-full min-h-0 px-2"
                    aria-label="Interactive terminal"
                />
            </div>
        </div>
    );
}