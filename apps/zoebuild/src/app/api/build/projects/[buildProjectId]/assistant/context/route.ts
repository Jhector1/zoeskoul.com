import { NextResponse } from "next/server";
import { BuildAccessError, BuildProjectDefinitionError, getBuildProjectCommand } from "@zoeskoul/build-application";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { presentZoeAssistantProjectContext } from "@/lib/build/zoeAssistantProjectContext";
import { prisma } from "@zoeskoul/platform-server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function result(requestId: string, body: Record<string, unknown>, status = 200) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

/** Read-only, owner-authorized context. Never expose credentials or raw workspace source. */
export async function GET(req: Request, ctx: { params: Promise<{ buildProjectId: string }> }) {
  const requestId = crypto.randomUUID();
  let access: Awaited<ReturnType<typeof loadCurrentBuildAccessSnapshot>>;
  try { access = await loadCurrentBuildAccessSnapshot(req, {requireAuthority:true}); }
  catch { return result(requestId, {ok:false, code:"SESSION_AUTHORITY_UNAVAILABLE",
    message:"Zoéskoul session verification is temporarily unavailable. No project source was changed."}, 503); }
  if (!access.userId) {
    return result(requestId, { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." }, 401);
  }
  const { buildProjectId } = await ctx.params;
  try {
    const project = await getBuildProjectCommand({
      access, buildProjectId, reader: createPrismaBuildProjectReader(prisma),
    });
    if (!project) {
      return result(requestId, { ok: false, code: "BUILD_PROJECT_NOT_FOUND", message: "Project not found." }, 404);
    }
    return result(requestId, { ok: true, project: presentZoeAssistantProjectContext(project) });
  } catch (error) {
    if (error instanceof BuildAccessError) {
      return result(requestId, { ok: false, code: error.code, message: error.message }, error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403);
    }
    if (error instanceof BuildProjectDefinitionError) {
      return result(requestId, { ok: false, code: error.code, message: error.message }, 400);
    }
    console.error("[ZoeBuild assistant context] read failed", {
      requestId, code: error instanceof Error ? error.name : "UnknownError",
    });
    return result(requestId, { ok: false, code: "BUILD_CONTEXT_UNAVAILABLE", message: "Project context could not be loaded." }, 503);
  }
}
