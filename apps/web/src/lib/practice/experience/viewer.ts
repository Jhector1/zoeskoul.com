import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import type { PracticeRunViewer } from "./types";

function future(value: Date | null | undefined) {
  return !value || value.getTime() > Date.now();
}

export async function resolvePracticeViewer(
  prisma: PrismaClient,
  actor: Actor,
): Promise<PracticeRunViewer> {
  if (!actor.userId) {
    return { tier: "guest", authenticated: false, subscribed: false };
  }

  const [subscription, user] = await Promise.all([
    prisma.subscription.findFirst({
      where: {
        userId: actor.userId,
        status: { in: ["active", "trialing", "past_due", "canceled"] },
      },
      orderBy: { updatedAt: "desc" },
      select: {
        status: true,
        currentPeriodEnd: true,
        trialEnd: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: actor.userId },
      select: { roles: true },
    }),
  ]);

  const roles = (user?.roles ?? []).map(String);
  const privileged = roles.includes("teacher") || roles.includes("admin");
  const subscribed = Boolean(
    privileged ||
      (subscription &&
        (subscription.status === "active" ||
          (subscription.status === "trialing" && future(subscription.trialEnd)) ||
          ((subscription.status === "past_due" || subscription.status === "canceled") &&
            future(subscription.currentPeriodEnd)))),
  );

  return {
    tier: subscribed ? "subscriber" : "free",
    authenticated: true,
    subscribed,
  };
}
