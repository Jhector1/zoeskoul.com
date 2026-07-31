import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { learningAssignmentAvailability } from "./assignmentWindow";

function activeWindowWhere(now: Date) {
  return {
    status: "assigned" as const,
    AND: [{ OR: [{ availableFrom: null }, { availableFrom: { lte: now } }] }],
  };
}

function audienceWhere(userId: string) {
  return {
    OR: [
      { users: { some: { userId } } },
      { groups: { some: { group: { members: { some: { userId } } } } } },
    ],
  };
}

export async function getAssignedSubjectIdsForUser(
  prisma: PrismaClient,
  args: {
    userId: string;
    subjectIds: readonly string[];
    now?: Date;
  },
): Promise<Set<string>> {
  if (args.subjectIds.length === 0) return new Set();

  const now = args.now ?? new Date();
  const rows = await prisma.learningAssignment.findMany({
    where: {
      ...activeWindowWhere(now),
      subjectId: { in: [...args.subjectIds] },
      ...audienceWhere(args.userId),
    },
    select: { subjectId: true },
  });

  return new Set(rows.map((row) => row.subjectId));
}

export async function getLearningAssignmentsForUser(
  prisma: PrismaClient,
  args: { userId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const rows = await prisma.learningAssignment.findMany({
    where: {
      status: { in: ["assigned", "closed"] },
      ...audienceWhere(args.userId),
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      status: true,
      availableFrom: true,
      dueAt: true,
      solutionVisibility: true,
      subject: {
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          imagePublicId: true,
          imageAlt: true,
          visibility: true,
          modules: {
            orderBy: { order: "asc" },
            take: 1,
            select: { slug: true },
          },
        },
      },
      owner: { select: { id: true, name: true, email: true } },
    },
  });

  return rows.map((row) => ({
    ...row,
    availability: learningAssignmentAvailability(row, now),
    defaultModuleSlug: row.subject.modules[0]?.slug ?? null,
  }));
}

export async function getLearningAssignmentContextsForSubject(
  prisma: PrismaClient,
  args: { userId: string; subjectId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  return prisma.learningAssignment.findMany({
    where: {
      ...activeWindowWhere(now),
      subjectId: args.subjectId,
      ...audienceWhere(args.userId),
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      status: true,
      availableFrom: true,
      dueAt: true,
      solutionVisibility: true,
    },
  });
}

export async function getLearningAssignmentForUser(
  prisma: PrismaClient,
  args: { assignmentId: string; userId: string },
) {
  return prisma.learningAssignment.findFirst({
    where: {
      id: args.assignmentId,
      ...audienceWhere(args.userId),
    },
    include: {
      subject: {
        include: {
          modules: { orderBy: { order: "asc" }, take: 1 },
        },
      },
      owner: { select: { id: true, name: true, email: true } },
    },
  });
}
