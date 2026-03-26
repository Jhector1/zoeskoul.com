"use client";

import React, {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import "xterm/css/xterm.css";
import type { RunResult } from "@/lib/code/types";
import type { TerminalChunk } from "../hooks/useCodeRunnerController";

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
    if (chunk.kind === "pty") {
        term.write(chunk.data);
        return;
    }

    if (chunk.kind === "err") {
        term.write(`\x1b[31m${chunk.data}\x1b[0m`);
        return;
    }

    term.write(`\x1b[90m${chunk.data}\x1b[0m`);
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
    const probeRef = useRef<HTMLSpanElement | null>(null);

    const termRef = useRef<XTerm | null>(null);
    const openedRef = useRef(false);
    const renderedCountRef = useRef(0);
    const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null);

    const resizeObserverRef = useRef<ResizeObserver | null>(null);
    const resizeTimerRef = useRef<number | null>(null);
    const openTimerRef = useRef<number | null>(null);
    const raf1Ref = useRef<number | null>(null);
    const raf2Ref = useRef<number | null>(null);
    const inputDisposableRef = useRef<{ dispose: () => void } | null>(null);

    const feedRef = useRef<TerminalChunk[]>(terminalFeed);
    const onSendDataRef = useRef(onSendData);
    const onResizeRef = useRef(onResize);
    const inputReadyRef = useRef(inputEnabled && !disabled);

    const [termCreated, setTermCreated] = useState(false);

    feedRef.current = terminalFeed;

    useEffect(() => {
        onSendDataRef.current = onSendData;
    }, [onSendData]);

    useEffect(() => {
        onResizeRef.current = onResize;
    }, [onResize]);

    useEffect(() => {
        inputReadyRef.current = inputEnabled && !disabled;
    }, [inputEnabled, disabled]);

    const statusText = useMemo(
        () =>
            `${statusLabel(busy, inputEnabled)}${
                lastResult && !inputEnabled ? ` • ${fmtMeta(lastResult)}` : ""
            }`,
        [busy, inputEnabled, lastResult],
    );

    const focusTerminal = useCallback(() => {
        if (!inputReadyRef.current) return;
        const term = termRef.current;
        if (!term || !openedRef.current) return;

        requestAnimationFrame(() => {
            try {
                term.focus();
            } catch {}
        });
    }, []);

    useEffect(() => {
        let cancelled = false;
        let created: XTerm | null = null;

        async function createTerminal() {
            const mod: XTermModule = await import("xterm");
            if (cancelled) return;

            const { Terminal } = mod;

            created = new Terminal({
                cols: 80,
                rows: 24,
                cursorBlink: false,
                disableStdin: true,
                allowTransparency: true,
                convertEol: false,
                scrollback: 5000,
                fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                fontSize: 12,
                lineHeight: 1.35,
                theme: getTheme(document.documentElement.classList.contains("dark")),
            });

            termRef.current = created;
            setTermCreated(true);
        }

        createTerminal();

        return () => {
            cancelled = true;
            setTermCreated(false);
            openedRef.current = false;
            renderedCountRef.current = 0;
            lastSizeRef.current = null;

            inputDisposableRef.current?.dispose();
            inputDisposableRef.current = null;

            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;

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

            try {
                created?.dispose();
            } catch {}

            termRef.current = null;
        };
    }, []);

    useLayoutEffect(() => {
        if (!termCreated) return;
        if (openedRef.current) return;

        let cancelled = false;
        const term = termRef.current;
        if (!term) return;

        const doResize = () => {
            const host = hostRef.current;
            const probe = probeRef.current;
            const current = termRef.current;

            if (!host || !current || !openedRef.current) return;
            if (!isHostReady(host)) return;
            if (!current.element || !current.textarea) return;

            const rect = host.getBoundingClientRect();
            const cell = measureCell(probe);

            const cols = Math.max(20, Math.floor((rect.width - 16) / cell.width));
            const rows = Math.max(8, Math.floor((rect.height - 8) / cell.height));

            const prev = lastSizeRef.current;
            if (prev && prev.cols === cols && prev.rows === rows) return;

            lastSizeRef.current = { cols, rows };

            try {
                current.resize(cols, rows);
                onResizeRef.current(cols, rows);
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

        const flushBacklog = () => {
            const current = termRef.current;
            if (!current || !openedRef.current) return;

            const feed = feedRef.current;
            if (feed.length === 0) {
                renderedCountRef.current = 0;
                return;
            }

            for (let i = renderedCountRef.current; i < feed.length; i++) {
                writeChunk(current, feed[i]);
            }

            renderedCountRef.current = feed.length;
        };

        const openWhenReady = () => {
            if (cancelled || openedRef.current) return;

            const host = hostRef.current;
            if (!isHostReady(host)) {
                openTimerRef.current = window.setTimeout(openWhenReady, 80);
                return;
            }

            raf1Ref.current = requestAnimationFrame(() => {
                raf2Ref.current = requestAnimationFrame(() => {
                    if (cancelled || openedRef.current) return;
                    const el = hostRef.current;
                    if (!isHostReady(el)) {
                        openTimerRef.current = window.setTimeout(openWhenReady, 80);
                        return;
                    }

                    try {
                        term.open(el!);
                    } catch (err) {
                        console.error("xterm open failed", err);
                        return;
                    }

                    openedRef.current = true;

                    inputDisposableRef.current = term.onData((data) => {
                        if (!inputReadyRef.current) return;
                        onSendDataRef.current(data);
                    });

                    resizeObserverRef.current = new ResizeObserver(() => {
                        scheduleResize();
                    });

                    resizeObserverRef.current.observe(el!);

                    window.setTimeout(() => {
                        scheduleResize();
                        flushBacklog();

                        if (inputReadyRef.current) {
                            focusTerminal();
                        }
                    }, 0);
                });
            });
        };

        openWhenReady();

        return () => {
            cancelled = true;

            inputDisposableRef.current?.dispose();
            inputDisposableRef.current = null;

            resizeObserverRef.current?.disconnect();
            resizeObserverRef.current = null;

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
        };
    }, [termCreated, focusTerminal]);

    useEffect(() => {
        const term = termRef.current;
        const ready = inputEnabled && !disabled;
        inputReadyRef.current = ready;

        if (!term || !openedRef.current) return;

        term.options.cursorBlink = ready;
        term.options.disableStdin = !ready;

        if (ready) {
            focusTerminal();
        }
    }, [inputEnabled, disabled, focusTerminal]);

    useEffect(() => {
        const term = termRef.current;
        if (!term || !openedRef.current) return;

        if (terminalFeed.length === 0) {
            if (renderedCountRef.current > 0) {
                try {
                    term.clear();
                } catch {}
            }
            renderedCountRef.current = 0;
            return;
        }

        if (terminalFeed.length <= renderedCountRef.current) return;

        for (let i = renderedCountRef.current; i < terminalFeed.length; i++) {
            writeChunk(term, terminalFeed[i]);
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
                    "mt-2 flex-1 min-h-[260px] overflow-hidden border-t py-2",
                    "bg-white/60 dark:bg-black/30",
                    "border-neutral-200 dark:border-white/10",
                ].join(" ")}
            >
                <div
                    ref={hostRef}
                    className="h-full w-full min-h-[240px] px-2"
                    aria-label="Interactive terminal"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        focusTerminal();
                    }}
                />
            </div>

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