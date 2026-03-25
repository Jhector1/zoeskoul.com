import { prisma } from "@/lib/prisma";

// ---- Query builders (typed via inference) ----

export const assignmentListQuery = (where?: any) =>
  prisma.assignment.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }],
    include: {
      section: { select: { id: true, title: true, slug: true } },
      _count: { select: { sessions: true } },
    },
  });

export type AssignmentListItem = Awaited<
  ReturnType<typeof assignmentListQuery>
>[number];

export type AssignmentId = AssignmentListItem["id"];
