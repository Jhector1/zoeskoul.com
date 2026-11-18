"use client";

import {useEffect, useRef, useState} from "react";
import type {RemoteWebPreviewDescriptor} from "@zoeskoul/learner-workspace/runner/remotePreview";
import {
  developmentPreviewDocumentUrl, isTrustedDevelopmentPreviewRoot,
} from "@/lib/build/reactDevelopmentPreviewDocumentRoot";

type Delivery = "loading" | "delivered" | "unavailable";
const ROOT_ROUTE = "/";
const VALID_PAGE = /^\/(?:[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*)?$/;
const buttonClass = "inline-flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 bg-white text-sm font-bold text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70";

/**
 * ZoeBuild development-only document viewer. Unlike RemoteWebPreview, this
 * accepts the *stable, signed* development URL directly; it never appends
 * immutable /preview-document or its legacy revision query parameters.
 *
 * An iframe load event is NOT proof of React rendering. A separate HEAD
 * check confirms only an authenticated HTML document response. Actual page
 * rendering and in-place Vite HMR are separately tested in the browser.
 * The sandbox deliberately lacks allow-same-origin, top-navigation and forms.
 */
export default function DevelopmentRemoteWebPreview({preview}: Readonly<{
  preview: RemoteWebPreviewDescriptor;
}>) {
  const root = isTrustedDevelopmentPreviewRoot(preview.src) ? preview.src : null;
  const [history, setHistory] = useState<string[]>([ROOT_ROUTE]);
  const [position, setPosition] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [delivery, setDelivery] = useState<Delivery>("loading");
  const iframe = useRef<HTMLIFrameElement | null>(null);
  const latestProbe = useRef(0);
  const page = history[position] ?? ROOT_ROUTE;
  const documentUrl = root ? developmentPreviewDocumentUrl(root, page) : null;

  useEffect(() => { setDelivery("loading"); latestProbe.current++; }, [documentUrl, refresh]);
  useEffect(() => {
    setHistory([ROOT_ROUTE]); setPosition(0); setRefresh(0);
  }, [root]);

  const availableRoutes = (preview.routes?.length ? preview.routes : [{path:ROOT_ROUTE,label:"Home"}])
    .filter(item => typeof item.path === "string" && item.path.length <= 512 && VALID_PAGE.test(item.path));

  function navigate(route: string) {
    if (!root || !availableRoutes.some(item => item.path === route)) return;
    if (page === route) return;
    setHistory(current => [...current.slice(0, position + 1), route].slice(-40));
    setPosition(current => Math.min(current + 1, 39));
  }
  function reload() {
    if (preview.state === "error") { preview.onRetry?.(); return; }
    setDelivery("loading");
    setRefresh(value => value + 1);
  }
  async function verifyDocumentLoaded() {
    if (!documentUrl) return;
    const probe = ++latestProbe.current;
    try {
      const response = await fetch(documentUrl, {
        method:"HEAD",credentials:"omit",cache:"no-store",
        signal:AbortSignal.timeout(12000),
      });
      if (latestProbe.current !== probe) return;
      setDelivery(response.status === 200 && /^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? "")
        ? "delivered" : "unavailable");
    } catch {
      if (latestProbe.current === probe) setDelivery("unavailable");
    }
  }

  const message = !root && preview.src ? "Untrusted development preview URL." :
    preview.state === "error" ? (preview.message ?? "Preview unavailable.") :
    !root ? (preview.message ?? "Preparing saved preview…") :
    delivery === "unavailable" ? "The development document could not be verified. Retry the preview." :
    delivery === "loading" ? "Loading saved development preview…" :
    "Document delivered. Confirm the React page visually; native HMR is not yet verified.";

  return <div data-development-web-preview data-preview-state={preview.state}
    data-document-delivery={delivery} className="flex h-full min-h-0 flex-col bg-white dark:bg-black/40">
    <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-white/10 dark:bg-neutral-950">
      <button type="button" className={buttonClass} aria-label="Preview back"
        disabled={position === 0} onClick={() => setPosition(i => Math.max(0, i - 1))}>←</button>
      <button type="button" className={buttonClass} aria-label="Preview forward"
        disabled={position >= history.length - 1} onClick={() => setPosition(i => Math.min(history.length - 1, i + 1))}>→</button>
      <button type="button" className={buttonClass} aria-label="Refresh development preview"
        disabled={!root && !preview.onRetry} onClick={reload}>↻</button>
      <div className="min-w-0 flex-1 truncate rounded-md border border-neutral-200 bg-white px-2 py-1 font-mono text-[11px] text-neutral-600 dark:border-white/10 dark:bg-neutral-900 dark:text-white/70">
        {page}
      </div>
      <span className="text-[11px] text-neutral-500" role="status">
        {delivery === "delivered" && root ? "Document loaded" : "Development preview"}
      </span>
      {availableRoutes.length > 1 ? <select aria-label="Preview page" value={page}
        className="max-w-28 rounded-md border border-neutral-200 bg-white p-1 text-xs dark:bg-neutral-900"
        onChange={event => navigate(event.target.value)}>
        {availableRoutes.map(route => <option key={route.path} value={route.path}>{route.label}</option>)}
      </select> : null}
    </div>
    <div className="relative min-h-0 flex-1">
      {documentUrl && preview.state !== "error" ? <iframe
        ref={iframe}
        key={`${documentUrl}:${refresh}`}
        title="Saved ZoeBuild development preview"
        src={documentUrl}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="h-full w-full border-0 bg-white"
        onLoad={() => {void verifyDocumentLoaded();}}
        onError={() => setDelivery("unavailable")}
      /> : null}
      {(!documentUrl || preview.state === "error" || delivery === "unavailable") ? <div
        role="status" className="absolute inset-0 grid place-items-center bg-white/95 p-5 text-center text-sm text-neutral-700 dark:bg-neutral-950/95 dark:text-neutral-200">
        <div><p>{message}</p>{preview.onRetry ? <button type="button"
          className="mt-3 rounded-lg border border-neutral-300 px-3 py-1.5"
          onClick={() => preview.onRetry?.()}>Retry preview</button> : null}</div>
      </div> : null}
      {documentUrl && delivery === "loading" ? <div role="status"
        className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-neutral-950/85 px-2 py-1 text-xs text-white">
        {message}
      </div> : null}
    </div>
  </div>;
}
