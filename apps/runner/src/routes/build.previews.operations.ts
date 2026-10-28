import type { RequestHandler } from "express";
import { createHash } from "node:crypto";
import { parseTrustedBuildJobRequest } from "@zoeskoul/build-executor-contracts";
import type { ProductionBuildJobRequestV1 } from "@zoeskoul/build-executor-contracts";
import { env } from "../lib/env.js";
import path from "node:path";
import { getRequiredActorKey } from "../middleware/serviceAuth.js";
import { startReactPreview, stopReactPreview } from "../services/build/reactPreviewRuntime.js";
import { FilePreviewOperationJournal, PreviewOperationRegistry } from "../services/build/reactPreviewOperations.js";

const journal = new FilePreviewOperationJournal(path.join(env.workspaceRoot, ".zoebuild-preview-operations"));
const operations = new PreviewOperationRegistry<ProductionBuildJobRequestV1>(journal,
  ({ actorKey, request, signal, onPhase }) => startReactPreview({ ownerKey: actorKey, request, signal, onPhase }),
  async (actorKey, previewId) => { await stopReactPreview({ ownerKey: actorKey, previewId }); },
  request => ({ buildProjectId: request.buildProjectId, sourceVersion: request.sourceVersion,
    fingerprint: createHash("sha256").update(JSON.stringify({ stackId: request.stackId, templateId: request.templateId,
      files: request.files })).digest("hex") }),
);

export const startBuildPreviewOperationRoute: RequestHandler = async (req, res) => {
  try {
    const actorKey = getRequiredActorKey(req);
    const request = parseTrustedBuildJobRequest(req.body);
    if (request.operation !== "production-build") return res.status(400).json({ ok:false, error:"Invalid preview build request." });
    const operation = await operations.start(actorKey, request);
    return res.status(operation.state === "ready" ? 200 : 202).json({ ok:true, operation });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "";
    return res.status(msg === "Preview source is stale." ? 409 :
      /Runner is busy|Too many active sessions/.test(msg) ? 429 : 503)
      .json({ ok:false, error:msg === "Preview source is stale." ? msg : "Preview operation could not be accepted." });
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
