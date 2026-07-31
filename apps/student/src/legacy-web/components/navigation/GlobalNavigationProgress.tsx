"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

export const GLOBAL_NAVIGATION_PENDING_EVENT = "zoeskoul:navigation-pending";
export const GLOBAL_NAVIGATION_IDLE_EVENT = "zoeskoul:navigation-idle";

type PendingNavigationDetail = {
    label?: string;
    description?: string;
    source?: string;
    targetHref?: string;
    minVisibleMs?: number;
};

type PendingState = {
    pending: boolean;
    visible: boolean;
    label: string;
    description?: string;
    source: string;
    targetHref?: string;
    startHref: string;
    startedAt: number;
    minVisibleMs: number;
};

const DEFAULT_LABEL = "Loading…";
const DEFAULT_MIN_VISIBLE_MS = 350;
const SHOW_DELAY_MS = 140;
const DEFAULT_SAFETY_TIMEOUT_MS = 18_000;
const LOGOUT_SAFETY_TIMEOUT_MS = 30_000;

type TimeoutHandle = number;
type IntervalHandle = number;
type TimerRef<T> = React.RefObject<T | null>;

function currentHref() {
    if (typeof window === "undefined") return "";
    return window.location.href;
}

function readEventDetail(event: Event): PendingNavigationDetail {
    if (!("detail" in event)) return {};
    const detail = (event as CustomEvent<PendingNavigationDetail>).detail;
    return detail && typeof detail === "object" ? detail : {};
}

function isPlainPrimaryClick(event: MouseEvent) {
    return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
}

function closestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
    if (!(target instanceof Element)) return null;
    return target.closest("a[href]");
}

function shouldStartForAnchor(anchor: HTMLAnchorElement, event: MouseEvent) {
    if (event.defaultPrevented || !isPlainPrimaryClick(event)) return false;
    if (anchor.dataset.noGlobalLoader === "true") return false;
    if (anchor.getAttribute("aria-disabled") === "true") return false;
    if (anchor.hasAttribute("download")) return false;

    const target = anchor.getAttribute("target");
    if (target && target !== "_self") return false;

    const rawHref = anchor.getAttribute("href") ?? "";
    const lowerHref = rawHref.trim().toLowerCase();
    if (!lowerHref || lowerHref.startsWith("#")) return false;
    if (
        lowerHref.startsWith("mailto:") ||
        lowerHref.startsWith("tel:") ||
        lowerHref.startsWith("javascript:") ||
        lowerHref.startsWith("blob:") ||
        lowerHref.startsWith("data:")
    ) {
        return false;
    }

    let nextUrl: URL;
    let currentUrl: URL;
    try {
        nextUrl = new URL(anchor.href, window.location.href);
        currentUrl = new URL(window.location.href);
    } catch {
        return true;
    }

    const samePathAndQuery =
        nextUrl.origin === currentUrl.origin &&
        nextUrl.pathname === currentUrl.pathname &&
        nextUrl.search === currentUrl.search;

    if (samePathAndQuery && nextUrl.hash) return false;
    if (nextUrl.href === currentUrl.href) return false;

    return true;
}

export function startGlobalNavigationPending(detail: PendingNavigationDetail = {}) {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(GLOBAL_NAVIGATION_PENDING_EVENT, { detail }));
}

export function stopGlobalNavigationPending() {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(GLOBAL_NAVIGATION_IDLE_EVENT));
}

export function GlobalNavigationProgress() {
    const pathname = usePathname();
    const [state, setState] = React.useState<PendingState>(() => ({
        pending: false,
        visible: false,
        label: DEFAULT_LABEL,
        source: "idle",
        startHref: currentHref(),
        startedAt: 0,
        minVisibleMs: DEFAULT_MIN_VISIBLE_MS,
    }));

    const stateRef = React.useRef(state);
    const showTimerRef = React.useRef<TimeoutHandle | null>(null);
    const stopTimerRef = React.useRef<TimeoutHandle | null>(null);
    const safetyTimerRef = React.useRef<TimeoutHandle | null>(null);
    const hrefPollTimerRef = React.useRef<IntervalHandle | null>(null);

    React.useEffect(() => {
        stateRef.current = state;
    }, [state]);

    const clearTimer = React.useCallback((timerRef: TimerRef<TimeoutHandle>) => {
        if (timerRef.current === null) return;
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
    }, []);

    const clearIntervalTimer = React.useCallback((timerRef: TimerRef<IntervalHandle>) => {
        if (timerRef.current === null) return;
        window.clearInterval(timerRef.current);
        timerRef.current = null;
    }, []);

    const clearAllTimers = React.useCallback(() => {
        clearTimer(showTimerRef);
        clearTimer(stopTimerRef);
        clearTimer(safetyTimerRef);
        clearIntervalTimer(hrefPollTimerRef);
    }, [clearIntervalTimer, clearTimer]);

    const stopAfterMinimum = React.useCallback(() => {
        const current = stateRef.current;
        if (!current.pending) return;

        clearTimer(showTimerRef);
        clearTimer(stopTimerRef);
        clearTimer(safetyTimerRef);
        clearIntervalTimer(hrefPollTimerRef);

        const elapsed = Date.now() - current.startedAt;
        const wait = Math.max(0, current.minVisibleMs - elapsed);

        stopTimerRef.current = window.setTimeout(() => {
            setState((prev) => ({
                ...prev,
                pending: false,
                visible: false,
                source: "idle",
                description: undefined,
                targetHref: undefined,
            }));
            stopTimerRef.current = null;
        }, wait);
    }, [clearIntervalTimer, clearTimer]);

    const beginPending = React.useCallback(
        (detail: PendingNavigationDetail = {}) => {
            clearAllTimers();

            const nextState: PendingState = {
                pending: true,
                visible: false,
                label: detail.label || DEFAULT_LABEL,
                description: detail.description,
                source: detail.source || "navigation",
                targetHref: detail.targetHref,
                startHref: currentHref(),
                startedAt: Date.now(),
                minVisibleMs: Math.max(0, detail.minVisibleMs ?? DEFAULT_MIN_VISIBLE_MS),
            };

            stateRef.current = nextState;
            setState(nextState);

            showTimerRef.current = window.setTimeout(() => {
                setState((prev) => (prev.pending ? { ...prev, visible: true } : prev));
                showTimerRef.current = null;
            }, SHOW_DELAY_MS);

            const safetyMs = detail.source === "logout" ? LOGOUT_SAFETY_TIMEOUT_MS : DEFAULT_SAFETY_TIMEOUT_MS;
            safetyTimerRef.current = window.setTimeout(() => {
                stopAfterMinimum();
            }, safetyMs);

            hrefPollTimerRef.current = window.setInterval(() => {
                const current = stateRef.current;
                if (!current.pending) return;
                if (currentHref() !== current.startHref) {
                    stopAfterMinimum();
                }
            }, 250);
        },
        [clearAllTimers, stopAfterMinimum],
    );

    React.useEffect(() => {
        return () => clearAllTimers();
    }, [clearAllTimers]);

    React.useEffect(() => {
        stopAfterMinimum();
    }, [pathname, stopAfterMinimum]);

    React.useEffect(() => {
        const onStart = (event: Event) => beginPending(readEventDetail(event));
        const onStop = () => stopAfterMinimum();

        const onClickCapture = (event: MouseEvent) => {
            const anchor = closestAnchor(event.target);
            if (!anchor) return;
            if (!shouldStartForAnchor(anchor, event)) return;

            beginPending({
                label: anchor.dataset.globalLoaderLabel || DEFAULT_LABEL,
                source: "link",
                targetHref: anchor.href,
            });
        };

        const onSubmitCapture = (event: SubmitEvent) => {
            const form = event.target instanceof HTMLFormElement ? event.target : null;
            if (!form) return;
            if (form.dataset.noGlobalLoader === "true") return;
            if (event.defaultPrevented) return;

            beginPending({
                label: form.dataset.globalLoaderLabel || DEFAULT_LABEL,
                source: "form",
                minVisibleMs: 500,
            });
        };

        const onPopState = () => {
            beginPending({ label: DEFAULT_LABEL, source: "history", minVisibleMs: 250 });
        };

        const onPageShow = () => stopAfterMinimum();
        const onPageHide = () => stopAfterMinimum();

        window.addEventListener(GLOBAL_NAVIGATION_PENDING_EVENT, onStart);
        window.addEventListener(GLOBAL_NAVIGATION_IDLE_EVENT, onStop);
        window.addEventListener("popstate", onPopState);
        window.addEventListener("pageshow", onPageShow);
        window.addEventListener("pagehide", onPageHide);
        document.addEventListener("click", onClickCapture, true);
        document.addEventListener("submit", onSubmitCapture, true);

        return () => {
            window.removeEventListener(GLOBAL_NAVIGATION_PENDING_EVENT, onStart);
            window.removeEventListener(GLOBAL_NAVIGATION_IDLE_EVENT, onStop);
            window.removeEventListener("popstate", onPopState);
            window.removeEventListener("pageshow", onPageShow);
            window.removeEventListener("pagehide", onPageHide);
            document.removeEventListener("click", onClickCapture, true);
            document.removeEventListener("submit", onSubmitCapture, true);
        };
    }, [beginPending, stopAfterMinimum]);

    if (!state.pending || !state.visible) return null;

    return (
        <div
            aria-live="polite"
            aria-busy="true"
            className="pointer-events-none fixed inset-x-0 top-0 z-[2147483647]"
            data-global-navigation-progress="true"
        >
            <div className="h-1 overflow-hidden bg-neutral-900/5 dark:bg-white/10">
                <div className="app-global-navigation-progress-bar h-full w-1/3 rounded-full bg-neutral-950/80 shadow-[0_0_24px_rgba(10,10,10,0.35)] dark:bg-white/90 dark:shadow-[0_0_24px_rgba(255,255,255,0.25)]" />
            </div>

            <div className="absolute left-1/2 top-3 w-[min(calc(100vw-1.5rem),22rem)] -translate-x-1/2 sm:top-4">
                <div
                    role="status"
                    className={cn(
                        "app-global-navigation-toast flex w-full items-center justify-center gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md",
                        "border-neutral-200/80 bg-white/92 text-neutral-900",
                        "dark:border-white/12 dark:bg-neutral-950/88 dark:text-white",
                    )}
                >
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-100 dark:bg-white/10">
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-neutral-900/80 border-r-transparent dark:border-white/85 dark:border-r-transparent" />
                    </span>
                    <span className="min-w-0 text-center leading-tight">
                        <span className="block truncate text-sm font-semibold tracking-[-0.01em]">{state.label}</span>
                        {state.description ? (
                            <span className="block max-w-[18rem] truncate text-xs text-neutral-500 dark:text-white/55">
                                {state.description}
                            </span>
                        ) : null}
                    </span>
                </div>
            </div>
        </div>
    );
}
