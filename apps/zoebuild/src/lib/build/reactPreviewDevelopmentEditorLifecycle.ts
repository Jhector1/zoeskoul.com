/**
 * Phase 4E3B — opt-in editor orchestration around the saved-source-only
 * browser controller. No workspace bytes, actor key or Vite capability cross
 * this boundary. It is intentionally not a WebSocket/HMR implementation.
 */
import type {
  DevelopmentBrowserSession,
  createDevelopmentPreviewBrowserSession,
} from "./reactPreviewDevelopmentBrowserSession";

type SessionController = ReturnType<typeof createDevelopmentPreviewBrowserSession>;

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
  cancelLease: (previewId: string) => Promise<unknown>;
}>) {
  let disposed = false;
  let failed = false;
  let running = false;
  let pending: number | null = null;
  let selectedVersion: number | null = null;
  let selectedReady = false;
  let knownPreviewId: string | null = null;

  const valid = (v: number): boolean => Number.isSafeInteger(v) && v >= 1;
  function fail() {
    if (disposed || failed) return;
    failed = true;
    pending = null;
    input.controller.close();
    input.onFailure();
  }
  function publish(session: DevelopmentBrowserSession) {
    knownPreviewId = session.previewId;
    if (disposed || failed) return;
    if (!selectedReady || selectedVersion !== session.sourceVersion) {
      input.onWaiting();
      return;
    }
    input.onDocument({
      previewId: session.previewId,
      sourceVersion: session.sourceVersion,
      documentUrl: session.documentUrl,
    });
  }
  async function pump(): Promise<void> {
    if (disposed || failed || running || pending === null) return;
    running = true;
    try {
      while (!disposed && !failed && pending !== null) {
        const version = pending;
        pending = null;
        const current = input.controller.snapshot();
        let session: DevelopmentBrowserSession;
        if (!current) {
          session = await input.controller.start(version);
        } else if (version === current.sourceVersion) {
          session = current;
        } else if (version === current.sourceVersion + 1) {
          session = await input.controller.update(version);
        } else {
          fail();
          break;
        }
        knownPreviewId = session.previewId;
        if (disposed || failed) break;
        // A newer saved revision can arrive while a request is in flight.
        // Never publish the previous iframe URL as if it were current.
        if (pending === null) publish(session);
      }
    } catch {
      fail();
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
      pending = null;
      const current = input.controller.snapshot();
      if (!current || current.sourceVersion !== sourceVersion) input.onWaiting();
      return;
    }
    pending = sourceVersion;
    void pump();
  }
  async function renewIfDue(): Promise<void> {
    if (disposed || failed || running || pending !== null || !selectedReady ||
        !input.controller.renewalDue()) return;
    const current = input.controller.snapshot();
    if (!current || selectedVersion !== current.sourceVersion) return;
    running = true;
    try {
      const renewed = await input.controller.renew();
      knownPreviewId = renewed.previewId;
      if (!disposed && !failed) publish(renewed);
    } catch {
      fail();
    } finally {
      running = false;
      if (!disposed && !failed && pending !== null) void pump();
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    pending = null;
    const previewId = knownPreviewId ?? input.controller.snapshot()?.previewId;
    input.controller.close();
    // Cancellation is authenticated and best effort; never let an unmounted
    // editor leak rejection errors or send an untrusted preview identity.
    if (previewId) void input.cancelLease(previewId).catch(() => undefined);
  }
  return {savedRevision, renewIfDue, dispose};
}
