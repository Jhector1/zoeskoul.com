import type { Request, RequestHandler } from "express";
import {
  parseTrustedBuildJobRequest,
  type ProductionBuildJobRequestV1,
} from "@zoeskoul/build-executor-contracts";

import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { sharedFullStackPreviews } from "../services/build/sharedPreviewRegistry.js";
import { trustedTanstackDevelopmentSources } from "../services/build/tanstackDevelopmentSourceStore.js";
import { trustedTanstackDevelopmentWorkspaces } from "../services/build/tanstackDevelopmentWorkspaceStore.js";
import { updateCanonicalTanstackDevelopmentPreview } from "../services/build/tanstackDevelopmentCanonicalUpdate.js";
import { DevelopmentPreviewUpdateFailure } from "../services/build/tanstackDevelopmentPreviewUpdate.js";
import { authorizeTanstackPreviewSource } from "../services/build/tanstackPreviewSourceAuthorization.js";
import { assertCurrentTanstackSavedSourceAtZoeBuild } from "../services/build/tanstackSavedSourceAuthorityClient.js";

/**
 * Phase 4C: authenticated Runner-side development update entrypoint.
 * The global requireServiceAuth middleware MUST run before this route.
 * ZoeBuild's separate DB-backed source authority is required at BOTH checks
 * inside the canonical coordinator. Any authority outage fails closed.
 *
 * This route does NOT mint development leases, enable browser HMR, alter the
 * existing /sync restart path, or expose any immutable preview for mutation.
 * It remains off until the full Ubuntu security/transport acceptance passes.
 */
const PREVIEW_ID = /^preview_[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTOR_KEY = /^u:[0-9a-f]{64}$/;

type UpdateResult = Readonly<{
  action: "updated" | "restart_required";
  sourceVersion: number;
  reason: string;
  changedPaths: readonly string[];
}>;

type Dependencies = Readonly<{
  enabled: () => boolean;
  actorKey: (req: Request) => string;
  parse: (body: unknown) => ReturnType<typeof parseTrustedBuildJobRequest>;
  readLease: (previewId: string) => Readonly<{
    mode?: "immutable" | "development";
    ownerKey: string;
    buildProjectId: string;
    sourceVersion: number;
    basePath: string;
  }> | null | undefined;
  verifySignedLock: (request: ProductionBuildJobRequestV1) => void;
  assertSavedSource: (actorKey: string, request: ProductionBuildJobRequestV1) => Promise<void>;
  commit: (input: Readonly<{
    previewId: string;
    actorKey: string;
    next: ProductionBuildJobRequestV1;
    authorizeCurrentSavedSource: (actorKey: string, request: ProductionBuildJobRequestV1) => Promise<void>;
  }>) => Promise<UpdateResult>;
}>;

const productionDeps: Dependencies = {
  enabled: () => process.env.ZOEBUILD_DEVELOPMENT_PREVIEW_UPDATE_ENABLED === "true",
  actorKey: getRequiredActorKey,
  parse: parseTrustedBuildJobRequest,
  readLease: id => sharedFullStackPreviews.get(id),
  verifySignedLock: authorizeTanstackPreviewSource,
  assertSavedSource: assertCurrentTanstackSavedSourceAtZoeBuild,
  commit: input => updateCanonicalTanstackDevelopmentPreview({
    ...input,
    registry: sharedFullStackPreviews,
    sources: trustedTanstackDevelopmentSources,
    workspaces: trustedTanstackDevelopmentWorkspaces,
  }),
};

/** DI is used only to exercise the HTTP boundary without Docker or a DB.
 * Production always uses the private Runner stores above. */
export function makeTanstackDevelopmentUpdateRoute(
  deps: Dependencies = productionDeps,
): RequestHandler {
  return async (req, res) => {
    // Even a legitimate Runner caller receives no development functionality
    // unless a separate operator-controlled flag is explicitly enabled.
    if (!deps.enabled()) return res.status(404).json({ ok: false, code: "NOT_FOUND" });

    let actorKey: string;
    let next: ProductionBuildJobRequestV1;
    try {
      actorKey = deps.actorKey(req);
      if (!ACTOR_KEY.test(actorKey)) throw new Error("Invalid actor identity.");
      const parsed = deps.parse(req.body);
      if (parsed.operation !== "production-build" ||
          parsed.stackId !== "tanstack-start-v1" ||
          parsed.templateId !== "tanstack-start-v1")
        throw new Error("Invalid TanStack development source.");
      next = parsed;
    } catch {
      return res.status(400).json({ ok: false, code: "INVALID_REQUEST" });
    }

    const previewId = String(req.params.previewId ?? "");
    if (!PREVIEW_ID.test(previewId))
      return res.status(404).json({ ok: false, code: "NOT_FOUND" });

    // Do not invoke the mutation coordinator for missing, quarantined,
    // immutable, cross-owner, or cross-project leases. The coordinator also
    // rechecks these invariants inside its exclusive per-lease update slot.
    const lease = deps.readLease(previewId);
    if (!lease || lease.mode !== "development" ||
        lease.basePath.startsWith("/quarantined/") ||
        lease.ownerKey !== actorKey ||
        lease.buildProjectId !== next.buildProjectId)
      return res.status(404).json({ ok: false, code: "NOT_FOUND" });
    if (!Number.isSafeInteger(next.sourceVersion) ||
        next.sourceVersion !== lease.sourceVersion + 1)
      return res.status(409).json({ ok: false, code: "STALE_REVISION" });

    try {
      // A cryptographically approved dependency set is mandatory even for a
      // source-only update. Revalidated again inside the coordinator.
      deps.verifySignedLock(next);
      const result = await deps.commit({
        previewId, actorKey, next,
        // Called by Phase 3F before AND after the Docker write. Never cache
        // this result or replace the authoritative callback with a one-off
        // admission check. A newly saved version must reject the old one.
        authorizeCurrentSavedSource: async (candidateActor, candidate) => {
          deps.verifySignedLock(candidate);
          await deps.assertSavedSource(candidateActor, candidate);
        },
      });
      if (result.action === "restart_required")
        return res.status(409).json({ ok: false, code: "RESTART_REQUIRED",
          sourceVersion: result.sourceVersion });
      return res.status(200).json({ ok: true, action: "updated",
        sourceVersion: result.sourceVersion });
    } catch (error) {
      if (error instanceof DevelopmentPreviewUpdateFailure) {
        return res.status(503).json({ok:false,code:error.category === "quarantined" ?
          "UPDATE_QUARANTINED" : "UPDATE_PRE_WRITE_AUTHORITY_FAILED"});
      }
      const message = error instanceof Error ? error.message : "";
      // Do not expose signed approvals, source bytes, filesystem paths, or
      // private DB/authority error details through an HTTP response.
      if (message === "Preview not found." || message === "Forbidden.")
        return res.status(404).json({ ok: false, code: "NOT_FOUND" });
      if (message === "Preview source is stale.")
        return res.status(409).json({ ok: false, code: "STALE_REVISION" });
      return res.status(503).json({ ok: false, code: "UPDATE_UNAVAILABLE" });
    }
  };
}

export const updateTanstackDevelopmentPreviewRoute = makeTanstackDevelopmentUpdateRoute();
