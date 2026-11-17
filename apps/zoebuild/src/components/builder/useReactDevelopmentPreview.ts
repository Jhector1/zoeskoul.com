"use client";

import { useEffect, useRef, useState } from "react";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { registeredTanstackPreviewRoutes } from "@/lib/build/tanstackPreviewPageCatalog";
import { createDevelopmentPreviewBrowserSession } from "@/lib/build/reactPreviewDevelopmentBrowserSession";
import { createDevelopmentPreviewEditorLifecycle } from "@/lib/build/reactPreviewDevelopmentEditorLifecycle";
import { createDevelopmentHmrBrowserSocket } from "@/lib/build/reactPreviewDevelopmentHmrBrowserSocket";
import { createDevelopmentHmrIframeBridge } from "@/lib/build/reactPreviewDevelopmentHmrIframeBridge";

type Preview = RemoteWebPreviewDescriptor & {
  confirmedSourceVersion: number | null;
  attemptedSourceVersion: number | null;
};
const RENEW_CHECK_MS = 10_000;
const HMR_ROTATE_MS = 80_000;

type Active = ReturnType<typeof createDevelopmentPreviewEditorLifecycle>;

/**
 * Phase 4E3B optional editor read-only iframe integration.
 * The network never sees the unsaved workspace; it receives sourceVersion only.
 * Saved revisions update the running Vite workspace without cold startup.
 * Native HMR is separately gated and uses an editor-owned authenticated
 * WebSocket bridged to the opaque-origin iframe through a MessagePort.
 */
export function useReactDevelopmentPreview(input: Readonly<{
  enabled: boolean;
  buildProjectId: string;
  sourceVersion: number;
  savedSourceReady: boolean;
  workspace: WorkspaceStateV2;
}>): Readonly<{ preview: Preview | null; fallback: boolean }> {
  const activeRef = useRef<{ projectId: string; lifecycle: Active } | null>(null);
  const confirmedVersionRef = useRef<number | null>(null);
  const [result, setResult] = useState<{
    projectId: string;
    preview: RemoteWebPreviewDescriptor | null;
    previewId: string | null;
    confirmed: number | null;
    attempted: number | null;
    fallback: boolean;
  } | null>(null);

  // Both source and project changes are fenced. A different project must never
  // briefly receive a prior project's tokenized iframe URL on first render.
  const resultForProject = result?.projectId === input.buildProjectId ? result : null;
  const fallback = resultForProject?.fallback ?? false;
  const active = input.enabled && !fallback;

  useEffect(() => {
    if (!active) {
      if (!input.enabled) setResult(null);
      return;
    }
    let alive = true;
    const buildProjectId = input.buildProjectId;
    const controller = createDevelopmentPreviewBrowserSession({
      buildProjectId,
      fetchClient: (path, init) => fetch(path, init),
    });
    const lifecycle = createDevelopmentPreviewEditorLifecycle({
      controller,
      onDocument: ({ sourceVersion, documentUrl, previewId }) => {
        if (!alive) return;
        confirmedVersionRef.current=sourceVersion;
        setResult(current => ({
          projectId: buildProjectId,
          previewId,
          preview: {
            src: documentUrl,
            state: "ready",
            message: null,
            // A retained iframe src is not a navigation. Do not increment
            // the descriptor's refresh key for a source revision alone.
            revision: current?.projectId === buildProjectId &&
              current.preview?.src === documentUrl
              ? current.preview.revision
              : (current?.projectId === buildProjectId ? current.preview?.revision ?? 0 : 0) + 1,
          },
          confirmed: sourceVersion,
          attempted: sourceVersion,
          fallback: false,
        }));
      },
      onWaiting: () => {
        if (!alive) return;
        setResult(current => ({
          projectId: buildProjectId,
          previewId: current?.projectId === buildProjectId ? current.previewId : null,
          // Do not detach the existing iframe while the next source revision
          // is saving; Vite will deliver its update once committed.
          preview: current?.projectId === buildProjectId && current.preview?.src
            ? current.preview : {
              src: null, state: "starting",
              message: "Waiting for the saved preview revision…",
              revision: 0,
            },
          confirmed: null,
          attempted: null,
          fallback: false,
        }));
      },
      onFailure: () => {
        if (!alive) return;
        // Immediately detach the mutable iframe; the unchanged immutable
        // hook takes over after teardown and best-effort lease cancellation.
        setResult({
          projectId: buildProjectId,
          preview: null,
          previewId: null,
          confirmed: null,
          attempted: null,
          fallback: true,
        });
      },
      cancelLease: async (previewId) => {
        if (!/^preview_[0-9a-f-]{36}$/i.test(previewId)) return;
        // Both operations are independent. A failed/slow revoke cannot stop
        // Runner cancellation, and a failed cancel cannot prolong grant life.
        const scope=`/api/build/projects/${encodeURIComponent(buildProjectId)}/preview/${encodeURIComponent(previewId)}`;
        await Promise.allSettled([
          fetch(`${scope}/development/revoke-access`, {
            method: "POST", credentials: "same-origin", cache: "no-store", keepalive: true,
          }),
          fetch(`${scope}/cancel`, {
            method: "POST", credentials: "same-origin", cache: "no-store",
          }),
        ]);
      },
    });
    activeRef.current = { projectId: buildProjectId, lifecycle };
    setResult(current => ({
      projectId: buildProjectId,
      previewId: null,
      preview: {src: null, state: "starting", message: "Preparing the saved development preview…", revision: 0},
      confirmed: null, attempted: null, fallback: false,
    }));
    const renewTimer = window.setInterval(() => {void lifecycle.renewIfDue();}, RENEW_CHECK_MS);
    return () => {
      alive = false;
      window.clearInterval(renewTimer);
      if (activeRef.current?.lifecycle === lifecycle) activeRef.current = null;
      lifecycle.dispose();
    };
  }, [input.buildProjectId, input.enabled, active]);

  useEffect(() => {
    if (!active) return;
    // Scheduling the first request beyond effect setup avoids a duplicate
    // development start during React Strict Mode's mount/cleanup probe.
    const timer = window.setTimeout(() => {
      const bound = activeRef.current;
      if (bound?.projectId !== input.buildProjectId) return;
      bound.lifecycle.savedRevision(input.sourceVersion, input.savedSourceReady);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, input.buildProjectId, input.sourceVersion, input.savedSourceReady]);

  // Separate browser-only effect: no WebSocket is opened unless the entire
  // native-HMR path is explicitly enabled. The ticket remains in the editor;
  // a sandboxed iframe receives only Vite protocol messages on MessagePort.
  const currentDocumentUrl=resultForProject?.preview?.src ?? null;
  const currentPreviewId=resultForProject?.previewId ?? null;
  useEffect(() => {
    if (!active || !currentDocumentUrl || !currentPreviewId ||
        process.env.NEXT_PUBLIC_ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED !== "true") return;
    const origin=process.env.NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN;
    if (!origin || !/\/dpg1\.[A-Za-z0-9_-]{43}\/$/.test(currentDocumentUrl)) return;
    let disposed=false;
    let bound=false;
    const fallbackToImmutable=()=>{
      if (disposed) return;
      setResult(current=>current?.projectId===input.buildProjectId
        ? {...current,preview:null,previewId:null,fallback:true} : current);
    };
    const bridge=createDevelopmentHmrIframeBridge({
      documentUrl:currentDocumentUrl,
      onBound:()=>{bound=true;},
    });
    const bindTimeout=window.setTimeout(()=>{
      if (!disposed && !bound) fallbackToImmutable();
    },15_000);
    let socket: ReturnType<typeof createDevelopmentHmrBrowserSocket> | null=null;
    let connecting=false;
    const connect=async () => {
      if (disposed || connecting) return;
      const version=confirmedVersionRef.current;
      if (!Number.isSafeInteger(version) || !version || version<1) return;
      connecting=true;
      const next=createDevelopmentHmrBrowserSocket({
        buildProjectId:input.buildProjectId,
        previewId:currentPreviewId,
        sourceVersion:version,
        publicIngressOrigin:origin,
        fetchClient:(path,init)=>fetch(path,init),
        openWebSocket:(url,protocol)=>new WebSocket(url,protocol) as unknown as ReturnType<Parameters<typeof createDevelopmentHmrBrowserSocket>[0]["openWebSocket"]>,
        onViteFrame:frame=>bridge.push(frame),
        onStatus:status=>{
          if ((status==="disconnected" || status==="unavailable") &&
              !disposed && socket===next) fallbackToImmutable();
        },
      });
      try {
        await next.connect();
        if (disposed) {next.close();return;}
        const previous=socket;
        socket=next;
        bridge.setConnected(true);
        previous?.close();
      } catch {
        next.close();
        if (!disposed && !socket) {
          bridge.close();
          fallbackToImmutable();
        }
      } finally {connecting=false;}
    };
    void connect();
    const rotate=window.setInterval(()=>{void connect();},HMR_ROTATE_MS);
    return () => {
      disposed=true;
      window.clearInterval(rotate);
      window.clearTimeout(bindTimeout);
      socket?.close();
      bridge.close();
    };
  }, [active,input.buildProjectId,currentDocumentUrl,currentPreviewId]);

  const preview = resultForProject?.preview;
  if (!input.enabled || fallback || !preview || !resultForProject) return {preview:null,fallback};
  const ready = resultForProject.confirmed === input.sourceVersion && input.savedSourceReady;
  return {
    fallback:false,
    preview: {
      ...preview,
      confirmedSourceVersion: ready ? resultForProject.confirmed : null,
      attemptedSourceVersion: resultForProject.attempted,
      routes: registeredTanstackPreviewRoutes(exportWorkspaceEntries(input.workspace.nodes)),
      onRetry: () => {
        activeRef.current?.lifecycle.savedRevision(input.sourceVersion, input.savedSourceReady);
      },
    },
  };
}
