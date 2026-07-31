import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import { resolveTutoringAccess } from "./sessionAccessCore";

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
  const row = await prisma.tutoringSession.findUnique({
    where: { id: args.sessionId },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      ownerId: true,
      subjectId: true,
      sourceSubjectSlug: true,
      selectionScope: true,
      sourceModuleSlug: true,
      sourceSectionSlug: true,
      sourceTopicId: true,
      status: true,
      allowStudentEditing: true,
      sharedAt: true,
      createdAt: true,
      updatedAt: true,
      snapshotVersion: true,
      snapshotBytes: true,
      moduleKeys: true,
      users: {
        where: { userId: args.userId },
        select: { role: true },
        take: 1,
      },
      groups: {
        where: { group: { members: { some: { userId: args.userId } } } },
        select: { groupId: true },
        take: 1,
      },
    },
  });
  if (!row) return null;

  const permissions = resolveTutoringAccess({
    userId: args.userId,
    ownerId: row.ownerId,
    status: row.status,
    allowStudentEditing: row.allowStudentEditing,
    directRole: row.users[0]?.role ?? null,
    isGroupParticipant: row.groups.length > 0,
    isAdmin: Boolean(args.teachingUser?.isAdmin),
  });
  if (!permissions) return null;

  const { users: _users, groups: _groups, ...tutoringSession } = row;
  return { tutoringSession, ...permissions };
}
