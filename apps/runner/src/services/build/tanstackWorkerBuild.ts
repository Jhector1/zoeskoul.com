import { randomUUID } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { cleanupWorkspaceNow } from "../workspace/cleanupWorkspace.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { executeBuildStep } from "./executeProductionBuild.js";
import { readTanstackWorkerArtifact } from "./tanstackWorkerArtifact.js";

/**
 * Service-authenticated isolated Worker compilation. Never a deploy/publish
 * operation. The control plane must enforce project ownership, canonical
 * source and source-version CAS before invoking this trusted Runner endpoint.
 * No commands, environment or Docker settings are accepted from the request.
 */

export async function executeTanstackWorkerBuild(
  request: ProductionBuildJobRequestV1,
) {
  assertTanstackWorkerBuildRequest(request);
  const workspaceDir = await createWorkspace([...request.files]);
  const runId = randomUUID();
  try {
    await ensureWorkspaceWritableForShellUser(workspaceDir);
    // Never accept argv, env, Docker options or output names from the caller.
    // Strict cleanup makes a leaked build container a failed verification.
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
      step: "install", strictCleanup: true, tanstackRunId: runId });
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "exec", "vite", "build"],
      step: "build", strictCleanup: true, tanstackRunId: runId });
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "exec", "tsc", "--noEmit"],
      step: "build", strictCleanup: true, tanstackRunId: runId });
    const artifact = await readTanstackWorkerArtifact(workspaceDir);
    return { protocolVersion: request.protocolVersion, operation: "production-build" as const,
      buildProjectId: request.buildProjectId, sourceVersion: request.sourceVersion,
      artifact };
  } finally {
    // A failed workspace removal must propagate: never mark the build verified.
    await cleanupWorkspaceNow(workspaceDir);
  }
}
