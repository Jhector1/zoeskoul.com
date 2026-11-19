/**
 * Phase 4E3B — opt-in editor orchestration around the saved-source-only
 * browser controller. No workspace bytes, actor key or Vite capability cross
 * this boundary. It is intentionally not a WebSocket/HMR implementation.
 */
import type {
  DevelopmentBrowserSession,
  createDevelopmentPreviewBrowserSession,
} from "./reactPreviewDevelopmentBrowserSession";
import { DevelopmentBrowserSessionError } from "./reactPreviewDevelopmentBrowserSession";

type SessionController = ReturnType<typeof createDevelopmentPreviewBrowserSession>;
export type DevelopmentEditorLifecyclePhase="idle"|"waiting-for-save"|"starting"|
  "updating"|"retrying-update"|"reconciling"|"renewing"|"ready"|"failed"|"closed";

export type DevelopmentEditorDocument = Readonly<{
  sourceVersion: number;
  documentUrl: string;
  previewId: string;
}>;

export function createDevelopmentPreviewEditorLifecycle(input: Readonly<{
  controller: SessionController;
  onDocument: (session: DevelopmentEditorDocument) => void;
  onWaiting: () => void;
  onFailure: () => void;
  maxRecoveryAttempts?: number;
  recoveryDelay?: (attempt:number) => Promise<void>;
}>) {
  let disposed = false;
  let failed = false;
  let running = false;
  let pending: number | null = null;
  let selectedVersion: number | null = null;
  let selectedReady = false;
  let recoveryAttempts=0;
  let recovering=false;
  let retryVersion:number|null=null;
  let phase:DevelopmentEditorLifecyclePhase="idle";
  const maxRecoveryAttempts=input.maxRecoveryAttempts ?? 3;
  const recoveryDelay=input.recoveryDelay ??
    ((attempt:number)=>new Promise<void>(resolve=>setTimeout(resolve,Math.min(1500,250*attempt))));
  if(!Number.isSafeInteger(maxRecoveryAttempts) || maxRecoveryAttempts<0 || maxRecoveryAttempts>5)
    throw new Error("Invalid preview recovery policy.");

  const valid = (v: number): boolean => Number.isSafeInteger(v) && v >= 1;
  function fail() {
    if (disposed || failed) return;
    failed = true;
    phase="failed";
    pending = null;
    input.controller.close();
    input.onFailure();
  }
  function publish(session: DevelopmentBrowserSession) {
    if (disposed || failed) return;
    if (!selectedReady || selectedVersion !== session.sourceVersion) {
      input.onWaiting();
      return;
    }
    phase="ready";
    input.onDocument({
      previewId: session.previewId,
      sourceVersion: session.sourceVersion,
      documentUrl: session.documentUrl,
    });
  }
  async function pump(): Promise<void> {
    if (disposed || failed || running || pending === null) return;
    running = true;
    let attemptedVersion:number|null=null;
    try {
      while (!disposed && !failed && pending !== null) {
        const version = pending;
        pending = null;
        attemptedVersion=version;
        const current = input.controller.snapshot();
        let session: DevelopmentBrowserSession;
        if(retryVersion!==null) {
          const exactRetry=retryVersion===version;
          retryVersion=null;
          phase=exactRetry?"retrying-update":"reconciling";
          session=exactRetry ? await input.controller.update(version) : await input.controller.restart(version);
        } else if(recovering) {
          phase="reconciling";
          session=await input.controller.restart(version);
        } else if (!current) {
          phase="starting";
          session = await input.controller.start(version);
        } else if (version === current.sourceVersion) {
          session = current;
        } else if (version === current.sourceVersion + 1) {
          phase="updating";
          session = await input.controller.update(version);
        } else {phase="reconciling";session = await input.controller.restart(version);}
        recovering=false;
        recoveryAttempts=0;
        if (disposed || failed) break;
        // A newer saved revision can arrive while a request is in flight.
        // Never publish the previous iframe URL as if it were current.
        if (pending === null) publish(session);
      }
    } catch(error) {
      const version=selectedVersion;
      if(!disposed && !failed && selectedReady && version!==null &&
          recoveryAttempts<maxRecoveryAttempts) {
        recoveryAttempts++;
        // A pre-write rejection has no uncertain side effect and is the only
        // mutation failure that may be replayed. Transport loss, post-write
        // failure and generic 5xx responses must use proof-based restart /
        // durable-grant reconciliation instead.
        const retryable=attemptedVersion===version && error instanceof DevelopmentBrowserSessionError &&
          error.code==="RETRYABLE_UPDATE";
        retryVersion=retryable?version:null;
        recovering=!retryable;
        phase=recovering?"reconciling":"retrying-update";
        input.onWaiting();
        await recoveryDelay(recoveryAttempts);
        if(!disposed && !failed && selectedReady && selectedVersion===version)
          pending=version;
      } else fail();
    } finally {
      running = false;
      // Renewals may have been skipped while an update was in flight.
      if (!disposed && !failed && pending !== null) void pump();
    }
  }
  function savedRevision(sourceVersion: number, sourceIsSaved: boolean): void {
    if (disposed || failed) return;
    if (!valid(sourceVersion)) { fail(); return; }
    selectedVersion = sourceVersion;
    selectedReady = sourceIsSaved;
    if (!sourceIsSaved) {
      phase="waiting-for-save";
      pending = null;
      const current = input.controller.snapshot();
      if (!current || current.sourceVersion !== sourceVersion) input.onWaiting();
      return;
    }
    pending = sourceVersion;
    if(input.controller.snapshot()?.sourceVersion===sourceVersion) recoveryAttempts=0;
    void pump();
  }
  async function renewIfDue(): Promise<void> {
    if (disposed || failed || running || pending !== null || !selectedReady ||
        !input.controller.renewalDue()) return;
    const current = input.controller.snapshot();
    if (!current || selectedVersion !== current.sourceVersion) return;
    running = true;
    phase="renewing";
    try {
      const renewed = await input.controller.renew();
      if (!disposed && !failed) publish(renewed);
    } catch(error) {
      if (disposed || failed) return;
      if(error instanceof DevelopmentBrowserSessionError &&
          error.code==="RESTART_REQUIRED" && selectedVersion!==null) {
        recovering=true;
        pending=selectedVersion;
      } else if(recoveryAttempts<maxRecoveryAttempts && selectedVersion!==null) {
        recoveryAttempts++;
        recovering=true;
        pending=selectedVersion;
      } else fail();
    } finally {
      running = false;
      if (!disposed && !failed && pending !== null) void pump();
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    phase="closed";
    pending = null;
    // Dispose this tab's browser controller, not the Runner's owned lease.
    // The Runner's bounded idle/hard-lifetime sweeper and explicit cancel /
    // project deletion remain the resource-lifetime authorities. Browser
    // read grants expire without renewal after this tab closes.
    input.controller.close();
  }
  // Canonical browser-side readiness, not server authorization. Never
  // expose the old revision while a save/update/reconciliation is pending.
  // A same-revision periodic renewal may keep the existing grant usable.
  function readyDocument(): DevelopmentEditorDocument | null {
    if (disposed || failed || !selectedReady || pending !== null ||
        (phase !== "ready" && phase !== "renewing")) return null;
    const session = input.controller.snapshot();
    if (!session || session.sourceVersion !== selectedVersion) return null;
    return {previewId:session.previewId,sourceVersion:session.sourceVersion,
      documentUrl:session.documentUrl};
  }
  return {savedRevision,renewIfDue,dispose,readyDocument,snapshot:()=>({phase,recoveryAttempts,
    selectedVersion,selectedReady,pending,running}) as const};
}
