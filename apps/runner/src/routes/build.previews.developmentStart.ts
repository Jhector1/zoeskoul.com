import type { Request, RequestHandler } from "express";
import { assertZoebuildPreviewAdmissionOpen, ZoebuildPreviewMaintenanceError } from "../services/build/zoebuildPreviewAdmission.js";
import { TanstackPreviewHmrSourceCompatibilityError } from "../services/build/tanstackPreviewRuntimePolicy.js";
import {
  parseTrustedBuildJobRequest,
  type ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { authorizeTanstackPreviewSource, assertTanstackPreviewStartupEnabled } from
  "../services/build/tanstackPreviewSourceAuthorization.js";
import { assertCurrentTanstackSavedSourceAtZoeBuild } from
  "../services/build/tanstackSavedSourceAuthorityClient.js";
import { resolveTanstackPreviewIdentity } from
  "../services/build/tanstackPreviewIdentity.js";
import { startAdmittedTanstackDevelopmentPreview } from
  "../services/build/tanstackPreviewSharedLifecycle.js";

import { RunnerWorkspaceCapacityError } from "../services/workspace/workspacePolicy.js";
import { previewObservability } from "../services/build/previewObservability.js";

const ACTOR_KEY = /^u:[0-9a-f]{64}$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type FailureStage = "dependency_authorization" | "saved_source_authority" |
  "runtime_identity" | "lease_admission" | "capacity" | "driver_validation" |
  "recovery_journal" | "workspace" | "dependencies" | "container" |
  "readiness" | "saved_source_recheck";

function failureCategory(stage: FailureStage, error: unknown) {
  if (error instanceof TanstackPreviewHmrSourceCompatibilityError)
    return "source_hmr_incompatible";
  if (stage === "saved_source_authority" || stage === "saved_source_recheck")
    return "source_authority_rejected";
  if (stage === "runtime_identity") return "runtime_identity_failed";
  if (stage === "lease_admission") return "lease_or_reattachment";
  if (stage === "capacity") return "capacity_rejected";
  if (stage === "driver_validation") return "driver_validation_failed";
  if (stage === "recovery_journal") return "recovery_journal_failed";
  if (stage === "workspace") return "workspace_failed";
  if (stage === "dependencies") return "dependencies_failed";
  if (stage === "container") return "container_failed";
  if (stage === "readiness") return "readiness_failed";
  return "startup_failed";
}
type Preview = Awaited<ReturnType<typeof startAdmittedTanstackDevelopmentPreview>>;
type Dependencies = Readonly<{
  enabled: () => boolean;
  startupEnabled: () => void;
  actorKey: (req: Request) => string;
  parse: (body: unknown) => ProductionBuildJobRequestV1;
  verifySignedLock: (request: ProductionBuildJobRequestV1) => void;
  assertSavedSource: (actorKey: string, request: ProductionBuildJobRequestV1) => Promise<void>;
  resolveIdentity: (request: ProductionBuildJobRequestV1) =>
    Promise<Parameters<typeof startAdmittedTanstackDevelopmentPreview>[0]["identity"]>;
  start: (input: Parameters<typeof startAdmittedTanstackDevelopmentPreview>[0]) => Promise<Preview>;
}>;

const productionDeps: Dependencies = {
  enabled: () => process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_START_ENABLED === "true",
  startupEnabled: assertTanstackPreviewStartupEnabled,
  actorKey: getRequiredActorKey,
  parse: (body) => {
    const candidate = parseTrustedBuildJobRequest(body);
    // The trusted parser also accepts dependency-lock-bootstrap requests.
    // Startup is restricted to authorized production-build source only.
    if (candidate.operation !== "production-build") {
      throw new Error("Development startup requires production-build source.");
    }
    return candidate;
  },
  verifySignedLock: authorizeTanstackPreviewSource,
  assertSavedSource: assertCurrentTanstackSavedSourceAtZoeBuild,
  resolveIdentity: resolveTanstackPreviewIdentity,
  start: startAdmittedTanstackDevelopmentPreview,
};

/** Phase 4D private startup. Normal requireServiceAuth middleware precedes
 * this route. No browser/Next.js route calls it until the Phase 4E transport
 * and acceptance work has been validated. ALL submitted bytes are verified
 * against the DB; the signed dependency lock is checked independently.
 */
export function makeTanstackDevelopmentStartRoute(
  deps: Dependencies = productionDeps,
): RequestHandler {
  return async (req, res) => {
    if (!deps.enabled()) return res.status(404).json({ok:false,code:"NOT_FOUND"});
    try { deps.startupEnabled(); }
    catch { return res.status(404).json({ok:false,code:"NOT_FOUND"}); }
    let actorKey: string;
    let request: ProductionBuildJobRequestV1;
    const requestId = req.header("x-request-id")?.trim();
    try {
      actorKey = deps.actorKey(req);
      if (!ACTOR_KEY.test(actorKey)) throw new Error("Invalid actor identity.");
      request = deps.parse(req.body);
      if (request.operation !== "production-build" ||
          request.stackId !== "tanstack-start-v1" ||
          request.templateId !== "tanstack-start-v1" ||
          !Number.isSafeInteger(request.sourceVersion) || request.sourceVersion < 1)
        throw new Error("Invalid development source.");
    } catch {
      return res.status(400).json({ok:false,code:"INVALID_REQUEST"});
    }
    if (requestId !== undefined && !REQUEST_ID.test(requestId))
      return res.status(400).json({ok:false,code:"INVALID_REQUEST"});
    const telemetry = previewObservability.beginNativeStartup();
    let outcome: "ok" | "error" = "error";
    let stage: FailureStage = "dependency_authorization";
    try {
      // Never allocate a Docker sandbox without current DB authority.
      assertZoebuildPreviewAdmissionOpen();
      deps.verifySignedLock(request);
      stage = "saved_source_authority";
      await previewObservability.measureStartupDetail("native_source_authority", () => deps.assertSavedSource(actorKey, request));
      stage = "runtime_identity";
      const identity = await previewObservability.measureStartupDetail("native_runtime_identity", () => deps.resolveIdentity(request));
      // The lifecycle rechecks the DB before launch AND after readiness.
      stage = "lease_admission";
      assertZoebuildPreviewAdmissionOpen();
      const preview = await deps.start({
        ownerKey:actorKey, request, identity, telemetry,
        authorize:async (ownerKey, candidate) => {
          stage = "saved_source_recheck";
          deps.verifySignedLock(candidate);
          await previewObservability.measureStartupDetail("native_source_recheck", () => deps.assertSavedSource(ownerKey,candidate));
          stage = "lease_admission";
        },
        onPhase:(phase) => { stage = phase === "queued" ? "lease_admission" : phase; },
      });
      // This remains private to the service-to-service client. The legacy
      // browser capability routes explicitly exclude development leases.
      outcome = "ok";
      return res.status(200).json({ok:true,preview});
    } catch (error) {
      if (error instanceof ZoebuildPreviewMaintenanceError)
        return res.status(503).json({ok:false,code:"PREVIEW_MAINTENANCE"});
      if (error instanceof RunnerWorkspaceCapacityError) {
        console.warn("RUNNER development preview capacity rejected", {
          requestCorrelation: requestId ?? "unavailable", stage, code: error.code, status: 503,
          ...(error.disk ? {disk:error.disk} : {}),
        });
        return res.status(503).json({ok:false,code:error.code});
      }
      console.warn("RUNNER development preview start failed", {
        requestCorrelation: requestId ?? "unavailable",
        stage,
        category: failureCategory(stage, error),
        status: 503,
      });
      // No source bytes, dependency approvals or Docker internals in errors.
      return res.status(503).json({ok:false,code:"DEVELOPMENT_START_UNAVAILABLE"});
    } finally {
      telemetry.finish(outcome);
    }
  };
}

export const startTanstackDevelopmentPreviewRoute = makeTanstackDevelopmentStartRoute();
