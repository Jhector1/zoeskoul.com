"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import { withPreviewDocumentRevision } from "../previewDocumentUrl";

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

function otherFrame(index: FrameIndex): FrameIndex {
    return index === 0 ? 1 : 0;
}

export default function RemoteWebPreview(props: {
    preview: RemoteWebPreviewDescriptor;
}) {
    const { preview } = props;
    const [localRefresh, setLocalRefresh] = useState(0);
    // Changes the protected iframe document route without restarting Vite.
    const [directNavigationRevision, setDirectNavigationRevision] = useState(0);
    const [refreshPending, setRefreshPending] = useState(false);
    const [renderProblem, setRenderProblem] = useState<string | null>(null);
    const [navigationWarning, setNavigationWarning] = useState<string | null>(null);
    const [displayPath, setDisplayPath] = useState("/");
    const [routeSynced, setRouteSynced] = useState(false);
    const [pendingRoute, setPendingRoute] = useState<string | null>(null);
    const routeSyncedRef = useRef(false);
    const [canGoBack, setCanGoBack] = useState(false);
    const [canGoForward, setCanGoForward] = useState(false);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [pageSearch, setPageSearch] = useState("");
    const currentRouteRef = useRef("/");
    // Parent-owned route history is usable even if an injected bridge is absent.
    const routeHistoryRef = useRef<{routes: string[]; index: number}>({routes:["/"],index:0});
    const lastBaseRef = useRef(preview.src);
    const frameRefs = useRef<[HTMLIFrameElement | null, HTMLIFrameElement | null]>([null, null]);

    const iframeSrc = useMemo(() => {
        if (!preview.src) return null;
        const sameSession = lastBaseRef.current === preview.src;
        return withPreviewDocumentRevision(preview.src, preview.revision + localRefresh + directNavigationRevision,
            sameSession ? currentRouteRef.current : "/");
    }, [localRefresh, directNavigationRevision, preview.revision, preview.src]);

    useEffect(() => {
        lastBaseRef.current = preview.src;
        currentRouteRef.current = "/";
        routeHistoryRef.current = {routes:["/"],index:0};
        setDirectNavigationRevision(0);
        setDisplayPath("/");
        setRouteSynced(false);
        routeSyncedRef.current = false;
        setPendingRoute(null);
        setCanGoBack(false);
        setCanGoForward(false);
        setRefreshPending(false);
        setRenderProblem(null);
        setNavigationWarning(null);
    }, [preview.src]);

    const [frameSources, setFrameSources] = useState<
        [string | null, string | null]
    >([null, null]);
    const [activeFrame, setActiveFrame] = useState<FrameIndex | null>(null);

    const activeSrc = activeFrame === null ? null : frameSources[activeFrame];

    // The runner validates Vite's HTML root during preview/start. Do not issue a
    // second HEAD/GET to the browser proxy as a preflight: the dynamic Next.js
    // path and method can 404 even while the runner's Vite session is healthy.
    // Mount the protected document once; only a matching rendered bridge state
    // may promote the frame. A document failure remains local to this session.
    useEffect(() => {
        if (!iframeSrc) {
            if (activeFrame === null) setFrameSources([null, null]);
            return;
        }
        if (activeSrc === iframeSrc) return;
        setRenderProblem(null);
        setFrameSources(current => {
            const target: FrameIndex = activeFrame === null ? 0 : otherFrame(activeFrame);
            if (current[target] === iframeSrc) return current;
            const next: [string | null, string | null] = [...current];
            next[target] = iframeSrc;
            return next;
        });
    }, [activeFrame, activeSrc, iframeSrc]);

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
            if (value.channel !== NAV_CHANNEL) return;
            const expectedRevision = new URL(source, LOCAL_ORIGIN).searchParams.get("__zb_preview_revision");
            if (value.revision !== expectedRevision) return;
            if (value.type === "bootstrap") {
                // A bootstrap failure comes from the exact frame/revision but is
                // diagnostic only: it cannot promote a frame or assert a route.
                if (value.status === "failed" && typeof value.reason === "string" &&
                    ["script-missing", "configuration-missing", "script-address-invalid",
                     "document-root-invalid", "document-route-invalid", "document-route-restore-failed"].includes(value.reason) && source === iframeSrc) {
                    setNavigationWarning(`Preview navigation unavailable (${value.reason}).`);
                    if (value.reason === "document-route-restore-failed") {
                        // Diagnostic only; never treat a failed bridge as proof of a rendered page.
                        setRenderProblem("Browser refused to restore the sandboxed preview route. Check the browser Console.");
                    }
                }
                if (value.status === "installed" && value.basePath === preview.src && source === iframeSrc) {
                    setNavigationWarning(null);
                }
                return;
            }
            if (value.type !== "state" || value.basePath !== preview.src ||
                typeof value.rendered !== "boolean" || typeof value.canGoBack !== "boolean" ||
                typeof value.canGoForward !== "boolean") return;
            const route = safePreviewRoute(value.route);
            if (!route) return;
            const candidate = source === iframeSrc;
            // An old, still-visible frame must never overwrite a newer route request.
            if (!candidate) return;
            // Only a rendered React root can confirm the active document.
            if (!value.rendered) return;
            if (frameIndex !== activeFrame) activateFrame(frameIndex as FrameIndex, source);
            setRenderProblem(null);
            setNavigationWarning(null);
            rememberRoute(route);
            currentRouteRef.current = route;
            setDisplayPath(route);
            setRouteSynced(true);
            routeSyncedRef.current = true;
            setPendingRoute(current => current && current !== route ? current : null);
            // Parent route history includes picker navigation, which a newly
            // loaded iframe's own history cannot know about.
            setCanGoBack(routeHistoryRef.current.index > 0);
            setCanGoForward(routeHistoryRef.current.index < routeHistoryRef.current.routes.length - 1);
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
            setRenderProblem("Preview document did not confirm a rendered React page. Check Network and Console.");
            setRefreshPending(false);
        }, 15_000);
        return () => window.clearTimeout(timer);
    }, [activeSrc, frameSources, iframeSrc]);

    function rememberRoute(route: string) {
        const history = routeHistoryRef.current;
        if (history.routes[history.index] !== route) {
            history.routes = [...history.routes.slice(0, history.index + 1), route].slice(-40);
            history.index = history.routes.length - 1;
        }
        setCanGoBack(history.index > 0);
        setCanGoForward(history.index < history.routes.length - 1);
    }

    function navigateDocument(route: string, historyAction: "push" | "back" | "forward" = "push") {
        if (!preview.src || !projectRoutes.some(item => item.path === route)) return;
        if (historyAction === "push") rememberRoute(route);
        currentRouteRef.current = route;
        setPendingRoute(route);
        setDisplayPath(route); // known requested URL, not an iframe-render attestation
        routeSyncedRef.current = false;
        setRouteSynced(false);
        setNavigationWarning(null);
        setRenderProblem(null);
        setDirectNavigationRevision(value => value + 1);
    }

    function sendNavigation(action: "back" | "forward") {
        const history = routeHistoryRef.current;
        const nextIndex = history.index + (action === "back" ? -1 : 1);
        if (nextIndex < 0 || nextIndex >= history.routes.length) return;
        history.index = nextIndex;
        setCanGoBack(history.index > 0);
        setCanGoForward(history.index < history.routes.length - 1);
        // Navigate within the same isolated Vite session; no bridge ack required.
        navigateDocument(history.routes[nextIndex]!, action);
    }

    const projectRoutes = (preview.routes?.length ? preview.routes : [{path:"/",label:"Home"}])
        .filter(item => safePreviewRoute(item.path) === item.path);
    const availableRoutes = projectRoutes.filter(item =>
        !pageSearch.trim() || item.path.toLowerCase().includes(pageSearch.trim().toLowerCase()) ||
        item.label.toLowerCase().includes(pageSearch.trim().toLowerCase()));

    function openRoute(route: string) {
        if (!projectRoutes.some(item => item.path === route) || !preview.src || preview.state !== "ready") return;
        if (route !== currentRouteRef.current || activeFrame === null) navigateDocument(route);
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
        if (renderProblem && activeFrame === null) {
            setRenderProblem(null);
            setLocalRefresh(value => value + 1); // same Vite session
            return;
        }
        if (preview.state === "error") {
            preview.onRetry?.();
            return;
        }
        if (!iframeSrc || activeFrame === null) return;
        setRefreshPending(true);
        setLocalRefresh((value) => value + 1);
    }

    const statusLabel =
        navigationWarning ? "Route not verified" :
        renderProblem ? "Preview not rendered" :
        preview.state === "starting" ? "Starting preview…" :
        preview.state === "syncing" ? "Updating preview…" :
        preview.state === "error" ? "Preview unavailable" : "Live preview";
    const displayUrl = preview.src ? displayPath : statusLabel;
    const visibleUrl = preview.src
        ? pendingRoute ? `${pendingRoute} (opening…)` :
          (routeSynced || activeFrame !== null ? displayUrl : "Checking page…")
        : displayUrl;

    function onDocumentLoad(index: FrameIndex, src: string) {
        if (src !== iframeSrc) return;
        // An iframe load event also fires for HTTP error pages. It must never
        // promote a frame or claim React rendered; request a route attestation.
        frameRefs.current[index]?.contentWindow?.postMessage(
            {channel: NAV_CHANNEL, type: "command", action: "probe"}, "*");
    }

    function activateFrame(index: FrameIndex, src: string) {
        if (src !== iframeSrc) return;
        setActiveFrame(index);
        setRefreshPending(false);
        setCanGoBack(routeHistoryRef.current.index > 0);
        setCanGoForward(routeHistoryRef.current.index < routeHistoryRef.current.routes.length - 1);
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
                            onLoad={() => onDocumentLoad(index, src)}
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
                            {(renderProblem || (preview.state === "error" && preview.onRetry)) ? (
                                <button type="button" className="mt-3 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:text-white/75"
                                    onClick={refreshOrCancel}>{renderProblem ? "Retry document" : "Retry preview"}</button>
                            ) : null}
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );
}
