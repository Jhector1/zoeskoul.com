import "server-only";
import type { PrismaClient } from "@/lib/prisma";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";

export function tutoringParticipantWhere(userId: string) {
  return {
    OR: [
      { users: { some: { userId } } },
      { groups: { some: { group: { members: { some: { userId } } } } } },
    ],
  };
}

export async function getTutoringSessionAccess(
  prisma: PrismaClient,
  args: { sessionId: string; userId: string; teachingUser?: TeachingUser | null },
) {
  return prisma.tutoringSession.findFirst({
    where: {
      id: args.sessionId,
      ...(args.teachingUser
        ? ownedTeachingRecordWhere(args.teachingUser)
        : { status: { in: ["live", "shared"] }, ...tutoringParticipantWhere(args.userId) }),
    },
  });
}
