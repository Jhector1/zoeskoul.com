import "server-only";

import type { PrismaClient } from "@/lib/prisma";

export type TutoringParticipantSummary = {
  id: string;
  name: string | null;
  email: string | null;
  role: "learner" | "observer";
  source: "direct" | "group";
};

export async function loadTutoringParticipants(
  prisma: PrismaClient,
  sessionId: string,
): Promise<TutoringParticipantSummary[]> {
  const session = await prisma.tutoringSession.findUnique({
    where: { id: sessionId },
    select: {
      users: {
        select: {
          role: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
      groups: {
        select: {
          group: {
            select: {
              members: {
                select: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!session) return [];
  const byId = new Map<string, TutoringParticipantSummary>();

  for (const row of session.users) {
    byId.set(row.user.id, {
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      role: row.role === "observer" ? "observer" : "learner",
      source: "direct",
    });
  }

  for (const groupRow of session.groups) {
    for (const member of groupRow.group.members) {
      if (byId.has(member.user.id)) continue;
      byId.set(member.user.id, {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email,
        role: "learner",
        source: "group",
      });
    }
  }

  return [...byId.values()].sort((a, b) => {
    const left = a.name || a.email || a.id;
    const right = b.name || b.email || b.id;
    return left.localeCompare(right);
  });
}
