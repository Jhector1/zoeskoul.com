import { isTanstackSsrReady, TANSTACK_PREVIEW_READY_TIMEOUT_MS, TANSTACK_PREVIEW_PROBE_INTERVAL_MS } from "./tanstackPreviewRuntimePolicy.js";

/** One lifecycle operation, never a parallel preview registry. Its caller must
 * acquire the EXISTING shared Runner preview-admission lease before invoking.
 * The adapter owns a private workspace and a Docker container per operation. */
export type TanstackSandboxHandle = Readonly<{
  containerId: string;
  workspaceDir: string;
}>;

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
  opts: Readonly<{ signal?: AbortSignal; timeoutMs?: number }> = {}): Promise<TanstackSandboxHandle> {
  const timeoutMs = opts.timeoutMs ?? TANSTACK_PREVIEW_READY_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > TANSTACK_PREVIEW_READY_TIMEOUT_MS)
    throw new Error("Invalid preview readiness deadline.");
  let workspaceDir: string | null = null;
  let containerId: string | null = null;
  try {
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    workspaceDir = await driver.prepare();
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    containerId = await driver.launch(workspaceDir);
    const startedAt = driver.now();
    if (opts.signal?.aborted) throw new Error("Preview cancelled.");
    // Clock guard spans install, container startup and SSR readiness.
    while (driver.now() - startedAt < timeoutMs) {
      if (opts.signal?.aborted) throw new Error("Preview cancelled.");
      try {
        if (isTanstackSsrReady(await driver.probe(containerId))) {
          return { containerId, workspaceDir };
        }
      } catch {
        // A process still booting can refuse localhost HTTP; retry until deadline.
      }
      if (opts.signal?.aborted) throw new Error("Preview cancelled.");
      await driver.sleep(Math.min(TANSTACK_PREVIEW_PROBE_INTERVAL_MS,
        Math.max(1, timeoutMs - (driver.now() - startedAt))));
    }
    throw new Error("Isolated TanStack preview did not become ready.");
  } catch (error) {
    // Cleanup is mandatory even if readiness, installation, or cancellation fails.
    let cleanupFailed = false;
    if (containerId) await driver.destroy(containerId).catch(() => { cleanupFailed = true; });
    if (workspaceDir) await driver.cleanup(workspaceDir).catch(() => { cleanupFailed = true; });
    if (cleanupFailed) throw new Error("TanStack preview failed and sandbox cleanup needs reconciliation.", { cause: error });
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
