import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { Actor } from "@/lib/practice/actor";
import { resolveRoleCapabilities } from "@/lib/access/roleCapabilities";

export async function resolveActorRoleCapabilities(
  prisma: PrismaClient,
  actor: Actor,
) {
  if (!actor.userId) return resolveRoleCapabilities([]);

  const user = await prisma.user.findUnique({
    where: { id: actor.userId },
    select: { roles: true },
  });

  return resolveRoleCapabilities(user?.roles);
}
