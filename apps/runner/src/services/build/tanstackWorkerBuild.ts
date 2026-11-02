import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { cleanupWorkspaceNow } from "../workspace/cleanupWorkspace.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { executeBuildStep } from "./executeProductionBuild.js";
import { readTanstackWorkerArtifact } from "./tanstackWorkerArtifact.js";

/**
 * Staged trusted Runner implementation. Deliberately NOT exposed by the HTTP
 * build or preview routes until tenant isolation and publishing are verified.
 * It accepts no commands, environment values, shell fragments, or credentials
 * from the request. Existing isolated build profiles enforce resource limits.
 */

export async function executeTanstackWorkerBuild(
  request: ProductionBuildJobRequestV1,
) {
  assertTanstackWorkerBuildRequest(request);
  const workspaceDir = await createWorkspace([...request.files]);
  try {
    await ensureWorkspaceWritableForShellUser(workspaceDir);
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"], step: "install" });
    // Use trusted direct argv, not package.json scripts or a shell.
    await executeBuildStep({ workspaceDir, command: ["pnpm", "exec", "vite", "build"], step: "build" });
    await executeBuildStep({ workspaceDir, command: ["pnpm", "exec", "tsc", "--noEmit"], step: "build" });
    const artifact = await readTanstackWorkerArtifact(workspaceDir);
    return { protocolVersion: request.protocolVersion, operation: "production-build" as const,
      buildProjectId: request.buildProjectId, sourceVersion: request.sourceVersion,
      artifact };
  } finally {
    await cleanupWorkspaceNow(workspaceDir);
  }
}
