import type { RequestHandler } from "express";
import { parseTrustedBuildJobRequest } from "@zoeskoul/build-executor-contracts";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { env } from "../lib/env.js";
import path from "node:path";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { reuseAdmittedTanstackPreview, startAdmittedTanstackPreview, stopAdmittedTanstackPreview, verifyAdmittedTanstackPreviewReady } from "../services/build/tanstackPreviewSharedLifecycle.js";
import { authorizeTanstackPreviewSource, assertTanstackPreviewStartupEnabled } from "../services/build/tanstackPreviewSourceAuthorization.js";
import { FilePreviewOperationJournal, PreviewOperationRegistry } from "../services/build/previewOperationJournal.js";
import { resolveTanstackPreviewIdentity, type TanstackPreviewIdentity } from "../services/build/tanstackPreviewIdentity.js";

const journal = new FilePreviewOperationJournal(path.join(env.workspaceRoot, ".zoebuild-preview-operations"));
type OperationRequest = Readonly<{
  request: ProductionBuildJobRequestV1;
  identity: TanstackPreviewIdentity;
}>;

const operations = new PreviewOperationRegistry<OperationRequest>(journal,
  ({ actorKey, request: admitted, signal, onPhase, telemetry }) => {
    // The queued worker revalidates the trusted signed-lock contract even
    // after the authenticated HTTP admission gate has returned 202.
    assertTanstackPreviewStartupEnabled();
    authorizeTanstackPreviewSource(admitted.request);
    return startAdmittedTanstackPreview({ ownerKey: actorKey, request:admitted.request,
      identity:admitted.identity,signal,onPhase,telemetry,
      authorize: async (_ownerKey, source) => authorizeTanstackPreviewSource(source) });
  },
  async (actorKey, previewId) => {
    // There are no new React/Vite operation leases in the TanStack-only pool.
    // Unknown leases fail closed instead of attempting a legacy fallback.
    await stopAdmittedTanstackPreview(actorKey, previewId);
  },
  admitted => ({buildProjectId:admitted.request.buildProjectId,
    sourceVersion:admitted.request.sourceVersion,fingerprint:admitted.identity.fingerprint}),
  undefined,
  undefined,
  ({actorKey,request:admitted,telemetry}) => reuseAdmittedTanstackPreview({
    ownerKey:actorKey,request:admitted.request,identity:admitted.identity,telemetry,
    authorize:async (_ownerKey,source) => authorizeTanstackPreviewSource(source),
  }),
  ({actorKey,preview}) => verifyAdmittedTanstackPreviewReady({ownerKey:actorKey,preview}),
);

export const startBuildPreviewOperationRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const request = parseTrustedBuildJobRequest(req.body);
    if (request.operation !== "production-build") return res.status(400).json({ ok:false, error:"Invalid preview build request." });
    // Fail closed before allocating a journal entry or Docker resources.
    if (request.stackId !== "tanstack-start-v1" || request.templateId !== "tanstack-start-v1")
      return res.status(400).json({ ok:false, error:"Unsupported preview project stack." });
    assertTanstackPreviewStartupEnabled();
    authorizeTanstackPreviewSource(request);
    const identity = await resolveTanstackPreviewIdentity(request);
    const operation = await operations.start(actorKey, {request,identity});
    return res.status(operation.state === "ready" ? 200 : 202).json({ ok:true, operation });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    const code = msg === "Preview source is stale." ? "PREVIEW_NEWER_OPERATION" :
      /Runner is busy|Too many active sessions/.test(msg) ? "PREVIEW_CAPACITY" : "PREVIEW_START_FAILED";
    return res.status(msg === "Preview source is stale." ? 409 :
      /Runner is busy|Too many active sessions/.test(msg) ? 429 : 503)
      .json({ok:false,code,error:msg === "Preview source is stale." ? msg : "Preview operation could not be accepted."});
  }
};

export const statusBuildPreviewOperationRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const operation = await operations.status(String(req.params.operationId), actorKey, String(req.body?.buildProjectId ?? ""));
    if (!operation) return res.status(404).json({ ok:false, error:"Preview operation not found." });
    return res.status(200).json({ok:true, operation});
  } catch { return res.status(503).json({ok:false, error:"Preview status unavailable."}); }
};

export const cancelBuildPreviewOperationRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const cancelled = await operations.cancel(String(req.params.operationId), actorKey, String(req.body?.buildProjectId ?? ""));
    return res.status(cancelled ? 200 : 404).json({ok: cancelled});
  } catch { return res.status(503).json({ok:false, error:"Could not cancel preview operation."}); }
};

export async function pruneBuildPreviewOperationJournals() { await journal.prune(); }
