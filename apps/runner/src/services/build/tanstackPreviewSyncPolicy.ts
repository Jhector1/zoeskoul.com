import { TANSTACK_PREVIEW_RESTART_REQUIRED, type ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import type { FullStackPreviewLease } from "./sharedPreviewRegistry.js";

/** TanStack SSR previews run from immutable isolated workspace snapshots.
 * No live overwrite is supported. Verify the exact lease and caller before
 * the browser is instructed to retire its capability and start a new lease.
 * The old container is NOT stopped here: the authenticated client owns the
 * cancel → start handshake and the Runner continues counting its capacity. */
export function requireTanstackPreviewRestart(input: Readonly<{
  lease: Pick<FullStackPreviewLease, "mode" | "ownerKey" | "buildProjectId" | "sourceVersion" | "basePath"> | null;
  ownerKey: string;
  request: ProductionBuildJobRequestV1;
}>): never {
  const { lease, ownerKey, request } = input;
  // The legacy /sync endpoint is an immutable-preview restart signal only.
  // A future development lease must use a distinct, authenticated live path.
  if (!lease || lease.basePath.startsWith("/quarantined/") ||
      lease.mode === "development") throw new Error("Preview not found.");
  if (!ownerKey || lease.ownerKey !== ownerKey) throw new Error("Forbidden.");
  if (lease.buildProjectId !== request.buildProjectId ||
      !Number.isSafeInteger(request.sourceVersion) ||
      request.sourceVersion < lease.sourceVersion) throw new Error("Preview source is stale.");
  if (request.stackId !== "tanstack-start-v1" || request.templateId !== "tanstack-start-v1")
    throw new Error("Invalid TanStack preview identity.");
  throw new Error(TANSTACK_PREVIEW_RESTART_REQUIRED);
}
