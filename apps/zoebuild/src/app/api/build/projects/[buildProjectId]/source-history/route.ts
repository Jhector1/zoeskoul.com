import { NextResponse } from "next/server";
import {
  BuildAccessError, BuildSourceConflictError, getBuildProjectCommand,
  saveBuildProjectSourceCommand,
} from "@zoeskoul/build-application";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { createPrismaBuildProjectSourceWriter } from "@/lib/build/saveBuildProjectSource";
import { BuildWorkspaceMutationError, parseBuildWorkspaceMutation } from "@/lib/build/buildWorkspaceMutation";
import { verifyZoeReactCandidateAtRunner } from "@/lib/build/zoeReactIsolatedBuild";
import { buildRevisionFilePreview, parseRevisionRestoreRequest } from "@/lib/build/sourceRevisionPolicy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = {params: Promise<{buildProjectId: string}>};

function reply(requestId: string, payload: Record<string, unknown>, status = 200) {
  const res = NextResponse.json({...payload, requestId}, {status});
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Request-Id", requestId);
  return res;
}

async function owner(req: Request, ctx: Context) {
  const access = await loadCurrentBuildAccessSnapshot(req, {requireAuthority: true});
  if (!access.userId) return {access, project: null};
  const {buildProjectId} = await ctx.params;
  const project = await getBuildProjectCommand({
    access, buildProjectId, reader: createPrismaBuildProjectReader(prisma),
  });
  return {access, project};
}

/** List metadata only; historical source is fetched on explicit user selection. */
export async function GET(req: Request, ctx: Context) {
  const requestId = crypto.randomUUID();
  try {
    const {access, project} = await owner(req, ctx);
    if (!access.userId) return reply(requestId, {ok:false, code:"BUILD_AUTH_REQUIRED"}, 401);
    if (!project) return reply(requestId, {ok:false, code:"BUILD_PROJECT_NOT_FOUND"}, 404);
    if (project.status === "archived") return reply(requestId, {ok:false, code:"BUILD_PROJECT_ARCHIVED"}, 409);
    const url = new URL(req.url);
    const rawVersion = url.searchParams.get("version");
    if (rawVersion !== null) {
      if (!/^[1-9]\d{0,8}$/.test(rawVersion) || url.searchParams.size !== 1)
        return reply(requestId, {ok:false, code:"BUILD_HISTORY_INPUT_INVALID"}, 400);
      const version = Number(rawVersion);
      const revision = await prisma.codeProjectRevision.findFirst({
        where: {projectId:project.codeProjectId, version},
        select: {version:true, snapshot:true, createdAt:true, note:true},
      });
      if (!revision) return reply(requestId, {ok:false, code:"BUILD_REVISION_NOT_FOUND"}, 404);
      const workspace = parseBuildWorkspaceMutation(revision.snapshot);
      const preview = buildRevisionFilePreview(workspace);
      return reply(requestId, {ok:true, version:revision.version, createdAt:revision.createdAt.toISOString(),
        note:revision.note, preview, currentVersion:project.sourceVersion});
    }
    const records = await prisma.codeProjectRevision.findMany({
      where: {projectId:project.codeProjectId}, orderBy:{version:"desc"}, take:51,
      select:{version:true, note:true, createdAt:true, workspaceHash:true},
    });
    return reply(requestId,{ok:true, currentVersion:project.sourceVersion, hasMore:records.length > 50,
      revisions:records.slice(0,50).map(r => ({version:r.version, note:r.note, createdAt:r.createdAt.toISOString(),
        workspaceHash:r.workspaceHash?.slice(0,12) ?? null}))});
  } catch (error) {
    if (error instanceof BuildAccessError) return reply(requestId, {ok:false,code:error.code},403);
    if (error instanceof BuildWorkspaceMutationError) return reply(requestId,{ok:false,code:"BUILD_REVISION_INVALID"},422);
    console.error("[ZoeBuild source history] read unavailable",{requestId,kind:error instanceof Error?error.name:"unknown"});
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
  }
}

/** Restore creates a NEW revision. It never overwrites or deletes history. */
export async function POST(req: Request, ctx: Context) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) return reply(requestId,{ok:false,code:"BUILD_FORBIDDEN"},403);
  const sizeHeader = Number(req.headers.get("content-length") || "0");
  if (!Number.isFinite(sizeHeader) || sizeHeader > 512) return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  const raw = await req.text();
  if (Buffer.byteLength(raw,"utf8") > 512) return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  let decoded: unknown;
  try {decoded = JSON.parse(raw);} catch {return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);}
  const restore = parseRevisionRestoreRequest(decoded);
  if (!restore) return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  try {
    const {access, project} = await owner(req, ctx);
    if (!access.userId) return reply(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    if (!project) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    if (project.status === "archived") return reply(requestId,{ok:false,code:"BUILD_PROJECT_ARCHIVED"},409);
    if (project.stackId !== "react-vite-v1" || !project.specification)
      return reply(requestId,{ok:false,code:"BUILD_HISTORY_STACK_UNSUPPORTED"},422);
    if (project.sourceVersion !== restore.baseVersion)
      return reply(requestId,{ok:false,code:"BUILD_HISTORY_STALE",message:"A newer version exists. Reload history before restoring."},409);
    const limited = await rateLimit(`zoebuild-source-restore:${access.userId}:${project.buildProjectId}`,
      {bucket:"zoebuild-source-restore",limit:6,window:"1 h"}).catch(() => null);
    if (!limited) return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
    if (!limited.ok) return reply(requestId,{ok:false,code:"BUILD_HISTORY_RATE_LIMITED"},429);
    const revision = await prisma.codeProjectRevision.findFirst({
      where:{projectId:project.codeProjectId,version:restore.restoreVersion}, select:{snapshot:true},
    });
    if (!revision) return reply(requestId,{ok:false,code:"BUILD_REVISION_NOT_FOUND"},404);
    const workspace = parseBuildWorkspaceMutation(revision.snapshot);
    // No model request, no Preview restart and no publish. A historical build
    // is compiled using the current canonical project specification.
    // Historical source is a persisted, complete snapshot, not a proposed edit.
    // Candidate mode rejects an empty edit list before contacting the runner.
    const verification = await verifyZoeReactCandidateAtRunner({
      userId:access.userId,buildProjectId:project.buildProjectId,
      workspace,edits:[],specification:project.specification,
      sourceVersion:project.sourceVersion,sourceKind:"saved",correlationId:requestId,
    });
    if (verification.state !== "passed")
      return reply(requestId,{ok:false,code:"BUILD_RESTORE_BUILD_NOT_VERIFIED",
        message:"The historical version could not be compiled. Nothing was restored.",verification},409);
    const saved = await saveBuildProjectSourceCommand({
      access,buildProjectId:project.buildProjectId,baseVersion:project.sourceVersion,
      workspace,writer:createPrismaBuildProjectSourceWriter(prisma),
    });
    if (!saved) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    if (!saved.changed) return reply(requestId,{ok:false,code:"BUILD_RESTORE_NO_CHANGE",message:"The selected version already matches the current source."},409);
    return reply(requestId,{ok:true,sourceVersion:saved.sourceVersion,
      restoredFromVersion:restore.restoreVersion,changed:saved.changed});
  } catch (error) {
    if (error instanceof BuildSourceConflictError)
      return reply(requestId,{ok:false,code:error.code,message:"A newer version exists. Reload before restoring."},409);
    if (error instanceof BuildAccessError) return reply(requestId,{ok:false,code:error.code},403);
    if (error instanceof BuildWorkspaceMutationError)
      return reply(requestId,{ok:false,code:"BUILD_REVISION_INVALID",message:"This revision cannot be safely restored."},422);
    console.error("[ZoeBuild source history] restore unavailable",{requestId,kind:error instanceof Error?error.name:"unknown"});
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
  }
}
