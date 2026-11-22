import { randomUUID } from "node:crypto";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { assertTanstackWorkerBuildRequest } from "./tanstackWorkerBuildPolicy.js";
import { createWorkspace } from "../workspace/createWorkspace.js";
import { cleanupWorkspaceNow } from "../workspace/cleanupWorkspace.js";
import { ensureWorkspaceWritableForShellUser } from "../workspace/workspacePermissions.js";
import { executeBuildStep } from "./executeProductionBuild.js";
import { readTanstackWorkerArtifact } from "./tanstackWorkerArtifact.js";
import { env } from "../../lib/env.js";
import { createTanstackRecoveryJournal } from "./tanstackPreviewDurableRecovery.js";
import { shouldRunWorkerSmoke, shouldRunReferenceWorkerSmoke, WORKER_REFERENCE_PROJECT, generalWorkerVerificationEnabled, workerVerificationSnapshot } from "./tanstackWorkerRuntimePolicy.js";
import { runTanstackWorkerRuntimeSmoke } from "./tanstackWorkerRuntimeSmoke.js";

/**
 * Service-authenticated isolated Worker compilation. Never a deploy/publish
 * operation. The control plane must enforce project ownership, canonical
 * source and source-version CAS before invoking this trusted Runner endpoint.
 * No commands, environment or Docker settings are accepted from the request.
 */

export async function executeTanstackWorkerBuild(
  request: ProductionBuildJobRequestV1,
  referenceAuthorized = false,
  generalAuthorized = false,
) {
  assertTanstackWorkerBuildRequest(request);
  const reference = referenceAuthorized && shouldRunReferenceWorkerSmoke(request);
  if (referenceAuthorized !== reference || (request.buildProjectId === WORKER_REFERENCE_PROJECT && !reference))
    throw new Error("Reference fixture admission refused.");
  const general = generalAuthorized && generalWorkerVerificationEnabled() && !reference && request.buildProjectId !== WORKER_REFERENCE_PROJECT;
  if (generalAuthorized !== general) throw new Error("General Worker verification admission refused.");
  const pilot = shouldRunWorkerSmoke(request) || reference || general;
  const journal = pilot ? createTanstackRecoveryJournal(env.workspaceRoot) : null;
  if (journal) await journal.write();
  const workspaceDir = await createWorkspace([...request.files, ...(request.binaryFiles ?? [])], {
    ...(journal ? {onWorkspaceAllocated: (dir:string) => journal.write({workspaceDir:dir})} : {}),
  });
  const runId = journal?.runId ?? randomUUID();
  let liveContainer = false;
  const lifecycle = journal ? {
    onContainerCreated: async (id:string) => { liveContainer=true; await journal.write({containerId:id}); },
    onContainerRemoved: async () => { await journal.write({containerId:null}); liveContainer=false; },
  } : {};
  try {
    await ensureWorkspaceWritableForShellUser(workspaceDir);
    // Never accept argv, env, Docker options or output names from the caller.
    // Strict cleanup makes a leaked build container a failed verification.
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "install", "--frozen-lockfile", "--ignore-scripts"],
      step: "install", strictCleanup: true, tanstackRunId: runId, ...lifecycle });
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "exec", "vite", "build"],
      step: "build", strictCleanup: true, tanstackRunId: runId, ...lifecycle });
    await executeBuildStep({ workspaceDir,
      command: ["pnpm", "exec", "tsc", "--noEmit"],
      step: "build", strictCleanup: true, tanstackRunId: runId, ...lifecycle });
    const artifact = await readTanstackWorkerArtifact(workspaceDir);
    const runtimeSmoke = journal ? await runTanstackWorkerRuntimeSmoke({workspaceDir, artifact, runId,
      onContainerCreated: lifecycle.onContainerCreated!, onContainerRemoved: lifecycle.onContainerRemoved!,
      ...(reference ? {reference: true as const} : {}),
      ...(general ? {general: true as const} : {}),
    }) : undefined;
    return { protocolVersion: request.protocolVersion, operation: "production-build" as const,
      buildProjectId: request.buildProjectId, sourceVersion: request.sourceVersion,
      artifact, ...(general ? {snapshotSha256:workerVerificationSnapshot(request)} : {}), ...(runtimeSmoke ? {runtimeSmoke} : {}) };
  } finally {
    // A failed workspace removal must propagate: never mark the build verified.
    if (liveContainer || journal?.current.containerId) {
      throw new Error("Worker build cleanup requires Runner reconciliation.");
    }
    await cleanupWorkspaceNow(workspaceDir);
    if (journal) { await journal.write({workspaceDir:null}); await journal.clear(); }
  }
}
