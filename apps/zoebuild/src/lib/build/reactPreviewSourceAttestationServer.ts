import "server-only";

import { timingSafeEqual } from "node:crypto";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { requireRunnerActorKey } from "@/lib/server/runnerActorKey";
import { createOwnedReactPreviewBuildRequestFromSavedSource } from "@/lib/build/reactPreviewServer";
import { matchesSavedTanstackPreviewRequest } from "@/lib/build/reactPreviewSourceAttestation";

const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;
const ACTOR_PATTERN = /^u:[a-f0-9]{64}$/;

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** ZoeBuild-only DB authority; the caller is a separately authenticated Runner
 * service. No browser-supplied user ID, workspace, owner or dependency approval
 * is trusted. This function is safe to invoke repeatedly (before AND after a
 * potential write), and deliberately never returns source or user data.
 */
export async function attestCurrentTanstackSavedPreviewSource(input: Readonly<{
  actorKey: unknown;
  request: unknown;
}>): Promise<boolean> {
  const actorKey = input.actorKey;
  const request = input.request;
  if (typeof actorKey !== "string" || !ACTOR_PATTERN.test(actorKey) ||
      !request || typeof request !== "object" || Array.isArray(request)) return false;
  const record = request as Record<string, unknown>;
  if (typeof record.buildProjectId !== "string" ||
      !PROJECT_ID_PATTERN.test(record.buildProjectId) ||
      !Number.isSafeInteger(record.sourceVersion) || Number(record.sourceVersion) < 1) return false;

  // The owner is read from the database, not asserted in the request body.
  const row = await prisma.buildProject.findFirst({
    where: {
      id: record.buildProjectId,
      status: { not: "archived" },
      codeProject: { archivedAt: null },
    },
    select: { codeProject: { select: { ownerId: true } } },
  });
  const ownerId = row?.codeProject.ownerId;
  if (!ownerId || !equal(actorKey, await requireRunnerActorKey(ownerId))) return false;

  // Phase 4A performs all of the persisted-workspace, revision, TanStack
  // specification and signed dependency checks using the owner-scoped reader.
  // Any changed revision/bytes or revoked owner must fail closed.
  try {
    const saved = await createOwnedReactPreviewBuildRequestFromSavedSource({
      access: { userId: ownerId, entitlements: [] },
      buildProjectId: record.buildProjectId,
      sourceVersion: record.sourceVersion,
    });
    return matchesSavedTanstackPreviewRequest(request, saved);
  } catch {
    return false;
  }
}
