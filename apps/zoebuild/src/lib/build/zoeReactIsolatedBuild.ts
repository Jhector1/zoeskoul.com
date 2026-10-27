import "server-only";

import { createHash } from "node:crypto";
import {
  createRegisteredProductionBuildJob,
  BuildPreparationError,
} from "@zoeskoul/build-preparation";
import type { WorkspaceStateV2 } from "@zoeskoul/learner-workspace/ide/types";
import type { ProductionBuildExecutionResponseV1 } from "@zoeskoul/build-executor-contracts";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { executeTrustedProductionBuildAtRunner } from "./buildExecutorValidation";
import { applyZoeEditsToWorkspace, type ZoeSourceEdit } from "./zoeTargetedSourceEdit";
import { parseBuildWorkspaceMutation } from "./buildWorkspaceMutation";

/** A build is verified ONLY from the existing isolated runner's successful build result. */
export type ZoeReactIsolatedBuildVerification = Readonly<{
  state: "passed" | "failed" | "not-run";
  verificationId: string;
  sourceKind: "candidate" | "saved";
  durationMs: number;
  sourceVersion: number;
  snapshotSha256: string | null;
  artifactSha256: string | null;
  reason: "runner-passed" | "runner-build-rejected" | "capacity" | "unavailable" | "preparation-unavailable"
    | "runner-unauthorized" | "runner-not-found" | "runner-timeout" | "runner-service-error"
    | "runner-transport" | "runner-response-mismatch" | "runner-configuration";
  message: string;
  browser: "not-run";
  /** Sanitized provenance for capacity failures; never a runner URL or exception. */
  capacitySource: "local-hourly-limit" | "runner-busy" | "runner-unavailable" | null;
}>;

type Specification = Parameters<typeof createRegisteredProductionBuildJob>[0]["specification"];

export function prepareZoeIsolatedBuildCandidate(input: Readonly<{
  workspace: WorkspaceStateV2;
  edits: readonly ZoeSourceEdit[];
  buildProjectId: string;
  specification: Specification;
  sourceVersion: number;
  sourceKind?: "candidate" | "saved";
}>) {
  // Applies to an IN-MEMORY copy. This function never writes or mutates the
  // supplied workspace, and cannot extend the canonical edit allowlist.
  // Candidate proposals still require the canonical one-to-five-edit validator.
  // Saved verification is a separate read-only operation on persisted source.
  // Never allow edits to ride along with the saved-source verification path.
  if (input.sourceKind === "saved" && (!Array.isArray(input.edits) || input.edits.length !== 0)) {
    throw new TypeError("Saved build verification must not include source edits.");
  }
  const candidateWorkspace = input.sourceKind === "saved"
    ? parseBuildWorkspaceMutation(input.workspace)
    : applyZoeEditsToWorkspace(input.workspace, input.edits);
  const request = createRegisteredProductionBuildJob({
    buildProjectId: input.buildProjectId,
    specification: input.specification,
    workspace: candidateWorkspace,
    sourceVersion: input.sourceVersion,
  });
  // Snapshot fingerprint covers the exact sorted executor file contents, not
  // just the model's page or an untrusted client-supplied source digest.
  const snapshotSha256 = createHash("sha256")
    .update(JSON.stringify(request.files), "utf8").digest("hex");
  return { request, snapshotSha256 } as const;
}

/**
 * Compilation is a separate non-AI runner action. It never publishes artifacts,
 * creates a Preview session, modifies project source, or requests another model.
 */
export async function verifyZoeReactCandidateAtRunner(input: Readonly<{
  userId: string;
  buildProjectId: string;
  workspace: WorkspaceStateV2;
  edits: readonly ZoeSourceEdit[];
  specification: Specification;
  sourceVersion: number;
  sourceKind?: "candidate" | "saved";
  correlationId?: string;
  // Injectable trusted dependencies for executable tests (never browser inputs).
  dependencies?: Readonly<{
    limit: typeof rateLimit;
    actorKey: typeof requireRunnerActorKey;
    build: typeof executeTrustedProductionBuildAtRunner;
  }>;
}>): Promise<ZoeReactIsolatedBuildVerification> {
  const { sourceVersion } = input;
  const sourceKind = input.sourceKind === "saved" ? "saved" : "candidate";
  const verificationId = input.correlationId ?? crypto.randomUUID();
  const startedAt = Date.now();
  const reasonMessages: Readonly<Record<ZoeReactIsolatedBuildVerification["reason"], string>> = {
    "runner-passed": "Compiled in the isolated runner. Browser appearance and navigation have not been checked.",
    "runner-build-rejected": "The isolated runner rejected compilation. No project source or Preview was modified.",
    "capacity": "Build verification has reached its capacity limit. No build was run.",
    "unavailable": "Build verification did not complete; compilation was not confirmed.",
    "preparation-unavailable": "Build inputs could not be prepared for the isolated runner.",
    "runner-unauthorized": "The runner rejected build authorization. Check runner service credentials and deployment.",
    "runner-not-found": "The configured runner does not expose the expected production-build operation.",
    "runner-timeout": "The runner request timed out. Compilation was not confirmed.",
    "runner-service-error": "The runner reported a server-side error. Compilation was not confirmed.",
    "runner-transport": "The runner could not be reached or its response could not be read.",
    "runner-response-mismatch": "The runner response did not match the requested project, source version, or artifact contract.",
    "runner-configuration": "The runner endpoint is not configured correctly.",
  };
  const response = (state: ZoeReactIsolatedBuildVerification["state"],
    reason: ZoeReactIsolatedBuildVerification["reason"],
    snapshotSha256: string | null = null,
    artifactSha256: string | null = null,
    capacitySource: ZoeReactIsolatedBuildVerification["capacitySource"] = null): ZoeReactIsolatedBuildVerification => {
      const durationMs = Math.max(0, Date.now() - startedAt);
      // A request identifier, bounded reason code, and duration only. Never log
      // workspace contents, runner stderr, actor key, source text, or response body.
      console.info("[ZoeBuild isolated build verification]", {
        verificationId, sourceKind, reason, state, sourceVersion, durationMs, capacitySource,
      });
      return {
        state, reason, sourceVersion, sourceKind, verificationId, durationMs,
        snapshotSha256, artifactSha256, browser: "not-run", capacitySource,
        message: reasonMessages[reason] + ` Reference: ${verificationId}.`,
      };
    };
  let candidate: ReturnType<typeof prepareZoeIsolatedBuildCandidate>;
  try {
    candidate = prepareZoeIsolatedBuildCandidate(input);
  } catch (error) {
    // A rejected build preparation is NOT evidence of a Vite compiler failure.
    if (error instanceof BuildPreparationError) return response("not-run", "preparation-unavailable");
    throw error; // Source/edit validation failures must keep their existing fail-closed behavior.
  }
  const { snapshotSha256, request } = candidate;
  const deps = input.dependencies ?? {
    limit: rateLimit, actorKey: requireRunnerActorKey, build: executeTrustedProductionBuildAtRunner,
  };
  const limited = await deps.limit(
    `zoebuild-react-edit-build:${input.userId}:${input.buildProjectId}`,
    { bucket: "zoebuild-react-edit-build", limit: 8, window: "1 h" },
  ).catch(() => null);
  if (!limited) return response("not-run", "unavailable", snapshotSha256);
  if (!limited.ok) return response("not-run", "capacity", snapshotSha256, null, "local-hourly-limit");
  try {
    const actorKey = await deps.actorKey(input.userId);
    const execution: ProductionBuildExecutionResponseV1 = await deps.build({actorKey, request});
    const result = execution?.result;
    if (!execution?.ok || !result || result.operation !== "production-build" ||
      result.buildProjectId !== input.buildProjectId ||
      result.sourceVersion !== sourceVersion ||
      !result.artifact || result.artifact.type !== "static-directory" ||
      result.artifact.outputPath !== "dist" ||
      !/^[a-f0-9]{64}$/i.test(result.artifact.sha256)) {
      return response("not-run", "runner-response-mismatch", snapshotSha256);
    }
    // Artifacts are deliberately discarded here. Publishing and Preview remain
    // separate, owner-authorized operations with their own source-version gates.
    return response("passed", "runner-passed", snapshotSha256, result.artifact.sha256);
  } catch (error) {
    if (error instanceof RunnerHttpError && [400, 422].includes(error.status)) {
      // Do not forward runner stderr/source or exception bodies to the browser:
      // these can contain arbitrary project text, tokens, or credentials.
      return response("failed", "runner-build-rejected", snapshotSha256);
    }
    if (error instanceof RunnerHttpError) {
      const status = error.status;
      if (status === 401 || status === 403) return response("not-run", "runner-unauthorized", snapshotSha256);
      if (status === 404 || status === 405) return response("not-run", "runner-not-found", snapshotSha256);
      if (status === 408 || status === 504) return response("not-run", "runner-timeout", snapshotSha256);
      if (status === 429) return response("not-run", "capacity", snapshotSha256, null, "runner-busy");
      if (status === 503) return response("not-run", "capacity", snapshotSha256, null, "runner-unavailable");
      if (status >= 500 && status <= 599) return response("not-run", "runner-service-error", snapshotSha256);
      return response("not-run", "unavailable", snapshotSha256);
    }
    if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
      return response("not-run", "runner-timeout", snapshotSha256);
    // Configuration errors are generated by our own runner client; never
    // forward or log arbitrary exception messages from a transport or website.
    if (error instanceof Error && (error.message === "Missing RUNNER_BASE_URL" ||
      error.message.startsWith("RUNNER_BASE_URL must start with http")))
      return response("not-run", "runner-configuration", snapshotSha256);
    return response("not-run", "runner-transport", snapshotSha256);
  }
}
