import { NextResponse } from "next/server";
import { BuildAccessError, getBuildProjectCommand, resolveBuildAccess } from "@zoeskoul/build-application";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { verifyZoeReactCandidateAtRunner } from "@/lib/build/zoeReactIsolatedBuild";
import { verifyTanstackWorkerEditCandidate } from "@/lib/build/zoeTanstackWorkerCandidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(requestId: string, data: Record<string, unknown>, status = 200) {
  const response = NextResponse.json({...data, requestId}, {status});
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

// Temporary U17 private-pilot capability. No FeatureGrant changes and no
// authorization for AI editing, publishing or arbitrary source submissions.
async function allowPrivateSavedWorkerPilot(req: Request, ownerId: string, projectId: string, version: number): Promise<boolean> {
  const env = process.env;
  const origin = new URL(req.url).origin;
  const nonce = env.AI4B4E2E_TEST_NONCE;
  if (env.NODE_ENV !== "development" ||
      (origin !== "http://localhost:3004" && origin !== "http://127.0.0.1:3004") ||
      env.AI4B4E2P_BROWSER_CONFIRM !== "LOCAL_BROWSER_ONLY" ||
      env.AI4B4E2E_CONFIRM !== "EPHEMERAL_ONLY" ||
      env.AI4B4E2E_TEST_DATABASE_NAME !== "zoebuild_ai4b4e2e_test_13c8dff8ffe2" ||
      env.ZOEBUILD_MANAGED_R2_READS !== "1" ||
      env.ZOEBUILD_PUBLISH_ENABLED !== "0" ||
      projectId !== "cmwqiqnly0002eldlcafn1xjx" ||
      env.ZOEBUILD_MANAGED_R2_PILOT_PROJECT_ID !== projectId ||
      version !== 7 || !nonce || !/^[a-f0-9]{32}$/.test(nonce)) return false;
  try {
    const db = new URL(env.DATABASE_URL || "");
    if (!(["postgresql:", "postgres:"].includes(db.protocol)) ||
        db.hostname !== "127.0.0.1" || db.port !== "55432" ||
        db.pathname !== "/zoebuild_ai4b4e2e_test_13c8dff8ffe2") return false;
    const rows = await prisma.$queryRaw<Array<{allowed: boolean}>>`
      SELECT (current_database() = 'zoebuild_ai4b4e2e_test_13c8dff8ffe2'
        AND inet_server_addr() = '127.0.0.1'::inet AND inet_server_port() = 55432
        AND NOT pg_is_in_recovery()
        AND (SELECT count(*) FROM public."__ai4b4e2e_guard") = 1
        AND EXISTS (SELECT 1 FROM public."__ai4b4e2e_guard" WHERE nonce = ${nonce})
        AND (SELECT count(*) FROM public."User") = 1
        AND EXISTS (SELECT 1 FROM public."User" WHERE id = ${ownerId})
        AND (SELECT count(*) FROM public."BuildProject") = 1
        AND (SELECT count(*) FROM public."__ai4b4e2p_browser_guard") = 1
        AND EXISTS (SELECT 1 FROM public."__ai4b4e2p_browser_guard"
          WHERE "ownerId" = ${ownerId} AND "projectId" = ${projectId} AND nonce = ${nonce})
        AND EXISTS (SELECT 1 FROM public."BuildProject" b
          JOIN public."CodeProject" c ON c.id = b."codeProjectId"
          WHERE b.id = ${projectId} AND b."stackId" = 'tanstack-start-v1'
          AND c."ownerId" = ${ownerId} AND c.visibility::text = 'private'
          AND c."shareToken" IS NULL AND c."archivedAt" IS NULL
          AND c."currentVersion" = ${version}::int)
      ) AS allowed`;
    return rows.length === 1 && rows[0]?.allowed === true;
  } catch {
    return false;
  }
}

/** Build-only check of the canonical *saved* source. Never accepts client edits,
 * source contents, model instructions, provider settings or an arbitrary actor. */
export async function POST(req: Request, ctx: {params: Promise<{buildProjectId: string}>}) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) return reply(requestId, {ok:false, code:"BUILD_FORBIDDEN"},403);
  let access: Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
  try {access=await loadCurrentBuildAccessSnapshot(req,{requireAuthority:true});}
  catch {return reply(requestId,{ok:false,code:"SESSION_AUTHORITY_UNAVAILABLE"},503);}
  if (!access.userId) return reply(requestId,{ok:false,code:"BUILD_AUTH_REQUIRED"},401);
  const canEditWithAi = resolveBuildAccess(access).canEditWithAi;
  let body: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw,"utf8") > 256) return reply(requestId,{ok:false,code:"BUILD_VERIFY_INPUT_INVALID"},400);
    body = JSON.parse(raw);
  } catch {return reply(requestId,{ok:false,code:"BUILD_VERIFY_INPUT_INVALID"},400);}
  if (!body || typeof body !== "object" || Array.isArray(body) ||
    Object.keys(body).length !== 1 || !Object.hasOwn(body,"sourceVersion") ||
    !Number.isSafeInteger((body as {sourceVersion?:unknown}).sourceVersion) ||
    (body as {sourceVersion:number}).sourceVersion < 1)
    return reply(requestId,{ok:false,code:"BUILD_VERIFY_INPUT_INVALID"},400);
  const requestedVersion=(body as {sourceVersion:number}).sourceVersion;
  const {buildProjectId}=await ctx.params;
  try {
    const privateSavedWorkerPilot = await allowPrivateSavedWorkerPilot(req, access.userId, buildProjectId, requestedVersion);
    if (!canEditWithAi && !privateSavedWorkerPilot)
      return reply(requestId,{ok:false,code:"BUILD_AI_EDIT_NOT_ENTITLED"},403);
    const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
    if (!project) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    if (project.status === "archived") return reply(requestId,{ok:false,code:"BUILD_PROJECT_ARCHIVED"},409);
    if (project.sourceVersion !== requestedVersion)
      return reply(requestId,{ok:false,code:"BUILD_VERIFY_STALE",message:"Source version changed. Reload before verifying."},409);
    // Rollout is server-owned and retains the existing Build AI edit entitlement
    // for ordinary manual verification. This never grants AI or publish access.
    const general = process.env.ZOEBUILD_GENERAL_WORKER_VERIFICATION === "1" && canEditWithAi;
    if (project.stackId === "tanstack-start-v1" && project.specification && (general || privateSavedWorkerPilot)) {
      const verification = await verifyTanstackWorkerEditCandidate({
        userId: access.userId, buildProjectId, workspace: project.workspace,
        edits: [], specification: project.specification, sourceVersion: project.sourceVersion,
        sourceKind: "saved", verificationId: requestId,
        requireRuntimeReceipt: general,
      });
      // Compilation is not a mutation. Recheck ownership and the saved head
      // after the isolated job; never present a result for a superseded source.
      const current = await prisma.buildProject.findFirst({where:{id:buildProjectId,
        status:{not:"archived"},codeProject:{ownerId:access.userId,archivedAt:null,
          currentVersion:requestedVersion}},select:{id:true}});
      if (!current) return reply(requestId,{ok:false,code:"BUILD_VERIFY_STALE",message:"Source or project access changed. Reload before verifying."},409);
      return reply(requestId, {ok:true, verification});
    }
    if (!canEditWithAi)
      return reply(requestId,{ok:false,code:"BUILD_AI_EDIT_NOT_ENTITLED"},403);
    if (project.stackId !== "react-vite-v1" || !project.specification)
      return reply(requestId,{ok:false,code:"BUILD_VERIFY_STACK_UNSUPPORTED"},422);
    const verification=await verifyZoeReactCandidateAtRunner({
      userId:access.userId,buildProjectId,workspace:project.workspace,edits:[],
      specification:project.specification,sourceVersion:project.sourceVersion,
      sourceKind:"saved",correlationId:requestId,
    });
    return reply(requestId,{ok:true,verification});
  } catch(error) {
    if (error instanceof BuildAccessError) return reply(requestId,{ok:false,code:error.code},403);
    // Do not expose runner exceptions or private workspace content.
    console.error("[ZoeBuild saved build verification] unexpected",{requestId,kind:error instanceof Error?error.name:"unknown"});
    return reply(requestId,{ok:false,code:"BUILD_VERIFY_UNAVAILABLE"},503);
  }
}
