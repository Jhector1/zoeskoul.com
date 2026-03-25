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
    const renderedCountRef = useRef(0);

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
        if (!host) return;

        const isDark = document.documentElement.classList.contains("dark");

        const term = new Terminal({
            convertEol: false,
            cursorBlink: isReadyForInput,
            disableStdin: !isReadyForInput,
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

        const fitAndReport = () => {
            try {
                fitAddon.fit();
                onResize(term.cols, term.rows);
            } catch {}
        };

        fitAndReport();

        termRef.current = term;

        const ro = new ResizeObserver(() => {
            fitAndReport();
        });
        ro.observe(host);

        const mo = new MutationObserver(() => {
            const dark = document.documentElement.classList.contains("dark");
            term.options.theme = getTheme(dark);
        });
        mo.observe(document.documentElement, {
            attributes: true,
            attributeFilter: ["class"],
        });

        const focusTerminal = () => term.focus();
        host.addEventListener("click", focusTerminal);

        return () => {
            host.removeEventListener("click", focusTerminal);
            ro.disconnect();
            mo.disconnect();
            term.dispose();
            termRef.current = null;
        };
    }, [onResize, isReadyForInput]);

    useEffect(() => {
        const term = termRef.current;
        if (!term) return;
        term.options.cursorBlink = isReadyForInput;
        term.options.disableStdin = !isReadyForInput;
        if (isReadyForInput) term.focus();
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
                    "mt-2 flex-1 overflow-hidden border-t py-2",
                    "bg-white/60 dark:bg-black/30",
                    "border-neutral-200 dark:border-white/10",
                ].join(" ")}
            >
                <div
                    ref={hostRef}
                    className="h-full w-full px-2"
                    aria-label="Interactive terminal"
                />
            </div>
        </div>
    );
}