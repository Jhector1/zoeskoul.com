import "server-only";

import { prisma } from "@/lib/prisma";

import {
  projectClassProgress,
  type TeacherClassDashboard,
} from "./classProgressProjection";

export async function getLearningGroupDashboard(
  groupId: string,
): Promise<TeacherClassDashboard | null> {
  const group = await prisma.learningGroup.findUnique({
    where: { id: groupId },
    select: {
      id: true,
      name: true,
      members: {
        where: { role: "student" },
        orderBy: { joinedAt: "asc" },
        select: {
          userId: true,
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        select: {
          assignedAt: true,
          assignment: {
            select: {
              id: true,
              title: true,
              status: true,
              availableFrom: true,
              dueAt: true,
              subject: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  modules: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      slug: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!group) return null;

  const userIds = group.members.map((member) => member.userId);
  const subjectIds = [
    ...new Set(
      group.assignments.map(
        (row) => row.assignment.subject.id,
      ),
    ),
  ];

  const [learnerProgress, enrollments, attempts] =
    await Promise.all([
      userIds.length
        ? prisma.learnerProgress.findMany({
            where: {
              userId: { in: userIds },
            },
            select: {
              userId: true,
              actorKey: true,
              totalXp: true,
              lastActiveOn: true,
            },
          })
        : [],
      userIds.length && subjectIds.length
        ? prisma.subjectEnrollment.findMany({
            where: {
              userId: { in: userIds },
              subjectId: { in: subjectIds },
            },
            select: {
              userId: true,
              actorKey: true,
              subjectId: true,
              lastSeenAt: true,
              completedAt: true,
            },
          })
        : [],
      userIds.length && subjectIds.length
        ? prisma.practiceAttempt.findMany({
            where: {
              userId: { in: userIds },
              revealUsed: false,
              instance: {
                topic: {
                  subjectId: { in: subjectIds },
                },
              },
            },
            select: {
              userId: true,
              ok: true,
              createdAt: true,
              instance: {
                select: {
                  topic: {
                    select: {
                      subjectId: true,
                    },
                  },
                },
              },
            },
          })
        : [],
    ]);

  const learnerByUser = new Map(
    learnerProgress
      .filter(
        (row): row is typeof row & { userId: string } =>
          Boolean(row.userId),
      )
      .map((row) => [row.userId, row]),
  );

  const actorByUser = new Map<string, string>();
  for (const row of learnerProgress) {
    if (row.userId) {
      actorByUser.set(row.userId, row.actorKey);
    }
  }
  for (const enrollment of enrollments) {
    if (enrollment.userId && !actorByUser.has(enrollment.userId)) {
      actorByUser.set(enrollment.userId, enrollment.actorKey);
    }
  }

  const actorKeys = [...new Set(actorByUser.values())];
  const subjectSlugs = [
    ...new Set(
      group.assignments.map(
        (row) => row.assignment.subject.slug,
      ),
    ),
  ];

  const reviews =
    actorKeys.length && subjectSlugs.length
      ? await prisma.reviewProgress.findMany({
          where: {
            actorKey: { in: actorKeys },
            subjectSlug: { in: subjectSlugs },
          },
          select: {
            actorKey: true,
            subjectSlug: true,
            moduleId: true,
            state: true,
            updatedAt: true,
          },
        })
      : [];

  return projectClassProgress({
    class: {
      id: group.id,
      name: group.name,
    },
    assignments: group.assignments.map((row) => ({
      id: row.assignment.id,
      title: row.assignment.title,
      status: row.assignment.status,
      availableFrom:
        row.assignment.availableFrom?.toISOString() ?? null,
      dueAt:
        row.assignment.dueAt?.toISOString() ?? null,
      assignedAt: row.assignedAt.toISOString(),
      subject: {
        ...row.assignment.subject,
      },
    })),
    students: group.members.map((member) => {
      const learner = learnerByUser.get(member.userId);
      return {
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        actorKey:
          actorByUser.get(member.userId) ?? null,
        totalXp: learner?.totalXp ?? 0,
        lastActiveOn:
          learner?.lastActiveOn?.toISOString() ?? null,
      };
    }),
    enrollments: enrollments.flatMap((row) =>
      row.userId
        ? [
            {
              userId: row.userId,
              actorKey: row.actorKey,
              subjectId: row.subjectId,
              lastSeenAt:
                row.lastSeenAt?.toISOString() ?? null,
              completedAt:
                row.completedAt?.toISOString() ?? null,
            },
          ]
        : [],
    ),
    reviews: reviews.map((row) => ({
      ...row,
      updatedAt: row.updatedAt.toISOString(),
    })),
    attempts: attempts.flatMap((row) => {
      const userId = row.userId;
      const subjectId = row.instance.topic.subjectId;
      if (!userId || !subjectId) return [];
      return [
        {
          userId,
          subjectId,
          ok: row.ok,
          createdAt: row.createdAt.toISOString(),
        },
      ];
    }),
  });
}
