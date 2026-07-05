import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { resolvePracticeViewer } from "./viewer";

export async function resolveSubscriberPracticeAccess(
  prisma: PrismaClient,
  actor: Actor,
) {
  const viewer = await resolvePracticeViewer(prisma, actor);

  if (!viewer.authenticated) {
    return {
      ok: false as const,
      status: 401,
      code: "AUTH_REQUIRED",
      message: "Sign in to practice.",
      viewer,
    };
  }

  if (!viewer.subscribed) {
    return {
      ok: false as const,
      status: 403,
      code: "DAILY_FIVE_ONLY",
      message:
        "Free accounts receive one ranked daily-practice session each day. Subscribe for configurable unlimited practice.",
      viewer,
    };
  }

  return { ok: true as const, viewer };
}
