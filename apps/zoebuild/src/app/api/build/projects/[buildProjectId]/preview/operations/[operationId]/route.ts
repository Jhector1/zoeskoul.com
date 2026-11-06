import { NextResponse } from "next/server";
import { RunnerHttpError } from "@zoeskoul/platform-server/server/runnerClient";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { requireOwnedReactPreviewProject, ReactPreviewRequestError } from "@/lib/build/reactPreviewServer";
import { getTrustedReactPreviewOperationAtRunner } from "@/lib/build/reactPreviewRunnerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const OPERATION_ID_PATTERN = /^preview_op_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function json(requestId: string, body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(_req: Request, ctx: {params: Promise<{ buildProjectId: string; operationId: string }>}) {
  const requestId = crypto.randomUUID();
  const access = await loadCurrentBuildAccessSnapshot();
  if (!access.userId) return json(requestId, {ok:false, code:"BUILD_AUTH_REQUIRED", message:"Unauthorized."}, 401);
  const { buildProjectId, operationId } = await ctx.params;
  if (!OPERATION_ID_PATTERN.test(operationId)) return json(requestId,
    {ok:false, code:"BUILD_PREVIEW_OPERATION_INVALID", message:"Invalid preview operation."}, 400);
  try {
    const project = await requireOwnedReactPreviewProject({ access, buildProjectId });
    const actorKey = await requireRunnerActorKey(access.userId);
    const operation = await getTrustedReactPreviewOperationAtRunner({ actorKey, operationId, buildProjectId });
    // Runner journal lookup uses a hashed actor identity. The project identity
    // and saved-source token are checked here, including *after* document fetch.
    if (operation.sourceVersion !== project.sourceVersion) return json(requestId,
      {ok:false, code:"BUILD_PREVIEW_SOURCE_CONFLICT", message:"The saved project changed while its preview was starting."}, 409);
    if (operation.state !== "ready" || !operation.preview)
      return json(requestId, {ok:true, operation}, 200);
    const preview = operation.preview;
    if (preview.buildProjectId !== buildProjectId || preview.sourceVersion !== project.sourceVersion ||
      !preview.basePath.startsWith(`/api/build/projects/${encodeURIComponent(buildProjectId)}/preview/${encodeURIComponent(preview.previewId)}/content/`))
      return json(requestId, {ok:false, code:"BUILD_PREVIEW_IDENTITY_MISMATCH", message:"Preview identity could not be verified."}, 409);
    // Runner operation status owns the fresh lease health transition. Recheck
    // the project CAS after that bounded probe so a concurrent save cannot
    // publish an older ready operation.
    const afterHealth = await requireOwnedReactPreviewProject({access, buildProjectId});
    if (afterHealth.sourceVersion !== project.sourceVersion) return json(requestId,
      {ok:false, code:"BUILD_PREVIEW_SOURCE_CONFLICT", message:"The saved source changed during preview verification."}, 409);
    return json(requestId, {ok:true, operation}, 200);
  } catch (error) {
    if (error instanceof ReactPreviewRequestError)
      return json(requestId, {ok:false,code:error.code,message:error.message}, error.status);
    if (error instanceof RunnerHttpError) return json(requestId,
      {ok:false,code:error.status===404 ? "BUILD_PREVIEW_OPERATION_EXPIRED" : "BUILD_PREVIEW_RUNNER_UNAVAILABLE",
        message:error.status===404 ? "This preview operation expired. Retry preview." : "Preview runner is unavailable."},
      error.status===404 ? 404 : 503);
    console.error("[ZoeBuild preview operation status] failed", {
      requestId,category:error instanceof Error ? error.name : "unknown",
    });
    return json(requestId, {ok:false,code:"BUILD_PREVIEW_STATUS_FAILED",message:"Preview status is unavailable."}, 503);
  }
}
