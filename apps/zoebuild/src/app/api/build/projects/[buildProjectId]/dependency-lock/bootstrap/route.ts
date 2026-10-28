import { NextResponse } from "next/server";

import {
  BuildAccessError,
  BuildSourceConflictError,
} from "@zoeskoul/build-application";

import {
  BuildBootstrapOutputError,
  BuildDependencyLockExecutionError,
  BuildPreparationError,
  bootstrapOwnedBuildProjectDependencyLock,
} from "@/lib/build/bootstrapBuildProjectLockfile";
import { loadCurrentBuildAccessSnapshot } from "@/lib/build/currentBuildAccess";
import { executeTrustedDependencyLockBootstrapAtRunner } from "@/lib/build/buildExecutorValidation";
import { createPrismaBuildProjectReader } from "@/lib/build/readBuildProjects";
import { createPrismaBuildProjectSourceWriter } from "@/lib/build/saveBuildProjectSource";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { enforceSameOriginPost } from "@zoeskoul/platform-server/http";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { adoptRestoredReactDependencyLock, AutoRestoreDependenciesError } from "@/lib/build/adoptRestoredReactDependencyLock";
import { Prisma } from "@zoeskoul/db";

/** Runner capacity is transient, not an invalid artifact or a failed executor.
 * Only recognize an actual HTTP status carried by the trusted runner client.
 */
function isRunnerCapacityError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error &&
    error.status === 429;
}

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

export async function POST(
  req: Request,
  ctx: { params: Promise<{ buildProjectId: string }> },
) {
  const requestId = crypto.randomUUID();

  if (!enforceSameOriginPost(req)) {
    return json(
      requestId,
      { ok: false, code: "BUILD_FORBIDDEN", message: "Forbidden." },
      403,
    );
  }

  const access = await loadCurrentBuildAccessSnapshot();
  const userId = access.userId ?? "";
  if (!userId) {
    return json(
      requestId,
      { ok: false, code: "BUILD_AUTH_REQUIRED", message: "Unauthorized." },
      401,
    );
  }

  const { buildProjectId } = await ctx.params;
  const limited = await rateLimit(
    `zoebuild-lock-bootstrap:${userId}:${buildProjectId}`,
    {
      bucket: "zoebuild-lock-bootstrap",
      limit: 12,
      window: "1 h",
    },
  ).catch((error) => {
    console.error(
      "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] rate limit unavailable",
      { requestId, buildProjectId, error },
    );
    return null;
  });

  if (!limited) {
    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_SERVICE_UNAVAILABLE",
        message: "Service unavailable.",
      },
      503,
    );
  }

  if (!limited.ok) {
    const response = json(
      requestId,
      {
        ok: false,
        code: "BUILD_RATE_LIMITED",
        message: "Too many dependency bootstrap requests.",
      },
      429,
    );
    response.headers.set(
      "Retry-After",
      String(Math.max(1, Math.ceil((limited.resetMs - Date.now()) / 1000))),
    );
    return response;
  }

  try {
    const actorKey = await requireRunnerActorKey(userId);

    const body: unknown = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Invalid dependency request." }, 400);
    }
    const options = body as Record<string, unknown>;
    const reconcileExisting = options.reconcileExisting === true;
    const approveRestoredDependencyRepair = options.approveRestoredDependencyRepair === true;
    const autoRestoreRequested = options.autoRestoreDependencies === true;
    if (options.autoRestoreDependencies !== undefined &&
        typeof options.autoRestoreDependencies !== "boolean") {
      return json(requestId, {ok:false, code:"BUILD_PREPARATION_INVALID"}, 400);
    }
    // Provenance is persistent. Browser reloads must not turn the original
    // V2 restore back into a manual dependency task.
    const restoredHead = options.reconcileExisting === true &&
      Number.isSafeInteger(options.baseVersion) && !approveRestoredDependencyRepair
      ? await prisma.buildProject.findFirst({
          where:{id:buildProjectId,codeProject:{ownerId:userId,archivedAt:null}},
          select:{codeProject:{select:{id:true,currentVersion:true,meta:true}}},
        }) : null;
    const headMetaValue = restoredHead?.codeProject.meta;
    const headMeta = headMetaValue && typeof headMetaValue === "object" && !Array.isArray(headMetaValue)
      ? headMetaValue as Record<string,unknown> : null;
    const pinnedHead = restoredHead?.codeProject.currentVersion === options.baseVersion &&
      headMeta?.lastMutation === "history-restore" &&
      headMeta?.restoredSnapshotVersion === options.baseVersion &&
      Number.isSafeInteger(headMeta?.restoredFromVersion);
    const autoRestoreDependencies = autoRestoreRequested || pinnedHead;
    if (autoRestoreDependencies) {
      // Only a CAS-bound, owner-authenticated saved history selection may
      // automatically recover dependencies. Never overwrite a signed lock.
      if (options.reconcileExisting !== true ||
          !Number.isSafeInteger(options.baseVersion) ||
          approveRestoredDependencyRepair || options.desiredDependencies !== undefined) {
        return json(requestId, {ok:false,code:"BUILD_PREPARATION_INVALID"},400);
      }
      const baseVersion = options.baseVersion as number;
      const adopted = await adoptRestoredReactDependencyLock(prisma, {
        ownerId: userId, buildProjectId, expectedVersion: baseVersion,
      });
      if (!adopted) return json(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
      if (adopted.status === "adopted") {
        return json(requestId,{ok:true,bootstrap:{source:{sourceVersion:adopted.sourceVersion},
          restoredExactLock: true}},200);
      }
      // Missing historical lock: runner resolves exact pinned manifest into a
      // NEW revision; never claim byte-for-byte preservation in this case.
      const resolved = await bootstrapOwnedBuildProjectDependencyLock({
        reconcileExisting: true, expectedSourceVersion: baseVersion,
        access, buildProjectId, actorKey,
        reader: createPrismaBuildProjectReader(prisma),
        // Missing-lock recovery is derived from the saved snapshot,
        // never a duplicate saved history entry.
        writer: createPrismaBuildProjectSourceWriter(prisma, {createRevision:false}),
        execute: executeTrustedDependencyLockBootstrapAtRunner,
        nodeId: crypto.randomUUID(), now: Date.now(),
      });
      if (!resolved) return json(requestId,{ok:false,code:"BUILD_PROJECT_NOT_FOUND"},404);
      // Preserve the UI's selected history version after this versioned repair.
      const prior = headMeta ?? {};
      const sourceVersion = resolved.source.sourceVersion;
      if (prior.lastMutation === "history-restore" &&
          prior.restoredSnapshotVersion === baseVersion &&
          Number.isSafeInteger(prior.restoredFromVersion)) {
        await prisma.codeProject.updateMany({
          where:{id:restoredHead!.codeProject.id,ownerId:userId,archivedAt:null,currentVersion:sourceVersion},
          data:{meta:JSON.parse(JSON.stringify({...prior,restoredSnapshotVersion:sourceVersion,
            activeHistoryVersion:prior.restoredFromVersion,
            activeHistorySourceVersion:sourceVersion})) as Prisma.InputJsonValue},
        });
      }
      return json(requestId,{ok:true,bootstrap:{...resolved,restoredExactLock:false}},200);
    }
    if (options.approveRestoredDependencyRepair !== undefined &&
        typeof options.approveRestoredDependencyRepair !== "boolean") {
      return json(requestId, {ok:false, code:"BUILD_PREPARATION_INVALID",
        message:"Invalid restore dependency approval."}, 400);
    }
    // An exact history restore is a pinned saved state. Dependency recovery
    // must not silently turn it into yet another source revision after reload.
    // A later deliberate source save advances the version and lifts this guard.
    if (reconcileExisting) {
      const owned = await prisma.buildProject.findFirst({
        where: {id: buildProjectId, codeProject: {ownerId: userId, archivedAt: null}},
        select: {codeProject: {select: {currentVersion: true, meta: true}}},
      });
      const meta = owned?.codeProject.meta;
      if (meta && typeof meta === "object" && !Array.isArray(meta) &&
          meta.lastMutation === "history-restore" &&
          meta.restoredSnapshotVersion === owned?.codeProject.currentVersion) {
        // Never regenerate a restored lock as a silent preview side effect.
        // A separate user click explicitly approves the CAS-guarded new revision.
        if (!approveRestoredDependencyRepair ||
            options.baseVersion !== owned?.codeProject.currentVersion) {
          return json(requestId, {ok: false, code: "BUILD_RESTORE_DEPENDENCIES_PINNED",
            message: "The restored files are saved. Their dependency lock needs explicit preparation before preview; the historical snapshot remains unchanged."}, 409);
        }
      } else if (approveRestoredDependencyRepair) {
        return json(requestId, {ok:false, code:"BUILD_PREPARATION_INVALID",
          message:"This source is not a freshly restored saved version."}, 409);
      }
    }
    if (approveRestoredDependencyRepair && !reconcileExisting) {
      return json(requestId, {ok:false, code:"BUILD_PREPARATION_INVALID",
        message:"Restored dependency repair requires owner-approved reconciliation."}, 400);
    }
    if (options.reconcileExisting !== undefined && typeof options.reconcileExisting !== "boolean") {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Invalid dependency action." }, 400);
    }
    const expectedSourceVersion = options.baseVersion;
    const desired = options.desiredDependencies;
    if (desired !== undefined && (!desired || typeof desired !== "object" || Array.isArray(desired))) {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Invalid dependency selection." }, 400);
    }
    const chosen = desired as Record<string, unknown> | undefined;
    if (chosen && (!chosen.dependencies || typeof chosen.dependencies !== "object" || Array.isArray(chosen.dependencies) ||
      !chosen.devDependencies || typeof chosen.devDependencies !== "object" || Array.isArray(chosen.devDependencies))) {
      return json(requestId, { ok: false, code: "BUILD_PREPARATION_INVALID", message: "Expected complete pinned dependency groups." }, 400);
    }
    const result = await bootstrapOwnedBuildProjectDependencyLock({
      reconcileExisting,
      expectedSourceVersion: typeof expectedSourceVersion === "number" ? expectedSourceVersion : undefined,
      desiredDependencies: chosen ? {
        dependencies: chosen.dependencies as Record<string, string>,
        devDependencies: chosen.devDependencies as Record<string, string>,
      } : undefined,
      access,
      buildProjectId,
      actorKey,
      reader: createPrismaBuildProjectReader(prisma),
      writer: createPrismaBuildProjectSourceWriter(prisma),
      execute: executeTrustedDependencyLockBootstrapAtRunner,
      nodeId: crypto.randomUUID(),
      now: Date.now(),
    });

    if (!result) {
      return json(
        requestId,
        {
          ok: false,
          code: "BUILD_PROJECT_NOT_FOUND",
          message: "Project not found.",
        },
        404,
      );
    }

    return json(requestId, {
      ok: true,
      bootstrap: result,
    });
  } catch (error) {
    if (error instanceof AutoRestoreDependenciesError) {
      return json(requestId, {ok:false,code:error.code,
        message:"The saved historical dependency lock could not be reused automatically. No historical files were changed; inspect the saved package and lock before retrying."},409);
    }
    if (error instanceof BuildSourceConflictError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
          conflict: error.conflict,
        },
        409,
      );
    }

    if (error instanceof BuildPreparationError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        409,
      );
    }

    if (error instanceof BuildBootstrapOutputError) {
      console.error(
        "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] invalid runner output",
        { requestId, buildProjectId, userId, error },
      );
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "Dependency bootstrap returned an invalid result.",
        },
        502,
      );
    }

    if (error instanceof BuildDependencyLockExecutionError) {
      if (isRunnerCapacityError(error.cause)) {
        // Backpressure is not a 502. Advise the client to wait without
        // bypassing runner capacity, per-user throttling or source-version CAS.
        console.warn("[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] runner busy", {
          requestId, buildProjectId,
        });
        const response = json(requestId, {
          ok: false,
          code: "BUILD_RUNNER_CAPACITY_REACHED",
          message: "The preview service is busy. Your saved files are safe.",
        }, 429);
        response.headers.set("Retry-After", "45");
        return response;
      }
      console.error(
        "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] runner failed",
        { requestId, buildProjectId, userId, error },
      );
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: "Dependency bootstrap service failed.",
        },
        502,
      );
    }

    if (error instanceof BuildAccessError) {
      return json(
        requestId,
        {
          ok: false,
          code: error.code,
          message: error.message,
        },
        error.code === "BUILD_AUTH_REQUIRED" ? 401 : 403,
      );
    }

    console.error(
      "[/api/build/projects/:buildProjectId/dependency-lock/bootstrap] failed",
      { requestId, buildProjectId, userId, error },
    );

    return json(
      requestId,
      {
        ok: false,
        code: "BUILD_DEPENDENCY_LOCK_BOOTSTRAP_FAILED",
        message: "Dependency lock could not be bootstrapped.",
      },
      500,
    );
  }
}
