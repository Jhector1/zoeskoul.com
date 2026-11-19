"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RemoteWebPreviewDescriptor } from "@zoeskoul/learner-workspace/runner/remotePreview";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";
import { registeredTanstackPreviewRoutes } from "@/lib/build/tanstackPreviewPageCatalog";
import { createDevelopmentPreviewBrowserSession } from "@/lib/build/reactPreviewDevelopmentBrowserSession";
import { createDevelopmentPreviewEditorLifecycle } from "@/lib/build/reactPreviewDevelopmentEditorLifecycle";
import { createDevelopmentHmrBrowserSocket } from "@/lib/build/reactPreviewDevelopmentHmrBrowserSocket";
import { createDevelopmentHmrIframeBridge } from "@/lib/build/reactPreviewDevelopmentHmrIframeBridge";
import {
  createDevelopmentHmrRotationCoordinator,
  createDevelopmentRecoveryCircuit,
} from "@/lib/build/reactPreviewDevelopmentRecoveryPolicy";

type Preview = RemoteWebPreviewDescriptor & {
  confirmedSourceVersion: number | null;
  attemptedSourceVersion: number | null;
};
const RENEW_CHECK_MS = 10_000;
const HMR_ROTATE_MS = 80_000;
const HMR_RECOVERY_ATTEMPTS = 3;
const LIFECYCLE_FAILURE_LIMIT = 3;

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
  // The committed editor inputs fence the old lease before passive effects
  // can schedule the next update. Bind readiness to the exact document too.
  const selectedRef = useRef({
    projectId: input.buildProjectId, sourceVersion: input.sourceVersion,
    savedSourceReady: input.savedSourceReady, active: false,
  });
  const bridgeWakeRef = useRef<(() => void) | null>(null);
  const recoveryCircuitRef = useRef<ReturnType<typeof createDevelopmentRecoveryCircuit> | null>(null);
  const fallbackRetryDelayRef = useRef<number | null>(null);
  if (!recoveryCircuitRef.current) recoveryCircuitRef.current=createDevelopmentRecoveryCircuit({
    maxFailures:LIFECYCLE_FAILURE_LIMIT,baseDelayMs:1_000,maxDelayMs:8_000,
  });
  recoveryCircuitRef.current.bindProject(input.buildProjectId);
  const nativeHmrEnabled=process.env.NEXT_PUBLIC_ZOEBUILD_NATIVE_IFRAME_HMR_ENABLED === "true";
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

  useLayoutEffect(() => {
    selectedRef.current = {projectId: input.buildProjectId,
      sourceVersion: input.sourceVersion, savedSourceReady: input.savedSourceReady, active};
    bridgeWakeRef.current?.();
    return () => {
      selectedRef.current = {...selectedRef.current,active:false};
    };
  }, [active,input.buildProjectId,input.sourceVersion,input.savedSourceReady]);

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
        // The controller has now confirmed the grant for this saved revision.
        // Wake the existing bridge (if still bound to that exact document).
        bridgeWakeRef.current?.();
        // Without native HMR, a confirmed authoritative document is the
        // strongest available recovery signal. Native mode waits for bridge +
        // Vite confirmation below before resetting the persistent circuit.
        if(!nativeHmrEnabled) recoveryCircuitRef.current?.meaningfulRecovery(buildProjectId);
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
        if(process.env.NODE_ENV==="development") console.info("[ZOE-HMR]",JSON.stringify({event:"lifecycle_failure"}));
        const decision=recoveryCircuitRef.current!.fail(buildProjectId);
        fallbackRetryDelayRef.current=decision.retry ? decision.delayMs : null;
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

  // Immutable rendering is a bounded recovery surface, not a terminal mode.
  // Re-enter the authoritative development lifecycle after a short backoff;
  // the Runner independently preserves any still-healthy development lease.
  useEffect(()=>{
    if(!input.enabled || !fallback)return;
    const delay=fallbackRetryDelayRef.current;
    if(delay===null)return;
    const timer=window.setTimeout(()=>setResult(current=>
      current?.projectId===input.buildProjectId
        ? {...current,fallback:false,preview:null,previewId:null}
        : current),delay);
    return ()=>window.clearTimeout(timer);
  },[fallback,input.buildProjectId,input.enabled]);

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
        !nativeHmrEnabled) return;
    const origin=process.env.NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_HMR_PUBLIC_ORIGIN;
    if (!origin || !/\/dpg1\.[A-Za-z0-9_-]{43}\/$/.test(currentDocumentUrl)) return;
    let disposed=false;
    let bound=false;
    let viteConnectedAttempt:number|null=null;
    let meaningfulReported=false;
    let fallbackIssued=false;
    const started=performance.now();
    let firstFrame=false;
    const diagnostic=(event:string)=>{
      if(process.env.NODE_ENV==="development") console.info("[ZOE-HMR]",JSON.stringify({event,bound,elapsedMs:Math.round(performance.now()-started)}));
    };
    diagnostic("bridge_start");
    const fallbackToImmutable=(reason:string)=>{
      if (disposed || fallbackIssued) return;
      fallbackIssued=true;
      diagnostic(reason);
      const decision=recoveryCircuitRef.current!.fail(input.buildProjectId);
      fallbackRetryDelayRef.current=decision.retry ? decision.delayMs : null;
      setResult(current=>current?.projectId===input.buildProjectId
        ? {...current,preview:null,previewId:null,fallback:true} : current);
    };
    type BrowserSocket=ReturnType<typeof createDevelopmentHmrBrowserSocket>;
    const rotation=createDevelopmentHmrRotationCoordinator<BrowserSocket>({
      maxFailures:HMR_RECOVERY_ATTEMPTS,baseDelayMs:250,maxDelayMs:1_500,
    });
    let activeAttempt:number|null=null;
    let activeSocket:BrowserSocket|null=null;
    const markMeaningfulRecovery=()=>{
      if(meaningfulReported || !bound ||
          activeAttempt===null || !activeSocket ||
          viteConnectedAttempt!==activeAttempt ||
          !rotation.meaningfulRecovery(activeAttempt,activeSocket))return;
      meaningfulReported=true;
      fallbackRetryDelayRef.current=null;
      recoveryCircuitRef.current?.meaningfulRecovery(input.buildProjectId);
      diagnostic("meaningful_recovery");
    };
    const readyVersion=():number|null=>{
      const wanted=selectedRef.current;
      const bound=activeRef.current;
      if(disposed || fallbackIssued || !wanted.active || !wanted.savedSourceReady ||
          wanted.projectId!==input.buildProjectId || bound?.projectId!==wanted.projectId)
        return null;
      const ready=bound.lifecycle.readyDocument();
      return ready && ready.sourceVersion===wanted.sourceVersion &&
        ready.previewId===currentPreviewId && ready.documentUrl===currentDocumentUrl
        ? ready.sourceVersion : null;
    };
    const bridge=createDevelopmentHmrIframeBridge({
      documentUrl:currentDocumentUrl,
      canDeliverFrames:()=>readyVersion()!==null,
      ...(process.env.NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_APPLICATION_RPC_ENABLED === "true" ?
        {getApplicationRpcVersion:readyVersion} : {}),
      onBound:()=>{bound=true;diagnostic("bridge_bound");markMeaningfulRecovery();},
      onClientReady:()=>diagnostic("iframe_vite_client_ready"),
      onResync:()=>{bound=false;meaningfulReported=false;diagnostic("iframe_transport_gap_resync");},
      onDeliveryFailure:()=>fallbackToImmutable("iframe_hmr_delivery_overflow"),
    });
    const bindTimeout=window.setTimeout(()=>{
      if (!disposed && !bound) fallbackToImmutable("bridge_bind_timeout");
    },15_000);
    let socket: ReturnType<typeof createDevelopmentHmrBrowserSocket> | null=null;
    let connecting=false;
    let retryTimer:number|null=null;
    const scheduleRecovery=(reason:string,attempt:number,candidate:BrowserSocket)=>{
      if(disposed)return;
      const decision=rotation.recordFailure(attempt,candidate);
      if(!decision.handled)return;
      meaningfulReported=false;
      if(viteConnectedAttempt===attempt)viteConnectedAttempt=null;
      bridge.setConnected(false);
      if(socket===candidate){socket=null;activeAttempt=null;activeSocket=null;}
      candidate.close();
      diagnostic(`${reason}_retry_${decision.attempt}`);
      if(!decision.retry || decision.delayMs===null) {
        fallbackToImmutable(reason);
        return;
      }
      if(retryTimer!==null)return;
      retryTimer=window.setTimeout(()=>{
        retryTimer=null;
        void connect();
      },decision.delayMs);
    };
    const connect=async () => {
      if (disposed || connecting) return;
      const version=readyVersion();
      if (version===null) return;
      const attempt=rotation.beginAttempt();
      if(attempt===null)return;
      connecting=true;
      let next!:BrowserSocket;
      next=createDevelopmentHmrBrowserSocket({
        buildProjectId:input.buildProjectId,
        previewId:currentPreviewId,
        sourceVersion:version,
        publicIngressOrigin:origin,
        // Never allow a ws:// destination from a production build or a
        // non-canonical editor origin. Production still requires WSS.
        allowLocalHttp:process.env.NODE_ENV === "development" &&
          process.env.NEXT_PUBLIC_ZOEBUILD_DEVELOPMENT_HMR_LOCAL_HTTP_ENABLED === "true" &&
          window.location.origin === "http://localhost:3004",
        fetchClient:(path,init)=>fetch(path,init),
        openWebSocket:(url,protocol)=>new WebSocket(url,protocol) as unknown as ReturnType<Parameters<typeof createDevelopmentHmrBrowserSocket>[0]["openWebSocket"]>,
        onSignal:signal=>{
          diagnostic(`vite_signal_${signal.replace("-","_")}`);
          if(signal==="connected"){
            viteConnectedAttempt=attempt;
            markMeaningfulRecovery();
          }
        },
        onViteFrame:frame=>{
          if(!firstFrame){firstFrame=true;diagnostic("first_vite_frame");}
          bridge.push(frame);
        },
        onStatus:status=>{
          if ((status==="disconnected" || status==="unavailable") && !disposed)
            scheduleRecovery("socket_"+status,attempt,next);
        },
      });
      try {
        await next.connect();
        if (disposed) {next.close();return;}
        const promoted=rotation.promote(attempt,next);
        if(!promoted.accepted){next.close();return;}
        if(retryTimer!==null){window.clearTimeout(retryTimer);retryTimer=null;}
        socket=next;
        activeAttempt=attempt;
        activeSocket=next;
        diagnostic("socket_connect_resolved");
        bridge.setConnected(true);
        promoted.retired?.close();
        markMeaningfulRecovery();
      } catch {
        next.close();
        if (!disposed) scheduleRecovery("socket_connect_failed",attempt,next);
      } finally {connecting=false;}
    };
    const wake=()=>{
      if(disposed || readyVersion()===null)return;
      bridge.flushReady();
      // A recovery timer may have fired while the revision was fenced.
      // Resume the connection when the exact grant is usable again.
      if(!socket && !connecting && retryTimer===null)void connect();
    };
    bridgeWakeRef.current=wake;
    wake();
    const rotate=window.setInterval(()=>{void connect();},HMR_ROTATE_MS);
    return () => {
      disposed=true;
      if(bridgeWakeRef.current===wake)bridgeWakeRef.current=null;
      window.clearInterval(rotate);
      window.clearTimeout(bindTimeout);
      if(retryTimer!==null)window.clearTimeout(retryTimer);
      rotation.close()?.close();
      if(socket && socket!==activeSocket)socket.close();
      bridge.close();
    };
  }, [active,input.buildProjectId,currentDocumentUrl,currentPreviewId,nativeHmrEnabled]);

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
