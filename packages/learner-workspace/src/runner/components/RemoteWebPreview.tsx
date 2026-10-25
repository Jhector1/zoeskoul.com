"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";

type FrameIndex = 0 | 1;
const NAV_CHANNEL = "zoebuild.preview.navigation.v1";
const LOCAL_ORIGIN = "https://preview.invalid";

/** Only accept routes relative to this preview's own opaque content root. */
function safePreviewRoute(input: unknown): string | null {
    if (typeof input !== "string" || input.length > 2048 ||
        !input.startsWith("/") || input.startsWith("//") ||
        /[\\\u0000-\u001f\u007f]/.test(input) ||
        /%(?:2e|2f|5c)/i.test(input)) return null;
    try {
        const route = new URL(input, LOCAL_ORIGIN);
        if (route.origin !== LOCAL_ORIGIN) return null;
        route.searchParams.delete("__zb_preview_revision");
        return `${route.pathname}${route.search}${route.hash}`;
    } catch {
        return null;
    }
}

function withRevision(src: string, revision: number, routePath: string) {
    const base = new URL(src, LOCAL_ORIGIN);
    const route = new URL(safePreviewRoute(routePath) ?? "/", LOCAL_ORIGIN);
    const root = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
    // The router is sandboxed: no bare /approach host navigation or runner origin.
    base.pathname = `${root}${route.pathname.slice(1)}`;
    base.search = route.search;
    base.searchParams.set("__zb_preview_revision", String(revision));
    base.hash = route.hash;
    return `${base.pathname}${base.search}${base.hash}`;
}

function otherFrame(index: FrameIndex): FrameIndex {
    return index === 0 ? 1 : 0;
}

export default function RemoteWebPreview(props: {
    preview: RemoteWebPreviewDescriptor;
}) {
    const { preview } = props;
    const [localRefresh, setLocalRefresh] = useState(0);
    const [refreshPending, setRefreshPending] = useState(false);
    const [renderProblem, setRenderProblem] = useState<string | null>(null);
    const [displayPath, setDisplayPath] = useState("/");
    const [routeSynced, setRouteSynced] = useState(false);
    const [pendingRoute, setPendingRoute] = useState<string | null>(null);
    const routeSyncedRef = useRef(false);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pageSearch, setPageSearch] = useState("");
    const currentRouteRef = useRef("/");
    const lastBaseRef = useRef(preview.src);
    const frameRefs = useRef<[HTMLIFrameElement | null, HTMLIFrameElement | null]>([null, null]);

    const iframeSrc = useMemo(() => {
        if (!preview.src) return null;
        const sameSession = lastBaseRef.current === preview.src;
        return withRevision(preview.src, preview.revision + localRefresh,
            sameSession ? currentRouteRef.current : "/");
    }, [localRefresh, preview.revision, preview.src]);

    useEffect(() => {
        lastBaseRef.current = preview.src;
        currentRouteRef.current = "/";
        setDisplayPath("/");
        setRouteSynced(false);
        routeSyncedRef.current = false;
        setPendingRoute(null);
        setCanGoBack(false);
        setCanGoForward(false);
        setRefreshPending(false);
        setRenderProblem(null);
    }, [preview.src]);

    const [frameSources, setFrameSources] = useState<
        [string | null, string | null]
    >([null, null]);
    const [activeFrame, setActiveFrame] = useState<FrameIndex | null>(null);
    const expiredCandidateRef = useRef<string | null>(null);

    const activeSrc = activeFrame === null ? null : frameSources[activeFrame];

    useEffect(() => {
        if (!iframeSrc) {
            if (activeFrame === null) setFrameSources([null, null]);
            return;
        }
        if (activeSrc === iframeSrc) return;
        const controller = new AbortController();
        let cancelled = false;
        void (async () => {
            try {
                // Probe without downloading the HTML twice. The iframe loads it once.
                // An older proxy that does not support HEAD can still use GET.
                const request = (method: "HEAD" | "GET") => fetch(iframeSrc, {
                    method, credentials: "same-origin", cache: "no-store",
                    signal: controller.signal,
                });
                let response = await request("HEAD");
                if (response.status === 405 || response.status === 501) response = await request("GET");
                if (cancelled) return;
                if (!response.ok) {
                    if (response.status === 404 &&
                        expiredCandidateRef.current !== iframeSrc) {
                        expiredCandidateRef.current = iframeSrc;
                        preview.onRetry?.();
                    }
                    setRefreshPending(false);
                    return;
                }
                const contentType = response.headers.get("content-type") ?? "";
                if (!/^text\/html(?:\s*;|$)/i.test(contentType)) {
                    setRefreshPending(false);
                    return;
                }
                expiredCandidateRef.current = null;
                setFrameSources((current) => {
                    const target: FrameIndex = activeFrame === null ? 0 : otherFrame(activeFrame);
                    if (current[target] === iframeSrc) return current;
                    const next: [string | null, string | null] = [...current];
                    next[target] = iframeSrc;
                    return next;
                });
            } catch (error) {
                if (cancelled || (error instanceof DOMException && error.name === "AbortError")) return;
                setRefreshPending(false);
            }
        })();
        return () => { cancelled = true; controller.abort(); };
    }, [activeFrame, activeSrc, iframeSrc, preview.onRetry]);

    // A sandboxed iframe is never granted same-origin access. Frame promotion
    // requires a live DOM-ready attestation from the exact active revision.
    useEffect(() => {
        function onMessage(event: MessageEvent) {
            if (event.origin !== "null" || !preview.src) return;
            const frameIndex = frameRefs.current.findIndex(frame =>
                frame?.contentWindow === event.source);
            if (frameIndex < 0) return;
            const source = frameSources[frameIndex];
            if (!source) return;
            const data: unknown = event.data;
            if (!data || typeof data !== "object" || Array.isArray(data)) return;
            const value = data as Record<string, unknown>;
            if (value.channel !== NAV_CHANNEL || value.type !== "state" ||
                value.basePath !== preview.src || typeof value.rendered !== "boolean" ||
                typeof value.canGoBack !== "boolean" || typeof value.canGoForward !== "boolean") return;
            const expectedRevision = new URL(source, LOCAL_ORIGIN).searchParams.get("__zb_preview_revision");
            if (value.revision !== expectedRevision) return;
            const route = safePreviewRoute(value.route);
            if (!route) return;
            const candidate = source === iframeSrc;
            if (frameIndex !== activeFrame && (!candidate || !value.rendered)) return;
            if (frameIndex !== activeFrame && candidate) activateFrame(frameIndex as FrameIndex, source);
            setRenderProblem(null);
            currentRouteRef.current = route;
            setDisplayPath(route);
            setRouteSynced(true);
            routeSyncedRef.current = true;
            setPendingRoute(current => current && current !== route ? current : null);
            setCanGoBack(value.canGoBack);
            setCanGoForward(value.canGoForward);
        }
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [activeFrame, frameSources, iframeSrc, preview.src]);

    // Probe the staging iframe after loading, and again on a bounded cadence.
    // The iframe stays hidden until its React root has actually rendered.
    useEffect(() => {
        if (!iframeSrc) return;
        const candidates = frameSources.map((source, index) =>
            source === iframeSrc ? index as FrameIndex : null).filter((value): value is FrameIndex => value !== null);
        if (!candidates.length) return;
        let remaining = 25;
        const probe = () => {
            for (const index of candidates) frameRefs.current[index]?.contentWindow?.postMessage(
                {channel: NAV_CHANNEL, type: "command", action: "probe"}, "*");
        };
        probe();
        const timer = window.setInterval(() => {
            if (activeSrc === iframeSrc || --remaining <= 0) {window.clearInterval(timer);return;}
            probe();
        }, 400);
        return () => window.clearInterval(timer);
    }, [activeSrc, frameSources, iframeSrc]);

    // An HTML load event alone is not evidence that React rendered. Avoid a
    // permanently blank preview or silently promoting an error page.
    useEffect(() => {
        if (!iframeSrc || activeSrc === iframeSrc || !frameSources.includes(iframeSrc)) return;
        setRenderProblem(null);
        const timer = window.setTimeout(() => {
            setRenderProblem("Preview loaded HTML but React did not render. Check the project console.");
            setRefreshPending(false);
        }, 15_000);
        return () => window.clearTimeout(timer);
    }, [activeSrc, frameSources, iframeSrc]);

    function sendNavigation(action: "back" | "forward") {
        if (activeFrame === null || (action === "back" ? !canGoBack : !canGoForward)) return;
        frameRefs.current[activeFrame]?.contentWindow?.postMessage(
            {channel: NAV_CHANNEL, type: "command", action}, "*");
    }

    const projectRoutes = (preview.routes?.length ? preview.routes : [{path:"/",label:"Home"}])
        .filter(item => safePreviewRoute(item.path) === item.path);
    const availableRoutes = projectRoutes.filter(item =>
        !pageSearch.trim() || item.path.toLowerCase().includes(pageSearch.trim().toLowerCase()) ||
        item.label.toLowerCase().includes(pageSearch.trim().toLowerCase()));

    function openRoute(route: string) {
        if (!projectRoutes.some(item => item.path === route) || activeFrame === null || preview.state !== "ready") return;
        routeSyncedRef.current = false;
        setRouteSynced(false);
        setPendingRoute(route);
        frameRefs.current[activeFrame]?.contentWindow?.postMessage(
            {channel:NAV_CHANNEL,type:"command",action:"navigate",route}, "*");
        setPickerOpen(false);
        setPageSearch("");
    }

    useEffect(() => {
        if (!pendingRoute) return;
        const timer = window.setTimeout(() => setPendingRoute(null), 6000);
        return () => window.clearTimeout(timer);
    }, [pendingRoute]);

    function refreshOrCancel() {
        if (refreshPending) {
            // Restoring the prior revision aborts the pending preflight and
            // keeps the last visible iframe intact. It does NOT stop Vite.
            setLocalRefresh((value) => Math.max(0, value - 1));
            // Unmount the hidden loading iframe as well as aborting its preflight.
            // The active, previously loaded frame remains mounted and visible.
            if (activeFrame !== null) {
                const pendingFrame = otherFrame(activeFrame);
                setFrameSources((current) => {
                    if (current[pendingFrame] === null) return current;
                    const next: [string | null, string | null] = [...current];
                    next[pendingFrame] = null;
                    return next;
                });
            }
            setRefreshPending(false);
            return;
        }
        if (preview.state === "error" || (renderProblem && activeFrame === null)) {
            setRenderProblem(null);
            preview.onRetry?.();
            return;
        }
        if (!iframeSrc || activeFrame === null) return;
        setRefreshPending(true);
        setLocalRefresh((value) => value + 1);
    }

    const statusLabel =
        renderProblem ? "Preview not rendered" :
        preview.state === "starting" ? "Starting preview…" :
        preview.state === "syncing" ? "Updating preview…" :
        preview.state === "error" ? "Preview unavailable" : "Live preview";
    const displayUrl = preview.src ? displayPath : statusLabel;
    const visibleUrl = preview.src
        ? pendingRoute ? `${pendingRoute} (opening…)` : routeSynced ? displayUrl : "Checking page…"
        : displayUrl;

    function activateFrame(index: FrameIndex, src: string) {
        if (src !== iframeSrc) return;
        setActiveFrame(index);
        setRefreshPending(false);
        setCanGoBack(false);
        setCanGoForward(false);
        setFrameSources((current) => {
            if (current[index] !== src) return current;
            const previous = otherFrame(index);
            if (current[previous] === null) return current;
            const next: [string | null, string | null] = [...current];
            next[previous] = null;
            return next;
        });
    }

    const showStatusSurface = preview.state === "error" || activeFrame === null;
    const buttonClass = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-bold text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70 dark:hover:bg-neutral-800";

    return (
        <div className="flex h-full min-h-0 flex-col bg-white dark:bg-black/40"
            data-remote-web-preview data-preview-state={preview.state}>
            <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-white/10 dark:bg-neutral-950">
                <button type="button" aria-label="Preview back" title="Back"
                    onClick={() => sendNavigation("back")}
                    disabled={!canGoBack || preview.state === "error"}
                    className={buttonClass}>←</button>
                <button type="button" aria-label="Preview forward" title="Forward"
                    onClick={() => sendNavigation("forward")}
                    disabled={!canGoForward || preview.state === "error"}
                    className={buttonClass}>→</button>
                <button type="button"
                    aria-label={refreshPending ? "Cancel preview refresh" :
                        preview.state === "error" ? "Retry browser preview" : "Refresh browser preview"}
                    title={refreshPending ? "Cancel refresh" : preview.state === "error" ? "Retry" : "Refresh"}
                    onClick={refreshOrCancel}
                    disabled={!refreshPending && !iframeSrc && preview.state !== "error" && !renderProblem}
                    className={buttonClass}>
                    {refreshPending ? "×" : "↻"}
                </button>
                <div className="relative min-w-0 flex-1" onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPickerOpen(false);
                }}>
                    <input aria-label="Preview URL" role="combobox" aria-expanded={pickerOpen}
                        aria-controls="zoebuild-preview-pages" aria-autocomplete="list"
                        value={pickerOpen ? pageSearch : visibleUrl}
                        placeholder={pickerOpen ? "Find a page…" : undefined}
                        onFocus={() => {setPageSearch("");setPickerOpen(true);}}
                        onClick={() => {setPageSearch("");setPickerOpen(true);}}
                        onChange={event => setPageSearch(event.target.value.slice(0,120))}
                        onKeyDown={event => {
                            if (event.key === "Escape") {event.preventDefault();setPickerOpen(false);}
                            if (event.key === "Enter" && availableRoutes.length) {
                                event.preventDefault();openRoute(availableRoutes[0]!.path);
                            }
                        }}
                        data-testid="remote-web-preview-url"
                        className="w-full truncate rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px] text-neutral-600 outline-none dark:border-white/10 dark:bg-neutral-900 dark:text-white/70" />
                    {pickerOpen && <div id="zoebuild-preview-pages" role="listbox"
                        aria-label="Available project pages"
                        className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-lg border border-neutral-200 bg-white p-1 shadow-lg dark:border-white/20 dark:bg-neutral-900">
                        {availableRoutes.length === 0 && <div className="px-3 py-2 text-xs text-neutral-500">No matching pages</div>}
                        {availableRoutes.map(item => <button key={item.path} type="button" role="option"
                            aria-selected={displayPath === item.path} disabled={preview.state !== "ready" || activeFrame === null}
                            onMouseDown={event => event.preventDefault()}
                            onClick={() => openRoute(item.path)}
                            className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:text-white/80 dark:hover:bg-neutral-800">
                            <span><span className="mr-2 inline-block w-4">{displayPath === item.path ? "✓" : ""}</span>{item.path}</span>
                            <span className="truncate text-neutral-400">{item.label}</span>
                        </button>)}
                        {(preview.state !== "ready" || activeFrame === null) &&
                            <div className="px-3 py-2 text-[11px] text-neutral-500">Start Preview to open a page.</div>}
                    </div>}
                </div>
                <span className="shrink-0 text-[11px] font-semibold text-neutral-500 dark:text-white/55"
                    aria-live="polite">{statusLabel}</span>
            </div>
            <div className="relative min-h-0 flex-1 overflow-hidden bg-white">
                {frameSources.map((src, rawIndex) => {
                    if (!src) return null;
                    const index = rawIndex as FrameIndex;
                    const isActive = preview.state !== "error" && index === activeFrame;
                    return (
                        <iframe key={index} title={preview.title ?? "Web preview"} src={src}
                            ref={(node) => { frameRefs.current[index] = node; }}
                            sandbox="allow-scripts allow-forms allow-modals"
                            data-remote-web-preview-frame
                            data-preview-frame-active={isActive ? "true" : "false"}
                            aria-hidden={!isActive}
                            onLoad={() => activateFrame(index, src)}
                            className={["absolute inset-0 h-full w-full border-0 bg-white",
                                isActive ? "z-10 opacity-100" : "pointer-events-none z-0 opacity-0"].join(" ")}
                            style={{colorScheme:"light",backgroundColor:"#ffffff"}} />
                    );
                })}
                {showStatusSurface ? (
                    <div className="absolute inset-0 z-20 flex h-full min-h-[240px] items-center justify-center bg-white p-6 text-center dark:bg-black/30"
                        role={preview.state === "error" ? "alert" : "status"}>
                        <div className="max-w-md">
                            <strong className="block text-sm text-neutral-800 dark:text-white/85">{statusLabel}</strong>
                            {(renderProblem || preview.message) ? <p className="mt-2 text-xs leading-5 text-neutral-500 dark:text-white/55">{renderProblem || preview.message}</p> : null}
                            {(preview.state === "error" || renderProblem) && preview.onRetry ? (
                                <button type="button" className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/75"
                                    onClick={() => preview.onRetry?.()}>Retry preview</button>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
