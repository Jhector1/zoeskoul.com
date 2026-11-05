import { isTanstackSsrReady, TANSTACK_PREVIEW_READY_TIMEOUT_MS, TANSTACK_PREVIEW_PROBE_INTERVAL_MS } from "./tanstackPreviewRuntimePolicy.js";

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

/** Bounded diagnostic metadata only; never log user source, paths or errors. */
export type TanstackReadinessDiagnostic = Readonly<{
  result: "transport_error" | "http_status" | "invalid_html" | "no_probe";
  attempts: number;
  lastHttpStatus: number | null;
  elapsedMs: number;
}>;

export class TanstackPreviewReadinessError extends Error {
  constructor(readonly diagnostic: TanstackReadinessDiagnostic) {
    super("Isolated TanStack preview did not become ready.");
    this.name = "TanstackPreviewReadinessError";
  }
}

export type TanstackPreviewDriver = Readonly<{
  prepare(): Promise<string>;
  launch(workspaceDir: string): Promise<string>;
  probe(containerId: string): Promise<Readonly<{status: number; headers: Readonly<Record<string,string>>; bodyBase64: string}>>;
  destroy(containerId: string): Promise<void>;
  cleanup(workspaceDir: string): Promise<void>;
  now(): number;
  sleep(ms: number): Promise<void>;
}>;

export async function startIsolatedTanstackPreview(driver: TanstackPreviewDriver,
  opts: Readonly<{ signal?: AbortSignal; timeoutMs?: number;
    onPhase?: (phase: "queued" | "workspace" | "dependencies" | "container" | "readiness") => void }> = {}): Promise<TanstackSandboxHandle> {
  const timeoutMs = opts.timeoutMs ?? TANSTACK_PREVIEW_READY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > TANSTACK_PREVIEW_READY_TIMEOUT_MS)
    throw new Error("Invalid preview readiness deadline.");
  let workspaceDir: string | null = null;
  let containerId: string | null = null;
  try {
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    opts.onPhase?.("dependencies");
    workspaceDir = await driver.prepare();
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    opts.onPhase?.("container");
    containerId = await driver.launch(workspaceDir);
    const startedAt = driver.now();
    opts.onPhase?.("readiness");
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    // Readiness deadline begins after launch, not during dependency install.
    let attempts = 0;
    let result: TanstackReadinessDiagnostic["result"] = "no_probe";
    let lastHttpStatus: number | null = null;
    while (driver.now() - startedAt < timeoutMs) {
      if (opts.signal?.aborted) throw new Error("Preview cancelled.");
      attempts++;
      try {
        const response = await driver.probe(containerId);
        if (isTanstackSsrReady(response)) return { containerId, workspaceDir };
        lastHttpStatus = Number.isInteger(response.status) &&
          response.status >= 100 && response.status <= 599 ? response.status : null;
        result = response.status === 200 ? "invalid_html" : "http_status";
      } catch {
        // Never log the underlying exception: it may contain response data.
        result = "transport_error";
      }
      if (opts.signal?.aborted) throw new Error("Preview cancelled.");
      await driver.sleep(Math.min(TANSTACK_PREVIEW_PROBE_INTERVAL_MS,
        Math.max(1, timeoutMs - (driver.now() - startedAt))));
    }
    const diagnostic: TanstackReadinessDiagnostic = {
      result,
      attempts,
      lastHttpStatus,
      elapsedMs: Math.max(0, Math.floor(driver.now() - startedAt)),
    };
    console.warn("RUNNER isolated TanStack readiness timed out", diagnostic);
    throw new TanstackPreviewReadinessError(diagnostic);
  } catch (error) {
    // Cleanup is mandatory even if readiness, installation, or cancellation fails.
    const earlier = error instanceof TanstackPreviewCleanupError ? error : null;
    let containerFailed = false;
    let workspaceFailed = false;
    if (containerId) await driver.destroy(containerId).catch(() => { containerFailed = true; });
    if (workspaceDir) await driver.cleanup(workspaceDir).catch(() => { workspaceFailed = true; });
    if (earlier || containerFailed || workspaceFailed) {
      // Retry ONLY resources that have not been confirmed removed. A failed
      // Docker teardown must never silently turn into a free capacity slot.
      const outstanding = {
        containerId: containerFailed ? containerId : (earlier?.orphan.containerId ?? null),
        workspaceDir: workspaceFailed ? workspaceDir : (earlier?.orphan.workspaceDir ?? null),
      };
      // Recoveries that already succeeded must not be retried; a second
      // workspace deletion might not be idempotent on every storage backend.
      const pending: Array<() => Promise<void>> = [
        ...(earlier ? [() => earlier.recover()] : []),
        ...(containerFailed && containerId ? [containerId].map((id) => () => driver.destroy(id)) : []),
        ...(workspaceFailed && workspaceDir ? [workspaceDir].map((dir) => () => driver.cleanup(dir)) : []),
      ];
      const recover = async () => {
        const results = await Promise.allSettled(pending.map(task => task()));
        for (let i = results.length - 1; i >= 0; i--)
          if (results[i].status === "fulfilled") pending.splice(i, 1);
        if (pending.length) throw new Error("TanStack preview orphan cleanup still incomplete.");
      };
      throw new TanstackPreviewCleanupError(outstanding, recover, error);
    }
    throw error;
  }
}

export async function stopIsolatedTanstackPreview(driver: Pick<TanstackPreviewDriver,"destroy"|"cleanup">,
  handle: TanstackSandboxHandle): Promise<void> {
  let failure: unknown;
  try { await driver.destroy(handle.containerId); }
  catch (error) { failure = error; }
  try { await driver.cleanup(handle.workspaceDir); }
  catch (error) { failure ??= error; }
  if (failure) throw failure;
}
