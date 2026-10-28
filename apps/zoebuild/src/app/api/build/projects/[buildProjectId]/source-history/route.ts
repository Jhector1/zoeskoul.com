import { NextResponse } from "next/server";
import { Prisma } from "@zoeskoul/db";
import {
  BuildAccessError, BuildSourceConflictError, getBuildProjectCommand,
} from "@zoeskoul/build-application";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { BuildWorkspaceMutationError, parseBuildWorkspaceMutation } from "@/lib/build/buildWorkspaceMutation";
import { verifyZoeReactCandidateAtRunner } from "@/lib/build/zoeReactIsolatedBuild";
import { buildRevisionFilePreview, parseRevisionRestoreRequest } from "@/lib/build/sourceRevisionPolicy";
import { restoreSavedReactVersion, SavedReactRestoreError } from "@/lib/build/restoreSavedReactVersion";
import { activeSavedHistoryVersion } from "@/lib/build/activeSavedHistoryVersion";
import { compareSavedVersionSnapshots } from "@/lib/build/compareSavedVersions";
import { historicalReactSourceMetadata, historicReactRecoverySpecification,
  restoreHistoricalReactRevision, HistoricalReactRestoreError } from "@/lib/build/restoreHistoricalReactRevision";

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
    // Read the owner-scoped source head and its active-history marker. The
    // sourceVersion remains the internal CAS token used for save/restore.
    const currentSource = await prisma.codeProject.findFirst({
      where: {id: project.codeProjectId, ownerId: access.userId, archivedAt: null},
      select: {currentVersion: true, meta: true},
    });
    if (!currentSource) return reply(requestId, {ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    const activeVersion = activeSavedHistoryVersion(currentSource.currentVersion, currentSource.meta);
    const url = new URL(req.url);
    const rawVersion = url.searchParams.get("version");
    // Server-side, complete, read-only snapshot comparison. Never return source
    // content; the owner-scoped lookup above is required for both revisions.
    const compareFrom = url.searchParams.get("compareFrom");
    const compareTo = url.searchParams.get("compareTo");
    if (compareFrom !== null || compareTo !== null) {
      const valid=(v:string|null)=>v!==null && /^[1-9]\d{0,8}$/.test(v);
      const baseToken=url.searchParams.get("expectedSourceVersion");
      if (!valid(compareFrom)||!valid(compareTo)||!valid(baseToken)||url.searchParams.size!==3)
        return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
      if (Number(baseToken)!==currentSource.currentVersion)
        return reply(requestId,{ok:false,code:"BUILD_HISTORY_STALE",message:"The selected source changed. Refresh History."},409);
      const versions=[Number(compareFrom),Number(compareTo)];
      const snapshots=await prisma.codeProjectRevision.findMany({
        where:{projectId:project.codeProjectId,version:{in:versions}},select:{version:true,snapshot:true},
      });
      const byVersion=new Map(snapshots.map(x=>[x.version,x.snapshot]));
      if (!byVersion.has(versions[0])||!byVersion.has(versions[1]))
        return reply(requestId,{ok:false,code:"BUILD_REVISION_NOT_FOUND"},404);
      const comparison=compareSavedVersionSnapshots(
        parseBuildWorkspaceMutation(byVersion.get(versions[0])),
        parseBuildWorkspaceMutation(byVersion.get(versions[1])),
      );
      return reply(requestId,{ok:true,fromVersion:versions[0],toVersion:versions[1],
        currentVersion:currentSource.currentVersion,comparison});
    }
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
        note:revision.note, preview, currentVersion:currentSource.currentVersion, activeVersion});
    }
    const before = url.searchParams.get("beforeVersion");
    if ((before !== null && (!/^[1-9]\d{0,8}$/.test(before) || url.searchParams.size !== 1)) ||
        (before === null && url.searchParams.size !== 0))
      return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
    const records = await prisma.codeProjectRevision.findMany({
      where: {projectId:project.codeProjectId,
        ...(before === null ? {} : {version: {lt: Number(before)}})},
      orderBy:{version:"desc"}, take:51,
      select:{version:true, note:true, createdAt:true, workspaceHash:true},
    });
    return reply(requestId,{ok:true, currentVersion:currentSource.currentVersion, activeVersion,
      hasMore:records.length > 50,
      revisions:records.slice(0,50).map(r => ({version:r.version, note:r.note, createdAt:r.createdAt.toISOString(),
        workspaceHash:r.workspaceHash?.slice(0,12) ?? null}))});
  } catch (error) {
    if (error instanceof BuildAccessError) return reply(requestId, {ok:false,code:error.code},403);
    if (error instanceof BuildWorkspaceMutationError) return reply(requestId,{ok:false,code:"BUILD_REVISION_INVALID"},422);
    console.error("[ZoeBuild source history] read unavailable",{requestId,kind:error instanceof Error?error.name:"unknown"});
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
  }
}

/** Switch to an existing saved snapshot without appending a duplicate history row. */
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
    if (!project.specification)
      return reply(requestId,{ok:false,code:"BUILD_HISTORY_STACK_UNSUPPORTED"},422);
    if (project.sourceVersion !== restore.baseVersion)
      return reply(requestId,{ok:false,code:"BUILD_HISTORY_STALE",message:"A newer version exists. Reload history before restoring."},409);
    const limited = await rateLimit(`zoebuild-source-restore:${access.userId}:${project.buildProjectId}`,
      {bucket:"zoebuild-source-restore",limit:6,window:"1 h"}).catch(() => null);
    if (!limited) return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
    if (!limited.ok) return reply(requestId,{ok:false,code:"BUILD_HISTORY_RATE_LIMITED"},429);
    const revision = await prisma.codeProjectRevision.findFirst({
      where:{projectId:project.codeProjectId,version:restore.restoreVersion},
      select:{snapshot:true,settings:true,meta:true},
    });
    if (!revision) return reply(requestId,{ok:false,code:"BUILD_REVISION_NOT_FOUND"},404);
    const workspace = parseBuildWorkspaceMutation(revision.snapshot);
    if (project.stackId !== "react-vite-v1") {
      if (!historicalReactSourceMetadata(revision.settings, revision.meta))
        return reply(requestId,{ok:false,code:"BUILD_HISTORY_STACK_UNSUPPORTED",
          message:"This revision does not contain a registered React/Vite source manifest."},422);
      const specification = historicReactRecoverySpecification(project.title);
      const verification = await verifyZoeReactCandidateAtRunner({
        userId:access.userId,buildProjectId:project.buildProjectId,
        workspace,edits:[],specification,sourceVersion:project.sourceVersion,
        sourceKind:"saved",correlationId:requestId,
      });
      if (verification.state !== "passed")
        return reply(requestId,{ok:false,code:"BUILD_RESTORE_BUILD_NOT_VERIFIED",
          message:"The historical React revision did not compile. Nothing was restored.",verification},409);
      const saved = await restoreHistoricalReactRevision(prisma, {
        ownerId: access.userId, buildProjectId: project.buildProjectId,
        expectedVersion: project.sourceVersion, restoreVersion: restore.restoreVersion,
        snapshot: revision.snapshot, revisionSettings: revision.settings, revisionMeta: revision.meta,
      });
      if (!saved) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
      return reply(requestId,{ok:true,sourceVersion:saved.sourceVersion,
        restoredFromVersion:restore.restoreVersion,activeVersion:restore.restoreVersion,changed:saved.changed});
    }
    // V1 through the latest React version: activate the exact persisted source
    // and dependency settings as NEW current revision. Do not gate user-owned
    // history on today's runner/dependencies; verification is a separate action.
    const saved = await restoreSavedReactVersion(prisma, {
      ownerId: access.userId, buildProjectId: project.buildProjectId,
      expectedVersion: project.sourceVersion, restoreVersion: restore.restoreVersion,
    });
    if (!saved) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    return reply(requestId,{ok:true,sourceVersion:saved.sourceVersion,
      restoredFromVersion:restore.restoreVersion,activeVersion:restore.restoreVersion,changed:saved.changed,
      buildVerified:false,specificationRestored:saved.specificationRestored});
  } catch (error) {
    if (error instanceof SavedReactRestoreError) {
      const messages = {
        BUILD_HISTORY_STALE: "A newer source version or active operation exists. Reload and retry.",
        BUILD_HISTORY_STACK_UNSUPPORTED: "The saved version is not a verified React/Vite snapshot. It cannot be restored exactly under the React-only project stack.",
        BUILD_RESTORE_NO_CHANGE: "The selected version already matches the currently saved source and settings.",
        BUILD_HISTORY_SPEC_UNAVAILABLE: "This revision requires a different project capability configuration. Its runtime settings cannot be safely restored.",
      } as const;
      return reply(requestId,{ok:false,code:error.code,message:messages[error.code]},
        error.code === "BUILD_HISTORY_STACK_UNSUPPORTED" ? 422 : 409);
    }
    if (error instanceof HistoricalReactRestoreError)
      return reply(requestId,{ok:false,code:error.code,
        message:"This historical revision cannot be safely restored without further cleanup."},
        error.code === "BUILD_HISTORY_STACK_UNSUPPORTED" ? 422 : 409);
    if (error instanceof BuildSourceConflictError)
      return reply(requestId,{ok:false,code:error.code,message:"A newer version exists. Reload before restoring."},409);
    if (error instanceof BuildAccessError) return reply(requestId,{ok:false,code:error.code},403);
    if (error instanceof BuildWorkspaceMutationError)
      return reply(requestId,{ok:false,code:"BUILD_REVISION_INVALID",message:"This revision cannot be safely restored."},422);
    console.error("[ZoeBuild source history] restore unavailable",{requestId,kind:error instanceof Error?error.name:"unknown"});
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
  }
}

/** Delete one non-active, unreferenced snapshot. Never renumber the remaining versions. */
export async function DELETE(req: Request, ctx: Context) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) return reply(requestId,{ok:false,code:"BUILD_FORBIDDEN"},403);
  const url = new URL(req.url);
  const rawVersion = url.searchParams.get("version");
  if (!rawVersion || !/^[1-9]\d{0,8}$/.test(rawVersion) || url.searchParams.size !== 1)
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  if (Number(req.headers.get("content-length") || "0") > 256)
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  const raw = await req.text();
  if (Buffer.byteLength(raw,"utf8") > 256) return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  let payload: unknown;
  try {payload=JSON.parse(raw);} catch {return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);}
  const version = Number(rawVersion);
  if (!payload || typeof payload!=="object" || Array.isArray(payload) ||
      Object.keys(payload).length!==2 ||
      (payload as {confirmVersion?:unknown}).confirmVersion!==version ||
      !Number.isSafeInteger((payload as {expectedSourceVersion?:unknown}).expectedSourceVersion))
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_INPUT_INVALID"},400);
  const expectedVersion = (payload as {expectedSourceVersion:number}).expectedSourceVersion;
  try {
    const {access,project} = await owner(req,ctx);
    if (!access.userId) return reply(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    if (!project) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    if (project.status==="archived") return reply(requestId,{ok:false,code:"BUILD_PROJECT_ARCHIVED"},409);
    const limited=await rateLimit(`zoebuild-history-delete:${access.userId}:${project.buildProjectId}`,
      {bucket:"zoebuild-history-delete",limit:8,window:"1 h"}).catch(()=>null);
    if (!limited) return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE"},503);
    if (!limited.ok) return reply(requestId,{ok:false,code:"BUILD_HISTORY_RATE_LIMITED"},429);
    const result=await prisma.$transaction(async tx => {
      const owned=await tx.buildProject.findFirst({
        where:{id:project.buildProjectId,status:{not:"archived"},codeProject:{ownerId:access.userId!,archivedAt:null}},
        select:{codeProjectId:true,codeProject:{select:{currentVersion:true,meta:true}}},
      });
      if (!owned) return "missing" as const;
      if (owned.codeProject.currentVersion!==expectedVersion) return "stale" as const;
      // Active or source-head versions must remain recoverable.
      if (version===activeSavedHistoryVersion(expectedVersion,owned.codeProject.meta) || version===expectedVersion)
        return "protected" as const;
      const revisions=await tx.codeProjectRevision.count({where:{projectId:owned.codeProjectId}});
      if (revisions<=1) return "protected" as const;
      // Builds, deployments and compiled artifacts are audit/publishing references.
      const [run,deployment,artifact]=await Promise.all([
        tx.buildRun.findFirst({where:{buildProjectId:project.buildProjectId,sourceVersion:version},select:{id:true}}),
        tx.buildDeployment.findFirst({where:{buildProjectId:project.buildProjectId,sourceVersion:version},select:{id:true}}),
        tx.buildArtifact.findFirst({where:{buildProjectId:project.buildProjectId,sourceVersion:version},select:{id:true}}),
      ]);
      if (run || deployment || artifact) return "protected" as const;
      const deleted=await tx.codeProjectRevision.deleteMany({where:{projectId:owned.codeProjectId,version}});
      return deleted.count===1 ? "deleted" as const : "missing" as const;
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    if (result==="deleted") return reply(requestId,{ok:true,deleted:true,version});
    if (result==="missing") return reply(requestId,{ok:false,code:"BUILD_REVISION_NOT_FOUND",message:"Version not found."},404);
    if (result==="stale") return reply(requestId,{ok:false,code:"BUILD_HISTORY_STALE",message:"The project changed. Reload History before deleting a version."},409);
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_DELETE_PROTECTED",message:"This version is current, the last recovery snapshot, or referenced by a build or deployment. It cannot be deleted."},409);
  } catch (error) {
    if (error instanceof BuildAccessError) return reply(requestId,{ok:false,code:error.code},403);
    console.error("[ZoeBuild source history] delete unavailable",{requestId,kind:error instanceof Error?error.name:"unknown"});
    return reply(requestId,{ok:false,code:"BUILD_HISTORY_UNAVAILABLE",message:"Version deletion could not be verified. No deletion was confirmed."},503);
  }
}
