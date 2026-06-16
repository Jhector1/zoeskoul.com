"use client";

import React, {
    useCallback,
    useEffect,
    useMemo,
    useRef,
} from "react";
import "xterm/css/xterm.css";
import type { RunResult } from "@/lib/code/types";
import type { TerminalChunk, TerminalRecoverState } from "@/components/code/runner/runtime";

type XTermModule = typeof import("xterm");
type XTerm = import("xterm").Terminal;

function fmtMeta(r: RunResult) {
    const time = r.time ? ` • ${r.time}s` : "";
    const mem = r.memory ? ` • ${Math.round((Number(r.memory) || 0) / 1024)}MB` : "";
    return `${r.status}${time}${mem}`;
}

function statusLabel(busy: boolean, interactiveReady: boolean) {
    if (interactiveReady) return "Interactive";
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

function isTypingKey(ev: KeyboardEvent) {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return false;
    if (ev.key.length === 1) return true;

    return (
        ev.key === "Enter" ||
        ev.key === "Backspace" ||
        ev.key === "Delete" ||
        ev.key === "Tab" ||
        ev.key.startsWith("Arrow")
    );
}

function terminalRecoveryText(state: TerminalRecoverState, message?: string | null) {
    if (state === "none") return null;
    if (state === "starting") return message ?? "Terminal is starting…";
    if (state === "blocked_too_many_sessions") {
        return (
            message ??
            "Too many terminal starts. Wait about one minute, then click Restart terminal once."
        );
    }
    return message ?? "Terminal session stopped. Restart the terminal to continue.";
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
    recoverState?: TerminalRecoverState;
    recoverMessage?: string | null;
    restarting?: boolean;
    interactiveReady?: boolean;
    captureInactiveInput?: boolean;
    onRestart?: () => void | Promise<void>;
    onInactiveInputAttempt?: () => void | Promise<void>;
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
    const recoverState = props.recoverState ?? "none";
    const recoverMessage = props.recoverMessage ?? null;
    const restarting = props.restarting === true;
    const interactiveReady = props.interactiveReady ?? (inputEnabled && !disabled);
    const captureInactiveInput = props.captureInactiveInput === true;
    const onRestart = props.onRestart;
    const onInactiveInputAttempt = props.onInactiveInputAttempt;
    const recoveryText = terminalRecoveryText(recoverState, recoverMessage);
    const canRestart =
        recoverState === "restart_available" ||
        recoverState === "blocked_too_many_sessions";
    const restartDisabled = disabled || restarting || !onRestart;

    const handleRestart = useCallback(() => {
        if (!canRestart || restartDisabled) return;
        void onRestart?.();
    }, [canRestart, restartDisabled, onRestart]);

    const transcriptText = useMemo(
        () => terminalFeed.map((chunk) => chunk.data ?? "").join(""),
        [terminalFeed],
    );

    const hostRef = useRef<HTMLDivElement | null>(null);
    const probeRef = useRef<HTMLSpanElement | null>(null);

    const termRef = useRef<XTerm | null>(null);
    const openedRef = useRef(false);
    const disposedRef = useRef(false);
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
    const onInactiveInputAttemptRef = useRef(onInactiveInputAttempt);
    const inputQueueRef = useRef<Promise<void>>(Promise.resolve());

    const isCurrentTerminalUsable = useCallback((term: XTerm | null): term is XTerm => {
        if (!term) return false;
        if (disposedRef.current) return false;
        if (!openedRef.current) return false;
        if (termRef.current !== term) return false;
        if (!term.element || !term.textarea) return false;
        if (!isHostReady(hostRef.current)) return false;
        return true;
    }, []);

    const reportInactiveInputAttempt = useCallback(() => {
        if (!captureInactiveInput) return;
        void onInactiveInputAttemptRef.current?.();
    }, [captureInactiveInput]);

    inputReadyRef.current = interactiveReady && !disabled;

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

    useEffect(() => {
        onInactiveInputAttemptRef.current = onInactiveInputAttempt;
    }, [onInactiveInputAttempt]);

    const statusText = useMemo(
        () =>
            `${statusLabel(busy, interactiveReady)}${
                lastResult && !inputEnabled ? ` • ${fmtMeta(lastResult)}` : ""
            }`,
        [busy, inputEnabled, interactiveReady, lastResult],
    );

    const scrollTerminalToBottom = useCallback(() => {
        const term = termRef.current;
        if (!isCurrentTerminalUsable(term)) return;

        try {
            term.scrollToBottom();
        } catch (err) {
            console.warn("xterm scroll skipped after stale terminal instance", err);
        }
    }, [isCurrentTerminalUsable]);

    const focusTerminal = useCallback(() => {
        requestAnimationFrame(() => {
            const term = termRef.current;
            if (!isCurrentTerminalUsable(term)) return;

            try {
                term.focus();
            } catch (err) {
                console.warn("xterm focus skipped after stale terminal instance", err);
            }
        });
    }, [isCurrentTerminalUsable]);

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
                const current = termRef.current;
                if (!isCurrentTerminalUsable(current) || current !== term) return;

                current.resize(cols, rows);
                onResizeRef.current(cols, rows);

                if (isCurrentTerminalUsable(current)) {
                    current.scrollToBottom();
                }
            } catch (err) {
                console.warn("xterm resize skipped after stale terminal instance", err);
            }
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
                        disposedRef.current = false;

                        term.attachCustomKeyEventHandler((ev: KeyboardEvent) => {
                            if (!inputReadyRef.current) {
                                if (
                                    captureInactiveInput &&
                                    ev.type === "keydown" &&
                                    isTypingKey(ev)
                                ) {
                                    ev.preventDefault();
                                    ev.stopPropagation();
                                    reportInactiveInputAttempt();
                                    return false;
                                }
                                return true;
                            }
                            if (ev.type === "keydown") {
                                ev.stopPropagation();
                            }
                            return true;
                        });

                        dataDisposableRef.current = term.onData((data) => {
                            if (!inputReadyRef.current) {
                                reportInactiveInputAttempt();
                                return;
                            }

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
                            if (!inputReadyRef.current) {
                                reportInactiveInputAttempt();
                                return;
                            }
                            onSendDataRef.current(data);
                        });

                        resizeObserverRef.current = new ResizeObserver(() => {
                            scheduleResize();
                        });
                        resizeObserverRef.current.observe(node!);

                        mutationObserverRef.current = new MutationObserver(() => {
                            const current = termRef.current;
                            if (!isCurrentTerminalUsable(current)) return;

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
            disposedRef.current = true;
            lastSizeRef.current = null;
            prevFeedRef.current = [];

            const termToDispose = termRef.current;
            termRef.current = null;

            /**
             * xterm may have an internal viewport refresh queued. Disposing in the
             * same turn as a React unmount/hide can leave that refresh touching
             * disposed render dimensions. Delay disposal one frame so queued xterm
             * work can settle before we tear down its renderer.
             */
            if (termToDispose) {
                window.setTimeout(() => {
                    try {
                        termToDispose.dispose();
                    } catch (err) {
                        console.warn("xterm dispose skipped after stale terminal instance", err);
                    }
                }, 0);
            }
        };
    }, [captureInactiveInput, focusTerminal, isCurrentTerminalUsable, reportInactiveInputAttempt]);

    useEffect(() => {
        const term = termRef.current;
        const ready = interactiveReady && !disabled;
        inputReadyRef.current = ready;

        if (!isCurrentTerminalUsable(term)) return;

        term.options.cursorBlink = ready;
        term.options.disableStdin = !ready;

        if (ready) {
            scrollTerminalToBottom();
            focusTerminal();
        }
    }, [interactiveReady, disabled, focusTerminal, scrollTerminalToBottom, isCurrentTerminalUsable]);

    useEffect(() => {
        const term = termRef.current;

        if (!isCurrentTerminalUsable(term)) {
            prevFeedRef.current = terminalFeed;
            return;
        }

        /**
         * Avoid term.reset()/term.clear() here. xterm can still have a viewport
         * refresh queued while React is hiding/remounting this panel; reset/clear
         * during that window is what commonly causes the internal
         * "Cannot read properties of undefined (reading 'dimensions')" crash.
         */
        if (terminalFeed.length === 0) {
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

        try {
            if (isAppendOnly) {
                for (let i = prev.length; i < terminalFeed.length; i++) {
                    const current = termRef.current;
                    if (!isCurrentTerminalUsable(current) || current !== term) return;
                    writeChunk(current, terminalFeed[i]);
                }
            } else {
                term.write("\r\n");

                for (const chunk of terminalFeed) {
                    const current = termRef.current;
                    if (!isCurrentTerminalUsable(current) || current !== term) return;
                    writeChunk(current, chunk);
                }
            }

            if (isCurrentTerminalUsable(term)) {
                scrollTerminalToBottom();
            }

            prevFeedRef.current = terminalFeed;
        } catch (err) {
            console.warn("xterm feed write skipped after stale terminal instance", err);
        }
    }, [terminalFeed, scrollTerminalToBottom, isCurrentTerminalUsable]);

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
                    "mt-2 flex min-h-0 flex-1 flex-col overflow-hidden border-t py-2",
                    "bg-white/60 dark:bg-black/30",
                    "border-neutral-200 dark:border-white/10",
                ].join(" ")}
                data-testid="interactive-terminal-panel"
            >
                {recoveryText ? (
                    <div
                        className={[
                            "mx-2 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2",
                            recoverState === "blocked_too_many_sessions"
                                ? "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100"
                                : "border-red-200 bg-red-50 text-red-950 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-100",
                        ].join(" ")}
                        data-testid="interactive-terminal-recovery"
                    >
                        <div className="min-w-0 flex-1 text-xs font-semibold">
                            {recoveryText}
                        </div>

                        {canRestart ? (
                            <button
                                type="button"
                                onClick={handleRestart}
                                disabled={restartDisabled}
                                className={[
                                    "inline-flex h-8 items-center justify-center rounded-md border px-3 text-xs font-extrabold transition-colors",
                                    restartDisabled
                                        ? "cursor-not-allowed border-neutral-200 bg-neutral-100 text-neutral-400 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/30"
                                        : "border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-50 dark:border-white/15 dark:bg-white/[0.08] dark:text-white/90 dark:hover:bg-white/[0.12]",
                                ].join(" ")}
                                aria-label="Restart terminal"
                            >
                                {restarting ? "Restarting…" : "Restart terminal"}
                            </button>
                        ) : null}
                    </div>
                ) : null}

                <div
                    ref={hostRef}
                    className="relative min-h-0 w-full flex-1 px-2 pb-2"
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
