import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { getAccessSnapshot } from "./accessSnapshot";

export type SubjectAudienceAccessDecision =
  | { ok: true }
  | { ok: false; reason: "requires_login" | "requires_assignment" };

export async function checkSubjectAudienceAccess(
  prisma: PrismaClient,
  args: {
    actor: Actor;
    subjectId: string;
    visibility: "public" | "private" | "organization";
  },
): Promise<SubjectAudienceAccessDecision> {
  if (args.visibility === "public") return { ok: true };
  if (!args.actor.userId) return { ok: false, reason: "requires_login" };

  const snapshot = await getAccessSnapshot(prisma, args.actor, {
    subjectIds: [args.subjectId],
  });

  return snapshot.subjectAccess.has(args.subjectId)
    ? { ok: true }
    : { ok: false, reason: "requires_assignment" };
}
