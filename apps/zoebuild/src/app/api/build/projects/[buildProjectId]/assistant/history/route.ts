import { NextResponse } from "next/server";
import { BuildAccessError, getBuildProjectCommand } from "@zoeskoul/build-application";
import { enforceSameOriginPost, exceedsContentLength } from "@zoeskoul/platform-server/http";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { parseZoeChatSubmission } from "@/lib/build/zoeChatHistoryContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Safety guard on HTTP payload, not an AI answer-length quota.
const MAX_BODY_BYTES = 512 * 1024;
const KEEP_MESSAGES = 120;

type Context = { params: Promise<{ buildProjectId: string }> };
function reply(data: Record<string, unknown>, status = 200) {
  const response = NextResponse.json(data, { status });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function ownedProject(req: Request, buildProjectId: string) {
  const access = await loadCurrentBuildAccessSnapshot(req);
  if (!access.userId) return { kind: "unauthorized" as const };
  const project = await getBuildProjectCommand({
    access, buildProjectId, reader: createPrismaBuildProjectReader(prisma),
  });
  if (!project || project.status === "archived") return { kind: "missing" as const };
  return { kind: "authorized" as const };
}

// GET and POST both verify the same canonical CodeProject.ownerId authorization.
// Generic CodeProject sharing and public preview tokens do not grant chat access.
export async function GET(req: Request, ctx: Context) {
  const { buildProjectId } = await ctx.params;
  try {
    const auth = await ownedProject(req, buildProjectId);
    if (auth.kind === "unauthorized") return reply({ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    if (auth.kind === "missing") return reply({ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    const rows = await prisma.zoeBuildChatMessage.findMany({
      where: { buildProjectId }, orderBy: [{createdAt:"desc"},{id:"desc"}],
      take: KEEP_MESSAGES, select: {clientTurnId:true, role:true, text:true},
    });
    const messages = rows.reverse().filter(row =>
      row.role === "user" || row.role === "assistant",
    ).map(row => ({ clientTurnId:row.clientTurnId, role:row.role, text:row.text }));
    return reply({ok:true,messages});
  } catch (error) {
    if (error instanceof BuildAccessError) return reply({ok:false,code:error.code},
      error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403);
    console.error("[ZoeBuild chat history] GET failed", {errorType:error instanceof Error?error.name:"Unknown"});
    return reply({ok:false,code:"BUILD_CHAT_UNAVAILABLE"},503);
  }
}

export async function POST(req: Request, ctx: Context) {
  if (!enforceSameOriginPost(req)) return reply({ok:false,code:"BUILD_FORBIDDEN"},403);
  if (exceedsContentLength(req, MAX_BODY_BYTES)) return reply({ok:false,code:"BUILD_CHAT_INPUT_INVALID"},400);
  const { buildProjectId } = await ctx.params;
  try {
    const auth = await ownedProject(req, buildProjectId);
    if (auth.kind === "unauthorized") return reply({ok:false,code:"BUILD_AUTH_REQUIRED"},401);
    if (auth.kind === "missing") return reply({ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
    const raw = await req.text();
    if (Buffer.byteLength(raw,"utf8") > MAX_BODY_BYTES) return reply({ok:false,code:"BUILD_CHAT_INPUT_INVALID"},400);
    let json: unknown;
    try { json = JSON.parse(raw); } catch { return reply({ok:false,code:"BUILD_CHAT_INPUT_INVALID"},400); }
    const submission = parseZoeChatSubmission(json);
    if (!submission) return reply({ok:false,code:"BUILD_CHAT_INPUT_INVALID"},400);
    try {
      await prisma.zoeBuildChatMessage.create({data: {buildProjectId,...submission}});
    } catch (error) {
      // Repeat delivery of an identical turn is idempotent. A reused ID with
      // different content never silently overwrites an accepted message.
      const known = typeof error === "object" && error !== null && "code" in error
        && error.code === "P2002";
      if (!known) throw error;
      const existing = await prisma.zoeBuildChatMessage.findUnique({
        where: {buildProjectId_clientTurnId: {buildProjectId,clientTurnId:submission.clientTurnId}},
        select: {role:true,text:true},
      });
      if (!existing || existing.role !== submission.role || existing.text !== submission.text)
        return reply({ok:false,code:"BUILD_CHAT_ID_CONFLICT"},409);
    }
    // Limit retained messages. This is platform chat, not an audit/billing journal.
    const older = await prisma.zoeBuildChatMessage.findMany({
      where: {buildProjectId}, orderBy: [{createdAt:"desc"},{id:"desc"}],
      skip:KEEP_MESSAGES, select:{id:true},
    });
    if (older.length) await prisma.zoeBuildChatMessage.deleteMany({
      where: {buildProjectId,id:{in:older.map(row=>row.id)}},
    });
    return reply({ok:true});
  } catch (error) {
    if (error instanceof BuildAccessError) return reply({ok:false,code:error.code},
      error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403);
    console.error("[ZoeBuild chat history] POST failed", {errorType:error instanceof Error?error.name:"Unknown"});
    return reply({ok:false,code:"BUILD_CHAT_UNAVAILABLE"},503);
  }
}
