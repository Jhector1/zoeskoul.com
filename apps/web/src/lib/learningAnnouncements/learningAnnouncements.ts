import "server-only";

import { prisma } from "@/lib/prisma";

import {
  uniqueAnnouncementRecipientUserIds,
} from "./announcementAudience";

export type LearningAnnouncementTargetScope =
  | "school"
  | "class";

export type TeacherLearningAnnouncement = {
  id: string;
  scope: LearningAnnouncementTargetScope;
  title: string;
  body: string;
  publishedAt: string;
  authorName: string | null;
  recipientCount: number;
  readCount: number;
};

export type StudentLearningAnnouncement = {
  id: string;
  scope: LearningAnnouncementTargetScope;
  title: string;
  body: string;
  publishedAt: string;
  sourceName: string;
  authorName: string | null;
};

type TeacherAnnouncementRow = {
  id: string;
  scope: LearningAnnouncementTargetScope;
  title: string;
  body: string;
  publishedAt: Date;
  author: {
    name: string | null;
    email: string | null;
  };
  receipts: Array<{
    readAt: Date | null;
  }>;
};

function teacherProjection(
  row: TeacherAnnouncementRow,
): TeacherLearningAnnouncement {
  return {
    id: row.id,
    scope: row.scope,
    title: row.title,
    body: row.body,
    publishedAt: row.publishedAt.toISOString(),
    authorName: row.author.name ?? row.author.email,
    recipientCount: row.receipts.length,
    readCount: row.receipts.filter(
      (receipt) => receipt.readAt !== null,
    ).length,
  };
}

export async function listLearningAnnouncementsForTarget(
  scope: LearningAnnouncementTargetScope,
  targetId: string,
) {
  const rows =
    await prisma.learningAnnouncement.findMany({
      where:
        scope === "school"
          ? {
              scope: "school",
              organizationId: targetId,
            }
          : {
              scope: "class",
              groupId: targetId,
            },
      orderBy: {
        publishedAt: "desc",
      },
      take: 50,
      select: {
        id: true,
        scope: true,
        title: true,
        body: true,
        publishedAt: true,
        author: {
          select: {
            name: true,
            email: true,
          },
        },
        receipts: {
          select: {
            readAt: true,
          },
        },
      },
    });

  return rows.map((row) =>
    teacherProjection(row),
  );
}

export async function publishLearningAnnouncement(
  args: {
    scope: LearningAnnouncementTargetScope;
    targetId: string;
    authorId: string;
    title: string;
    body: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const rows =
      args.scope === "school"
        ? await tx.learningGroupMember.findMany({
            where: {
              role: "student",
              group: {
                organizationId:
                  args.targetId,
              },
            },
            select: {
              userId: true,
            },
          })
        : await tx.learningGroupMember.findMany({
            where: {
              role: "student",
              groupId: args.targetId,
            },
            select: {
              userId: true,
            },
          });

    const studentIds =
      uniqueAnnouncementRecipientUserIds(
        rows,
      );

    const announcement =
      await tx.learningAnnouncement.create({
        data: {
          scope: args.scope,
          authorId: args.authorId,
          title: args.title.trim(),
          body: args.body.trim(),
          ...(args.scope === "school"
            ? {
                organizationId:
                  args.targetId,
              }
            : {
                groupId:
                  args.targetId,
              }),
        },
        select: {
          id: true,
          publishedAt: true,
        },
      });

    if (studentIds.length) {
      await tx.learningAnnouncementReceipt.createMany({
        data: studentIds.map((userId) => ({
          announcementId:
            announcement.id,
          userId,
        })),
      });
    }

    return {
      id: announcement.id,
      recipientCount: studentIds.length,
      publishedAt:
        announcement.publishedAt.toISOString(),
    };
  });
}

export async function listUnreadLearningAnnouncementsForStudent(
  userId: string,
): Promise<StudentLearningAnnouncement[]> {
  const receipts =
    await prisma.learningAnnouncementReceipt.findMany({
      where: {
        userId,
        readAt: null,
      },
      orderBy: {
        createdAt: "desc",
      },
      take: 20,
      select: {
        announcement: {
          select: {
            id: true,
            scope: true,
            title: true,
            body: true,
            publishedAt: true,
            author: {
              select: {
                name: true,
                email: true,
              },
            },
            organization: {
              select: {
                name: true,
              },
            },
            group: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

  return receipts.map(({ announcement }) => ({
    id: announcement.id,
    scope: announcement.scope,
    title: announcement.title,
    body: announcement.body,
    publishedAt:
      announcement.publishedAt.toISOString(),
    sourceName:
      announcement.scope === "school"
        ? announcement.organization?.name ??
          ""
        : announcement.group?.name ?? "",
    authorName:
      announcement.author.name ??
      announcement.author.email,
  }));
}

export async function markLearningAnnouncementRead(
  args: {
    announcementId: string;
    userId: string;
  },
) {
  const updated =
    await prisma.learningAnnouncementReceipt.updateMany({
      where: {
        announcementId:
          args.announcementId,
        userId: args.userId,
      },
      data: {
        readAt: new Date(),
      },
    });

  if (updated.count !== 1) {
    throw new Error(
      "Announcement receipt not found.",
    );
  }
}
