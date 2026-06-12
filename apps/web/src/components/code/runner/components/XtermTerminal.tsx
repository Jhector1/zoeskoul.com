"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from "react";
import "xterm/css/xterm.css";
import type { RunResult } from "@/lib/code/types";
import type { TerminalChunk } from "@/components/code/runner/runtime";

type XTermModule = typeof import("xterm");
type XTerm = import("xterm").Terminal;

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

function isHostReady(el: HTMLDivElement | null) {
    if (!el) return false;
    if (!el.isConnected) return false;

    const rect = el.getBoundingClientRect();
    if (rect.width < 80 || rect.height < 120) return false;

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;

    return true;
}

function measureCell(probe: HTMLSpanElement | null) {
    if (!probe) return { width: 9, height: 18 };

    const rect = probe.getBoundingClientRect();
    const width = rect.width / 10;
    const height = rect.height;

    return {
        width: Number.isFinite(width) && width > 0 ? width : 9,
        height: Number.isFinite(height) && height > 0 ? height : 18,
    };
}

function writeChunk(term: XTerm, chunk: TerminalChunk) {
    const text = String(chunk.data ?? "").replace(/\r?\n/g, "\r\n");

    if (chunk.kind === "pty") {
        term.write(text);
        return;
    }

    if (chunk.kind === "err") {
        term.write(`\x1b[31m${text}\x1b[0m`);
        return;
    }

    term.write(`\x1b[90m${text}\x1b[0m`);
}

function splitInputByEnter(data: string) {
    const parts: Array<{ kind: "text" | "enter"; value: string }> = [];
    let buf = "";

    for (const ch of Array.from(data)) {
        if (ch === "\r") {
            if (buf) {
                parts.push({ kind: "text", value: buf });
                buf = "";
            }
            parts.push({ kind: "enter", value: "\r" });
            continue;
        }
        buf += ch;
    }

    if (buf) parts.push({ kind: "text", value: buf });
    return parts;
}

export default function XtermTerminal(props: {
    terminalFeed: TerminalChunk[];
    inputEnabled: boolean;
    busy: boolean;
    disabled: boolean;
    lastResult: RunResult | null;
    onSendData: (data: string) => void;
    onResize: (cols: number, rows: number) => void;
    optimisticLocalEcho?: boolean;
    onBeforeSubmitEnter?: () => Promise<void>;
    onAfterSubmitEnter?: () => Promise<void>;
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

    const transcriptText = useMemo(
        () => terminalFeed.map((chunk) => chunk.data ?? "").join(""),
        [terminalFeed],
    );

    const hostRef = useRef<HTMLDivElement | null>(null);
    const probeRef = useRef<HTMLSpanElement | null>(null);

    const termRef = useRef<XTerm | null>(null);
    const openedRef = useRef(false);
    const inputReadyRef = useRef(false);

    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const mutationObserverRef = useRef<MutationObserver | null>(null);
    const resizeTimerRef = useRef<number | null>(null);
    const openTimerRef = useRef<number | null>(null);
    const raf1Ref = useRef<number | null>(null);
    const raf2Ref = useRef<number | null>(null);

    const dataDisposableRef = useRef<{ dispose: () => void } | null>(null);
    const binaryDisposableRef = useRef<{ dispose: () => void } | null>(null);

    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);
    const prevFeedRef = useRef<TerminalChunk[]>([]);

    const onSendDataRef = useRef(onSendData);
    const onResizeRef = useRef(onResize);
    const onBeforeSubmitEnterRef = useRef(props.onBeforeSubmitEnter);
    const onAfterSubmitEnterRef = useRef(props.onAfterSubmitEnter);
    const inputQueueRef = useRef<Promise<void>>(Promise.resolve());

    inputReadyRef.current = inputEnabled && !disabled;

    useEffect(() => {
        onSendDataRef.current = onSendData;
    }, [onSendData]);

    useEffect(() => {
        onResizeRef.current = onResize;
    }, [onResize]);

    useEffect(() => {
        onBeforeSubmitEnterRef.current = props.onBeforeSubmitEnter;
    }, [props.onBeforeSubmitEnter]);

    useEffect(() => {
        onAfterSubmitEnterRef.current = props.onAfterSubmitEnter;
    }, [props.onAfterSubmitEnter]);

    const statusText = useMemo(
        () =>
            `${statusLabel(busy, inputEnabled)}${
                lastResult && !inputEnabled ? ` • ${fmtMeta(lastResult)}` : ""
            }`,
        [busy, inputEnabled, lastResult],
    );

    const scrollTerminalToBottom = useCallback(() => {
        const term = termRef.current;
        if (!term || !openedRef.current) return;

        try {
            term.scrollToBottom();
        } catch {}
    }, []);

    const focusTerminal = useCallback(() => {
        requestAnimationFrame(() => {
            const term = termRef.current;
            if (!term || !openedRef.current) return;

            try {
                term.focus();
            } catch {}
        });
    }, []);

    useEffect(() => {
        let cancelled = false;

        const doResize = () => {
            const host = hostRef.current;
            const probe = probeRef.current;
            const term = termRef.current;

            if (!host || !probe || !term || !openedRef.current) return;
            if (!isHostReady(host)) return;
            if (!term.element || !term.textarea) return;

            const rect = host.getBoundingClientRect();
            const cell = measureCell(probe);

            const horizontalPadding = 16;
            const verticalPadding = 24;

            const cols = Math.max(20, Math.floor((rect.width - horizontalPadding) / cell.width));
            const rows = Math.max(6, Math.floor((rect.height - verticalPadding) / cell.height) - 2);

            const prev = lastSizeRef.current;
            if (prev && prev.cols === cols && prev.rows === rows) return;

            lastSizeRef.current = { cols, rows };

            try {
                term.resize(cols, rows);
                onResizeRef.current(cols, rows);
                term.scrollToBottom();
            } catch {}
        };

        const scheduleResize = () => {
            if (resizeTimerRef.current != null) {
                window.clearTimeout(resizeTimerRef.current);
            }

            resizeTimerRef.current = window.setTimeout(() => {
                resizeTimerRef.current = null;
                doResize();
            }, 60);
        };

        const openTerminal = async () => {
            const mod: XTermModule = await import("xterm");
            if (cancelled) return;

            const { Terminal } = mod;

            const waitUntilVisible = () => {
                if (cancelled || openedRef.current) return;

                const el = hostRef.current;
                if (!isHostReady(el)) {
                    openTimerRef.current = window.setTimeout(waitUntilVisible, 80);
                    return;
                }

                raf1Ref.current = requestAnimationFrame(() => {
                    raf2Ref.current = requestAnimationFrame(() => {
                        if (cancelled || openedRef.current) return;

                        const node = hostRef.current;
                        if (!isHostReady(node)) {
                            openTimerRef.current = window.setTimeout(waitUntilVisible, 80);
                            return;
                        }

                        const term = new Terminal({
                            cols: 80,
                            rows: 24,
                            cursorBlink: inputReadyRef.current,
                            disableStdin: !inputReadyRef.current,
                            allowTransparency: true,
                            convertEol: true,
                            scrollback: 5000,
                            fontFamily:
                                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            fontSize: 12,
                            lineHeight: 1.35,
                            theme: getTheme(document.documentElement.classList.contains("dark")),
                        });

                        try {
                            term.open(node!);
                        } catch (err) {
                            console.error("xterm open failed", err);
                            try {
                                term.dispose();
                            } catch {}
                            return;
                        }

                        termRef.current = term;
                        openedRef.current = true;

                        term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
                            if (!inputReadyRef.current) return true;
                            if (ev.type === "keydown") {
                                ev.stopPropagation();
                            }
                            return true;
                        });

                        dataDisposableRef.current = term.onData((data) => {
                            if (!inputReadyRef.current) return;

                            const run = async () => {
                                const parts = splitInputByEnter(data);

                                for (const part of parts) {
                                    if (part.kind === "text") {
                                        onSendDataRef.current(part.value);
                                        continue;
                                    }

                                    await onBeforeSubmitEnterRef.current?.();
                                    onSendDataRef.current(part.value);
                                    await onAfterSubmitEnterRef.current?.();
                                }
                            };

                            inputQueueRef.current = inputQueueRef.current
                                .then(run)
                                .catch((err) => {
                                    console.error("xterm input dispatch failed", err);
                                });
                        });

                        binaryDisposableRef.current = term.onBinary((data) => {
                            if (!inputReadyRef.current) return;
                            onSendDataRef.current(data);
                        });

                        resizeObserverRef.current = new ResizeObserver(() => {
                            scheduleResize();
                        });
                        resizeObserverRef.current.observe(node!);

                        mutationObserverRef.current = new MutationObserver(() => {
                            const current = termRef.current;
                            if (!current) return;

                            current.options.theme = {
                                ...getTheme(document.documentElement.classList.contains("dark")),
                            };
                            scheduleResize();
                        });

                        mutationObserverRef.current.observe(document.documentElement, {
                            attributes: true,
                            attributeFilter: ["class"],
                        });

                        window.setTimeout(() => {
                            scheduleResize();
                            focusTerminal();
                        }, 0);
                    });
                });
            };

            waitUntilVisible();
        };

        void openTerminal();

        return () => {
            cancelled = true;

            dataDisposableRef.current?.dispose();
            dataDisposableRef.current = null;

            binaryDisposableRef.current?.dispose();
            binaryDisposableRef.current = null;

            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;

            mutationObserverRef.current?.disconnect();
            mutationObserverRef.current = null;

            if (resizeTimerRef.current != null) {
                window.clearTimeout(resizeTimerRef.current);
                resizeTimerRef.current = null;
            }

            if (openTimerRef.current != null) {
                window.clearTimeout(openTimerRef.current);
                openTimerRef.current = null;
            }

            if (raf1Ref.current != null) {
                cancelAnimationFrame(raf1Ref.current);
                raf1Ref.current = null;
            }

            if (raf2Ref.current != null) {
                cancelAnimationFrame(raf2Ref.current);
                raf2Ref.current = null;
            }

            openedRef.current = false;
            lastSizeRef.current = null;
            prevFeedRef.current = [];

            try {
                termRef.current?.dispose();
            } catch {}

            termRef.current = null;
        };
    }, [focusTerminal]);

    useEffect(() => {
        const term = termRef.current;
        const ready = inputEnabled && !disabled;
        inputReadyRef.current = ready;

        if (!term || !openedRef.current) return;

        term.options.cursorBlink = ready;
        term.options.disableStdin = !ready;

        if (ready) {
            scrollTerminalToBottom();
            focusTerminal();
        }
    }, [inputEnabled, disabled, focusTerminal, scrollTerminalToBottom]);

    useEffect(() => {
        const term = termRef.current;
        if (!term || !openedRef.current) return;

        if (terminalFeed.length === 0) {
            try {
                term.reset();
            } catch {
                try {
                    term.clear();
                } catch {}
            }

            prevFeedRef.current = [];
            return;
        }

        const prev = prevFeedRef.current;

        const isAppendOnly =
            prev.length <= terminalFeed.length &&
            prev.every((oldChunk, i) => {
                const nextChunk = terminalFeed[i];
                return (
                    !!nextChunk &&
                    nextChunk.id === oldChunk.id &&
                    nextChunk.kind === oldChunk.kind &&
                    nextChunk.data === oldChunk.data
                );
            });

        if (isAppendOnly) {
            for (let i = prev.length; i < terminalFeed.length; i++) {
                writeChunk(term, terminalFeed[i]);
            }
        } else {
            try {
                term.reset();
            } catch {
                try {
                    term.clear();
                } catch {}
            }

            for (const chunk of terminalFeed) {
                writeChunk(term, chunk);
            }
        }

        scrollTerminalToBottom();
        prevFeedRef.current = terminalFeed;
    }, [terminalFeed, scrollTerminalToBottom]);

    return (
        <div
            className={[
                "h-full border-t p-2 flex flex-col",
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
                data-testid="interactive-terminal-panel"
            >
                <div
                    ref={hostRef}
                    className="relative h-full min-h-0 w-full px-2 pb-2"
                    data-testid="interactive-terminal"
                    aria-label="Interactive terminal"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        focusTerminal();
                    }}
                />
            </div>

            <pre
                data-testid="interactive-terminal-transcript"
                aria-live="polite"
                className="sr-only"
            >
                {transcriptText}
            </pre>

            <span
                ref={probeRef}
                aria-hidden="true"
                className="pointer-events-none absolute -left-[9999px] -top-[9999px] whitespace-pre font-mono text-[12px] leading-[1.35]"
            >
                MMMMMMMMMM
            </span>
        </div>
    );
}
