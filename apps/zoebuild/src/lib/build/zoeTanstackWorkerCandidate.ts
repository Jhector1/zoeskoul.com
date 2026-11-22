import "server-only";

import { createHash } from "node:crypto";
import { createRegisteredProductionBuildJob, BuildPreparationError } from "@zoeskoul/build-preparation";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { RunnerHttpError, type RunnerBuildDiagnostic } from "@zoeskoul/platform-server/server/runnerClient";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { executeTrustedProductionBuildAtRunner } from "./buildExecutorValidation";
import { verifyTanstackWorkerBuildReceipt, TanstackWorkerReceiptError } from "./zoeTanstackWorkerReceipt";
import { applyZoeEditsToWorkspace, type ZoeSourceEdit } from "./zoeTargetedSourceEdit";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";

type Specification = Parameters<typeof createRegisteredProductionBuildJob>[0]["specification"];
type Prepare = typeof createRegisteredProductionBuildJob;

export type TanstackCandidateBuildVerification = Readonly<{
  state: "passed" | "failed" | "not-run";
  reason: "runner-passed" | "runner-build-rejected" | "preparation-unavailable" |
    "capacity" | "unavailable" | "runner-unauthorized" | "runner-not-found" |
    "runner-timeout" | "runner-service-error" | "runner-transport" |
    "runner-response-mismatch" | "runner-configuration";
  sourceVersion: number;
  verificationId: string;
  snapshotSha256: string | null;
  artifactSha256: string | null;
  capacitySource: "local-hourly-limit" | "runner-busy" | "runner-unavailable" | null;
  browser: "not-run";
  runtimeSmoke?: ReturnType<typeof verifyTanstackWorkerBuildReceipt>["runtimeSmoke"];
  buildDiagnostic?: RunnerBuildDiagnostic;
  receiptFailureStage?: string;
  savedArtifactEvidence?: Readonly<{
    artifactBytes: number;
    artifactFiles: number;
    binaryAssets: NonNullable<ReturnType<typeof verifyTanstackWorkerBuildReceipt>["binaryAssets"]>;
  }>;
}>;

/** Exactly the reviewed candidate (never a browser artifact, source digest, or mutable preview). */
export function prepareTanstackWorkerEditCandidate(input: Readonly<{
  workspace: WorkspaceStateV2;
  edits: readonly ZoeSourceEdit[];
  buildProjectId: string;
  specification: Specification;
  sourceVersion: number;
  sourceKind?: "candidate" | "saved";
}>, prepare: Prepare = createRegisteredProductionBuildJob): Readonly<{
  request: ProductionBuildJobRequestV1;
  snapshotSha256: string;
}> {
  if (input.sourceKind === "saved" && (!Array.isArray(input.edits) || input.edits.length !== 0)) {
    throw new TypeError("Saved build verification must not include source edits.");
  }
  const workspace = input.sourceKind === "saved"
    ? parseBuildWorkspaceMutation(input.workspace)
    : applyZoeEditsToWorkspace(input.workspace, input.edits);
  const request = prepare({
    workspace,
    buildProjectId: input.buildProjectId,
    specification: input.specification,
    sourceVersion: input.sourceVersion,
  });
  // The source fingerprint is recomputed from server-owned, sorted executor files.
  // Preserve reviewed candidate fingerprint compatibility; saved verification
  // additionally binds the exact canonical binary handoff.
  const fingerprint = input.sourceKind === "saved"
    ? {files: request.files, binaryFiles: request.binaryFiles ?? []}
    : request.files;
  const snapshotSha256 = createHash("sha256").update(JSON.stringify(fingerprint), "utf8").digest("hex");
  return {request, snapshotSha256};
}

/**
 * Isolated compilation is the sole build authority. No write, publish, deploy,
 * preview, AI call, or saved-history mutation occurs here. The caller must
 * perform a separate owner-scoped, baseVersion-CAS transaction AFTER state=passed.
 */
export async function verifyTanstackWorkerEditCandidate(input: Readonly<{
  userId: string;
  buildProjectId: string;
  workspace: WorkspaceStateV2;
  edits: readonly ZoeSourceEdit[];
  specification: Specification;
  sourceVersion: number;
  sourceKind?: "candidate" | "saved";
  verificationId?: string;
  requireRuntimeReceipt?: boolean;
  /** Server-only dependency injection for executable tests, never HTTP input. */
  dependencies?: Readonly<{
    limit: typeof rateLimit;
    actorKey: typeof requireRunnerActorKey;
    build: typeof executeTrustedProductionBuildAtRunner;
    prepare: Prepare;
  }>;
}>): Promise<TanstackCandidateBuildVerification> {
  const verificationId = input.verificationId ?? crypto.randomUUID();
  const response = (state: TanstackCandidateBuildVerification["state"],
    reason: TanstackCandidateBuildVerification["reason"],
    snapshotSha256: string | null = null,
    artifactSha256: string | null = null,
    capacitySource: TanstackCandidateBuildVerification["capacitySource"] = null): TanstackCandidateBuildVerification => ({
      state, reason, verificationId, sourceVersion: input.sourceVersion,
      snapshotSha256, artifactSha256, capacitySource, browser:"not-run",
    });
  const deps = input.dependencies ?? {
    limit: rateLimit,
    actorKey: requireRunnerActorKey,
    build: executeTrustedProductionBuildAtRunner,
    prepare: createRegisteredProductionBuildJob,
  };
  let candidate: ReturnType<typeof prepareTanstackWorkerEditCandidate>;
  try {
    candidate = prepareTanstackWorkerEditCandidate(input, deps.prepare);
  } catch (error) {
    if (error instanceof BuildPreparationError) return response("not-run", "preparation-unavailable");
    throw error; // Editing/validation errors are not compiler failures.
  }
  const { request, snapshotSha256 } = candidate;
  const limited = await deps.limit(
    `zoebuild-tanstack-edit-build:${input.userId}:${input.buildProjectId}`,
    {bucket:"zoebuild-tanstack-edit-build",limit:8,window:"1 h"},
  ).catch(() => null);
  if (!limited) return response("not-run", "unavailable", snapshotSha256);
  if (!limited.ok) return response("not-run", "capacity", snapshotSha256, null, "local-hourly-limit");
  try {
    const actorKey = await deps.actorKey(input.userId);
    const execution: unknown = await deps.build({actorKey,request});
    const receipt = verifyTanstackWorkerBuildReceipt({request, execution,
      inspectBinaryAssets: input.sourceKind === "saved", requireRuntimeReceipt: input.requireRuntimeReceipt === true});
    const verified = response("passed", "runner-passed", snapshotSha256, receipt.artifactSha256);
    return input.sourceKind === "saved" ? {...verified,
      ...(receipt.runtimeSmoke ? {runtimeSmoke:receipt.runtimeSmoke} : {}), savedArtifactEvidence: {
      artifactBytes: receipt.artifactBytes, artifactFiles: receipt.artifactFiles,
      binaryAssets: receipt.binaryAssets ?? [],
    }} : verified;
  } catch (error) {
    if (error instanceof TanstackWorkerReceiptError) {
      const denied = response("not-run", "runner-response-mismatch", snapshotSha256);
      if (input.sourceKind === "saved" && input.sourceVersion === 7 &&
          input.buildProjectId === "cmwqiqnly0002eldlcafn1xjx" &&
          process.env.NODE_ENV === "development" &&
          process.env.AI4B4E2P_BROWSER_CONFIRM === "LOCAL_BROWSER_ONLY" &&
          process.env.AI4B4E2E_CONFIRM === "EPHEMERAL_ONLY" &&
          process.env.AI4B4E2E_TEST_DATABASE_NAME === "zoebuild_ai4b4e2e_test_13c8dff8ffe2" &&
          process.env.ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID === input.buildProjectId &&
          process.env.ZOEBUILD_PUBLISH_ENABLED === "0") {
        return {...denied, receiptFailureStage: error.stage};
      }
      return denied;
    }
    if (error instanceof RunnerHttpError) {
      const status = error.status;
      if ([400, 422].includes(status)) {
        return {...response("failed", "runner-build-rejected", snapshotSha256),
          ...(error.buildDiagnostic ? {buildDiagnostic:error.buildDiagnostic} : {})};
      }
      if ([401, 403].includes(status)) return response("not-run", "runner-unauthorized", snapshotSha256);
      if ([404, 405].includes(status)) return response("not-run", "runner-not-found", snapshotSha256);
      if ([408, 504].includes(status)) return {...response("not-run", "runner-timeout", snapshotSha256),
        ...(error.buildDiagnostic ? {buildDiagnostic:error.buildDiagnostic} : {})};
      if (status === 429) return response("not-run", "capacity", snapshotSha256, null, "runner-busy");
      if (status === 503) return response("not-run", "capacity", snapshotSha256, null, "runner-unavailable");
      if (status >= 500) return {...response("not-run", "runner-service-error", snapshotSha256),
        ...(error.buildDiagnostic ? {buildDiagnostic:error.buildDiagnostic} : {})};
      return response("not-run", "unavailable", snapshotSha256);
    }
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
      return response("not-run", "runner-timeout", snapshotSha256);
    if (error instanceof Error && (error.message === "Missing RUNNER_BASE_URL" ||
      error.message.startsWith("RUNNER_BASE_URL must start with http")))
      return response("not-run", "runner-configuration", snapshotSha256);
    return response("not-run", "runner-transport", snapshotSha256);
  }
}
