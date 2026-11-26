"use client";

import {useCallback, useEffect, useRef, useState} from "react";
import { registerDevelopmentHmrDocument, subscribeDevelopmentNavigation, sendDevelopmentNavigation, type DevelopmentNavigationState } from "@/lib/build/reactPreviewDevelopmentHmrIframeBridge";
import {PreviewAddressBar} from "@zoeskoul/learner-workspace/runner/components/RemoteWebPreview";
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
export default function DevelopmentRemoteWebPreview({preview}: Readonly<{preview:RemoteWebPreviewDescriptor}>) {
  return <DevelopmentPreviewDocument key={preview.src ?? "pending"} preview={preview}/>;
}
function DevelopmentPreviewDocument({preview}: Readonly<{
  preview: RemoteWebPreviewDescriptor;
}>) {
  const root = isTrustedDevelopmentPreviewRoot(preview.src) ? preview.src : null;
  const [documentRoute,setDocumentRoute]=useState(ROOT_ROUTE);
  const [page,setPage]=useState(ROOT_ROUTE);
  const [navigation,setNavigation]=useState<DevelopmentNavigationState|null>(null);
  const [navigationError,setNavigationError]=useState(false);
  const [staticHistory,setStaticHistory]=useState({routes:[ROOT_ROUTE],index:0});
  const hmrOff=preview.hmrConnection==="disabled";
  const [refresh, setRefresh] = useState(0);
  const [delivery, setDelivery] = useState<Delivery>("loading");
  const unregisterFrame = useRef<(() => void) | null>(null);
  const latestProbe = useRef(0);
  // The src and key depend on explicit reload/recovery only, never on the
  // current route reported by the application.
  const documentUrl = root ? developmentPreviewDocumentUrl(root, documentRoute) : null;
  const bindFrame=useCallback((frame:HTMLIFrameElement|null)=>{
    unregisterFrame.current?.();unregisterFrame.current=null;
    if(frame && root && documentUrl)unregisterFrame.current=registerDevelopmentHmrDocument(root,documentUrl,frame);
  },[root,documentUrl]);

  useEffect(() => { setDelivery("loading"); latestProbe.current++; }, [documentUrl, refresh]);
  useEffect(() => {
    setDocumentRoute(ROOT_ROUTE);setPage(ROOT_ROUTE);setRefresh(0);setNavigationError(false);
    if(!root){setNavigation(null);return;}
    return subscribeDevelopmentNavigation(root,state=>{
      setNavigation(state);
      if(state){setPage(state.route);setNavigationError(state.failed);}
    });
  }, [root]);

  const availableRoutes = (preview.routes?.length ? preview.routes : [{path:ROOT_ROUTE,label:"Home"}])
    .filter(item => typeof item.path === "string" && item.path.length <= 512 && VALID_PAGE.test(item.path));

  function navigate(route: string) {
    if (!root || !availableRoutes.some(item => item.path === route)) return;
    if (page === route) return;
    setNavigationError(false);
    if(hmrOff) {
      const routes=[...staticHistory.routes.slice(0,staticHistory.index+1),route].slice(-40);
      setStaticHistory({routes,index:routes.length-1});setDocumentRoute(route);setPage(route);return;
    }
    if(!sendDevelopmentNavigation(root,{action:"navigate",route}))setNavigationError(true);
  }
  function step(action:"back"|"forward") {
    if(!root)return;
    if(hmrOff){
      const index=staticHistory.index+(action==="back"?-1:1);
      const route=staticHistory.routes[index];if(!route)return;
      setStaticHistory({...staticHistory,index});setPage(route);setDocumentRoute(route);return;
    }
    if(!sendDevelopmentNavigation(root,{action}))setNavigationError(true);
  }
  function reload() {
    if (preview.state === "error") { preview.onRetry?.(); return; }
    setDelivery("loading");
    setNavigationError(false);
    setDocumentRoute(page);
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
    "Development document delivered.";
  const status = preview.state === "error" || delivery === "unavailable" ? "Preview error" :
    preview.hmrConnection === "disabled" ? "HMR off" :
    preview.hmrConnection === "reconnecting" ? "Reconnecting" :
    preview.hmrConnection === "live" && delivery === "delivered" ? "Live HMR" : "Connecting";

  return <div data-development-web-preview data-preview-state={preview.state}
    data-document-delivery={delivery} className="flex h-full min-h-0 flex-col bg-white dark:bg-black/40">
    <div className="flex shrink-0 items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-2 py-1.5 dark:border-white/10 dark:bg-neutral-950">
      <button type="button" className={buttonClass} aria-label="Preview back"
        disabled={!root || (hmrOff?staticHistory.index===0:!navigation?.canGoBack)} onClick={()=>step("back")}>←</button>
      <button type="button" className={buttonClass} aria-label="Preview forward"
        disabled={!root || (hmrOff?staticHistory.index>=staticHistory.routes.length-1:!navigation?.canGoForward)} onClick={()=>step("forward")}>→</button>
      <button type="button" className={buttonClass} aria-label="Refresh development preview"
        disabled={!root && !preview.onRetry} onClick={reload}>↻</button>
      <PreviewAddressBar routes={availableRoutes} path={page} disabled={!root || preview.state === "error" || (!navigation && preview.hmrConnection!=="disabled")} onNavigate={navigate}/>
      <span role="status" title={status === "Live HMR" ? "Vite HMR transport connected; application rendering is separate." : message}
        data-preview-runtime-status={status}
        className={`flex shrink-0 items-center gap-1 text-[11px] font-medium ${status === "Live HMR" ? "text-green-700 dark:text-green-400" : status === "Preview error" ? "text-red-600 dark:text-red-400" : status === "Reconnecting" ? "text-amber-700 dark:text-amber-400" : "text-neutral-500"}`}>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current"/>{status}
      </span>
    </div>
    <div className="relative min-h-0 flex-1">
      {documentUrl && preview.state !== "error" ? <iframe
        ref={bindFrame}
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
      {navigationError && delivery === "delivered" ? <div role="status" className="absolute bottom-2 left-2 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-900">Navigation unavailable. Retry or refresh.</div> : null}
      {documentUrl && delivery === "loading" ? <div role="status"
        className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-neutral-950/85 px-2 py-1 text-xs text-white">
        {message}
      </div> : null}
    </div>
  </div>;
}
