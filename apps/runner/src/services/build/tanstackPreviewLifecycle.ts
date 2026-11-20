import { isTanstackSsrReady, TANSTACK_PREVIEW_READY_TIMEOUT_MS, TANSTACK_PREVIEW_PROBE_INTERVAL_MS } from "./tanstackPreviewRuntimePolicy.js";
import { previewObservability, type PreviewOperationTelemetry } from "./previewObservability.js";
import type { TanstackStartupEvidence } from "./tanstackPreviewStartupDiagnostics.js";
import {
  TanstackPreviewTransportError,
  type TanstackPreviewTransportFailureStage,
} from "./tanstackPreviewDockerTransport.js";

/** Preserve the recovery callback for cleanup failures *before* start returns
 * a normal handle. The admission owner must quarantine these orphans so they
 * continue to consume the shared preview slot until teardown is verified. */
export class TanstackPreviewCleanupError extends Error {
  constructor(
    readonly orphan: Readonly<{ containerId: string | null; workspaceDir: string | null }>,
    readonly recover: () => Promise<void>,
    cause: unknown,
  ) {
    super("TanStack preview failed and sandbox cleanup needs reconciliation.", { cause });
    this.name = "TanstackPreviewCleanupError";
  }
}

/** One lifecycle operation, never a parallel preview registry. Its caller must
 * acquire the EXISTING shared Runner preview-admission lease before invoking.
 * The adapter owns a private workspace and a Docker container per operation. */
export type TanstackSandboxHandle = Readonly<{
  containerId: string;
  workspaceDir: string;
}>;

/** Bounded startup taxonomy shared by the route, admission owner and driver.
 * These values describe operations only; they never include source, paths,
 * container identities, dependency names or raw Docker failures. */
export type TanstackPreviewStartPhase =
  | "queued"
  | "lease_admission"
  | "capacity"
  | "driver_validation"
  | "recovery_journal"
  | "workspace"
  | "dependencies"
  | "container"
  | "readiness";

/** Bounded diagnostic metadata only; never log user source, paths or errors. */
export type TanstackReadinessDiagnostic = Readonly<{
  result: "transport_error" | "http_status" | "invalid_html" | "no_probe";
  attempts: number;
  lastHttpStatus: number | null;
  transportStage: TanstackPreviewTransportFailureStage | "unclassified" | null;
  elapsedMs: number;
}>;

export class TanstackPreviewReadinessError extends Error {
  constructor(readonly diagnostic: TanstackReadinessDiagnostic) {
    super("Isolated TanStack preview did not become ready.");
    this.name = "TanstackPreviewReadinessError";
  }
}

export type TanstackPreviewDriver = Readonly<{
  prepare(onPhase?: (phase: TanstackPreviewStartPhase) => void): Promise<string>;
  launch(workspaceDir: string): Promise<string>;
  /** Native startup can separate TCP listener and full application readiness.
   * Optional for legacy drivers and test doubles. */
  probeListener?(containerId:string, timeoutMs:number):Promise<boolean>;
  probe(containerId: string): Promise<Readonly<{status: number; headers: Readonly<Record<string,string>>; bodyBase64: string}>>;
  /** Failure-path only: sanitized Docker state before cleanup removes the container. */
  diagnose?(containerId: string): Promise<TanstackStartupEvidence>;
  destroy(containerId: string): Promise<void>;
  cleanup(workspaceDir: string): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
}>;

export async function startIsolatedTanstackPreview(driver: TanstackPreviewDriver,
  opts: Readonly<{ signal?: AbortSignal; timeoutMs?: number;
    onPhase?: (phase: TanstackPreviewStartPhase) => void;
    telemetry?: PreviewOperationTelemetry;
    diagnosticCorrelation?: Readonly<{operation:string;preview:string}> }> = {}): Promise<TanstackSandboxHandle> {
  const timeoutMs = opts.timeoutMs ?? TANSTACK_PREVIEW_READY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > TANSTACK_PREVIEW_READY_TIMEOUT_MS)
    throw new Error("Invalid preview readiness deadline.");
  let workspaceDir: string | null = null;
  let containerId: string | null = null;
  let endReadiness: ReturnType<PreviewOperationTelemetry["begin"]> | null = null;
  let endFirstSsr: ReturnType<PreviewOperationTelemetry["begin"]> | null = null;
  try {
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    workspaceDir = await driver.prepare(opts.onPhase);
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    opts.onPhase?.("container");
    containerId = await driver.launch(workspaceDir);
    const startedAt = driver.now();
    opts.onPhase?.("readiness");
    endReadiness = opts.telemetry?.begin("vite_readiness") ?? null;
    let listenerReady = !driver.probeListener;
    if (listenerReady) endFirstSsr = opts.telemetry?.begin("first_ssr") ?? null;
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    // Readiness deadline begins after launch, not during dependency install.
    let attempts = 0;
    let result: TanstackReadinessDiagnostic["result"] = "no_probe";
    let lastHttpStatus: number | null = null;
    let transportStage: TanstackReadinessDiagnostic["transportStage"] = null;
    while (driver.now() - startedAt < timeoutMs) {
      if (opts.signal?.aborted) throw new Error("Preview cancelled.");
      attempts++;
      try {
        if (!listenerReady && driver.probeListener) {
          const budget = Math.max(1, Math.min(1000, Math.floor(timeoutMs - (driver.now() - startedAt))));
          listenerReady = await driver.probeListener(containerId, budget);
          if (!listenerReady) {
            result = "transport_error";
            transportStage = "loopback_connection";
            lastHttpStatus = null;
            if (opts.signal?.aborted) throw new Error("Preview cancelled.");
            await driver.sleep(Math.min(100, Math.max(1, timeoutMs - (driver.now() - startedAt))));
            continue;
          }
          if (opts.signal?.aborted) throw new Error("Preview cancelled.");
          if (driver.now() - startedAt >= timeoutMs) {
            result = "transport_error"; transportStage = "deadline"; lastHttpStatus = null;
            break;
          }
          endReadiness?.("ok");
          endReadiness = null;
          endFirstSsr = opts.telemetry?.begin("first_ssr") ?? null;
        }
        if (opts.signal?.aborted || driver.now() - startedAt >= timeoutMs) break;
        const response = await driver.probe(containerId);
        if (opts.signal?.aborted) throw new Error("Preview cancelled.");
        if (driver.probeListener && driver.now() - startedAt >= timeoutMs) {
          result = "transport_error"; transportStage = "deadline"; lastHttpStatus = null;
          break;
        }
        if (isTanstackSsrReady(response)) {
          endReadiness?.("ok");
          endFirstSsr?.("ok");
          return { containerId, workspaceDir };
        }
        lastHttpStatus = Number.isInteger(response.status) &&
          response.status >= 100 && response.status <= 599 ? response.status : null;
        transportStage = null;
        result = response.status === 200 ? "invalid_html" : "http_status";
      } catch (error) {
        // Never log the underlying exception: it may contain response data.
        result = "transport_error";
        lastHttpStatus = null;
        transportStage = error instanceof TanstackPreviewTransportError
          ? error.stage : "unclassified";
      }
      if (opts.signal?.aborted) throw new Error("Preview cancelled.");
      await driver.sleep(Math.min(TANSTACK_PREVIEW_PROBE_INTERVAL_MS,
        Math.max(1, timeoutMs - (driver.now() - startedAt))));
    }
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    const diagnostic: TanstackReadinessDiagnostic = {
      result,
      attempts,
      lastHttpStatus,
      transportStage,
      elapsedMs: Math.max(0, Math.floor(driver.now() - startedAt)),
    };
    // Capture before mandatory container removal. Failures are diagnostic-only.
    // Never log raw Docker exception strings, command arguments or Vite output.
    const startup = driver.diagnose && containerId
      ? await driver.diagnose(containerId).catch(() => null) : null;
    console.warn("RUNNER isolated TanStack readiness timed out", {
      ...diagnostic,
      startup,
      ...(opts.diagnosticCorrelation ? {
        operationCorrelation: opts.diagnosticCorrelation.operation,
        previewCorrelation: opts.diagnosticCorrelation.preview,
      } : {}),
    });
    throw new TanstackPreviewReadinessError(diagnostic);
  } catch (error) {
    endReadiness?.(opts.signal?.aborted ? "cancelled" : "error");
    endFirstSsr?.(opts.signal?.aborted ? "cancelled" : "error");
    // Cleanup is mandatory even if readiness, installation, or cancellation fails.
    const earlier = error instanceof TanstackPreviewCleanupError ? error : null;
    // An inner driver error may own a container that launch/prepare never
    // returned. Never reclaim its workspace until that cleanup has succeeded.
    let outstandingContainer = containerId;
    let outstandingWorkspace = workspaceDir;
    const endCleanup = containerId || workspaceDir
      ? previewObservability.beginCleanup() : null;
    if (!earlier) {
      if (outstandingContainer) {
        try { await driver.destroy(outstandingContainer); outstandingContainer = null; }
        catch { /* Keep both resources accounted until verified teardown. */ }
      }
      if (!outstandingContainer && outstandingWorkspace) {
        try { await driver.cleanup(outstandingWorkspace); outstandingWorkspace = null; }
        catch { /* Keep the exact workspace for retry. */ }
      }
    }
    endCleanup?.(earlier || outstandingContainer || outstandingWorkspace ? "error" : "ok");
    if (earlier || outstandingContainer || outstandingWorkspace) {
      const outstanding = {
        containerId: earlier?.orphan.containerId ?? outstandingContainer,
        workspaceDir: earlier?.orphan.workspaceDir ?? outstandingWorkspace,
      };
      const pending: Array<() => Promise<void>> = [];
      if (earlier) pending.push(() => earlier.recover());
      if (outstandingContainer && outstandingContainer !== earlier?.orphan.containerId) {
        const id = outstandingContainer;
        pending.push(() => driver.destroy(id));
      }
      if (outstandingWorkspace && outstandingWorkspace !== earlier?.orphan.workspaceDir) {
        const dir = outstandingWorkspace;
        pending.push(() => driver.cleanup(dir));
      }
      // Never run a destroy and workspace deletion in parallel. Remove each
      // step only after success; concurrent recovery callers join one flight.
      let recoveryFlight: Promise<void> | null = null;
      const recover = (): Promise<void> => {
        if (recoveryFlight) return recoveryFlight;
        recoveryFlight = (async () => {
          while (pending.length) {
            try { await pending[0](); }
            catch { throw new Error("TanStack preview orphan cleanup still incomplete."); }
            pending.shift();
          }
        })().finally(() => { recoveryFlight = null; });
        return recoveryFlight;
      };
      throw new TanstackPreviewCleanupError(outstanding, recover, error);
    }
    throw error;
  }
}

export async function stopIsolatedTanstackPreview(driver: Pick<TanstackPreviewDriver,"destroy"|"cleanup">,
  handle: TanstackSandboxHandle): Promise<void> {
  // Do not delete a workspace while Docker may still be using its mount.
  await driver.destroy(handle.containerId);
  await driver.cleanup(handle.workspaceDir);
}
