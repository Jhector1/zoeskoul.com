import { NextResponse } from "next/server";
import { BuildAccessError, getBuildProjectCommand, resolveBuildAccess } from "@zoeskoul/build-application";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { verifyZoeReactCandidateAtRunner } from "@/lib/build/zoeReactIsolatedBuild";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function reply(requestId: string, data: Record<string, unknown>, status = 200) {
  const response = NextResponse.json({...data, requestId}, {status});
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  return response;
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
  if (!resolveBuildAccess(access).canEditWithAi)
    return reply(requestId,{ok:false,code:"BUILD_AI_EDIT_NOT_ENTITLED"},403);
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
    const project=await getBuildProjectCommand({access,buildProjectId,reader:createPrismaBuildProjectReader(prisma)});
    if (!project) return reply(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    if (project.status === "archived") return reply(requestId,{ok:false,code:"BUILD_PROJECT_ARCHIVED"},409);
    if (project.sourceVersion !== requestedVersion)
      return reply(requestId,{ok:false,code:"BUILD_VERIFY_STALE",message:"Source version changed. Reload before verifying."},409);
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
