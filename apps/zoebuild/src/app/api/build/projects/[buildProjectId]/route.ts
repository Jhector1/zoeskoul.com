import { NextResponse } from "next/server";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { deleteOwnedBuildProject, preflightOwnedBuildProjectDeletion, BuildProjectDeleteBlockedError } from "@/lib/build/deleteOwnedBuildProject";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { drainTrustedReactProjectPreviewsAtRunner, releaseTrustedReactProjectPreviewDrainAtRunner } from "@/lib/build/reactPreviewRunnerClient";

import {
  BuildAccessError,
  BuildProjectDefinitionError,
  getBuildProjectCommand,
} from "@zoeskoul/build-application";

import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { prisma } from "@zoeskoul/platform-server/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(
  requestId: string,
  body: Record<string, unknown>,
  status = 200,
) {
  const response = NextResponse.json({ ...body, requestId }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("X-Request-Id", requestId);
  return response;
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ buildProjectId: string }> },
) {
  const requestId = crypto.randomUUID();
  const access = await loadCurrentBuildAccessSnapshot();

  if (!access.userId) {
    return json(
      requestId,
      { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." },
      401,
    );
  }

  const { buildProjectId } = await ctx.params;

  try {
    const project = await getBuildProjectCommand({
      access,
      buildProjectId,
      reader: createPrismaBuildProjectReader(prisma),
    });

    if (!project) {
      return json(
        requestId,
        { ok: false, code: "BUILD_PROJECT_NOT_FOUND", message: "Project not found." },
        404,
      );
    }

    return json(requestId, { ok: true, project });
  } catch (error) {
    if (error instanceof BuildAccessError) {
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403,
      );
    }

    if (error instanceof BuildProjectDefinitionError) {
      return json(
        requestId,
        { ok: false, code: error.code, message: error.message },
        400,
      );
    }

    console.error("[/api/build/projects/:buildProjectId] read failed", {
      requestId,
      buildProjectId,
      userId: access.userId,
      error,
    });

    return json(
      requestId,
      { ok: false, code: "BUILD_READ_FAILED", message: "Project could not be loaded." },
      500,
    );
  }
}

/** Destructive owner action. Never accepts a project ID or authority from the request body. */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string }> },
) {
  const requestId = crypto.randomUUID();
  if (!enforceSameOriginPost(req)) {
    return json(requestId, { ok: false, code: "BUILD_FORBIDDEN" }, 403);
  }
  const access = await loadCurrentBuildAccessSnapshot(req, { requireAuthority: true });
  if (!access.userId) {
    return json(requestId, { ok: false, code: "BUILD_AUTH_REQUIRED" }, 401);
  }
  const { buildProjectId } = await ctx.params;
  const limited = await rateLimit(`zoebuild-project-delete:${access.userId}`, {
    bucket: "zoebuild-project-delete", limit: 6, window: "1 h",
  }).catch(() => null);
  if (!limited) return json(requestId, { ok: false, code: "BUILD_SERVICE_UNAVAILABLE" }, 503);
  if (!limited.ok) return json(requestId, { ok: false, code: "BUILD_RATE_LIMITED" }, 429);
  if (Number(req.headers.get("content-length") || "0") > 1024) {
    return json(requestId, { ok: false, code: "BUILD_DELETE_INVALID" }, 400);
  }
  let payload: unknown;
  try {
    const raw = await req.text();
    if (Buffer.byteLength(raw, "utf8") > 1024) throw new Error("invalid");
    payload = JSON.parse(raw);
  } catch {
    return json(requestId, { ok: false, code: "BUILD_DELETE_INVALID" }, 400);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length !== 1 ||
      typeof (payload as { confirmTitle?: unknown }).confirmTitle !== "string") {
    return json(requestId, { ok: false, code: "BUILD_DELETE_INVALID" }, 400);
  }
  let drained: { drainId: string } | null = null;
  let actorKey: string | null = null;
  let deleted = false;
  let stage: "preflight" | "runner" | "database" = "preflight";
  try {
    // Verify project ownership AND confirmation before touching runner resources.
    const owned = await getBuildProjectCommand({
      access, buildProjectId, reader: createPrismaBuildProjectReader(prisma),
    });
    if (!owned) return json(requestId, { ok: false, code: "BUILD_PROJECT_NOT_FOUND" }, 404);
    if (owned.title !== (payload as { confirmTitle: string }).confirmTitle)
      return json(requestId, { ok: false, code: "BUILD_DELETE_TITLE_MISMATCH" }, 409);

    const deletionInput = {
      ownerId: access.userId, buildProjectId,
      expectedTitle: (payload as { confirmTitle: string }).confirmTitle,
    };
    // Blocked/connected projects must keep their currently usable previews.
    // This is advisory: the final Serializable transaction repeats the check.
    const preflight = await preflightOwnedBuildProjectDeletion(prisma, deletionInput);
    if (preflight === "not-found") return json(requestId, { ok: false, code: "BUILD_PROJECT_NOT_FOUND" }, 404);
    if (preflight === "title-mismatch") return json(requestId, { ok: false, code: "BUILD_DELETE_TITLE_MISMATCH" }, 409);

    stage = "runner";
    actorKey = await requireRunnerActorKey(access.userId);
    drained = await drainTrustedReactProjectPreviewsAtRunner({ actorKey, buildProjectId });
    stage = "database";
    const status = await deleteOwnedBuildProject(prisma, deletionInput);
    if (status === "not-found") return json(requestId, { ok: false, code: "BUILD_PROJECT_NOT_FOUND" }, 404);
    if (status === "title-mismatch") return json(requestId, { ok: false, code: "BUILD_DELETE_TITLE_MISMATCH" }, 409);
    deleted = true;
    return json(requestId, { ok: true, deleted: true });
  } catch (error) {
    if (error instanceof BuildProjectDeleteBlockedError) {
      const messages = {
        BUILD_DELETE_ORDERS_PRESENT: "This store has recorded orders. Project deletion requires a separate financial-record retention process.",
        BUILD_DELETE_EXTERNAL_CONNECTIONS: "Disconnect and reconcile external commerce providers before deleting this project.",
        BUILD_DELETE_EXTERNAL_RESOURCES: "External resources or published deployments require verified cleanup before project deletion.",
        BUILD_DELETE_ACTIVE_WORK: "This project has an active build or deployment. Retry after it completes.",
      } as const;
      return json(requestId, { ok: false, code: error.code, message: messages[error.code] }, 409);
    }
    // Keep low-level transport, Prisma, secret and database details in server logs only.
    console.error("[ZoeBuild project deletion] failed", { requestId, buildProjectId,
      stage, kind: error instanceof Error ? error.name : "unknown", error });
    const failure = stage === "runner"
      ? { code: "BUILD_DELETE_RUNNER_UNAVAILABLE",
          message: "Project deletion could not verify runner preview cleanup. Make sure the V12K12J3 runner service is deployed and reachable; no project was deleted." }
      : stage === "database"
      ? { code: "BUILD_DELETE_DATABASE_UNAVAILABLE",
          message: "Project deletion was blocked by a database error after preview cleanup. Your project remains; check the server logs using the request ID." }
      : { code: "BUILD_DELETE_PREFLIGHT_UNAVAILABLE",
          message: "Project deletion could not verify database eligibility. Your project and its previews were left unchanged." };
    return json(requestId, { ok: false, ...failure }, 503);
  } finally {
    // Keep the runner tombstone on success to stop in-flight stale preview requests.
    // On a failed transaction, allow retries after releasing this exact drain lease.
    if (!deleted && drained && actorKey) {
      await releaseTrustedReactProjectPreviewDrainAtRunner({
        actorKey, buildProjectId, drainId: drained.drainId,
      }).catch(() => {
        console.error("[ZoeBuild project deletion] preview drain release failed", { requestId, buildProjectId });
      });
    }
  }
}
