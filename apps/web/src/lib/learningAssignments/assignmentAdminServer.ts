import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import {
  normalizeEmails,
  resolveUsersByEmail,
} from "@/lib/teaching/recipientResolution";
import type { LearningAssignmentInput } from "@/lib/validators/learningDelivery";

export type LearningAssignmentWriteResolution =
  | {
      ok: false;
      status: 400 | 404;
      error: string;
    }
  | {
      ok: true;
      subject: { id: string };
      users: Array<{ id: string; email: string | null }>;
      pendingEmails: string[];
      recipientEmails: string[];
      groups: Array<{ id: string }>;
    };

/**
 * Authoring owns content; this delivery service only validates that an active,
 * private course and an audience can be connected by an assignment record.
 * Emails without accounts are preserved as pending invitations instead of
 * blocking assignment creation.
 */
export async function resolveLearningAssignmentWrite(
  prisma: PrismaClient,
  args: {
    teachingUser: TeachingUser;
    input: LearningAssignmentInput;
  },
): Promise<LearningAssignmentWriteResolution> {
  const recipientEmails = normalizeEmails(args.input.userEmails);
  const [subject, resolvedUsers, groups] = await Promise.all([
    prisma.practiceSubject.findFirst({
      where: {
        id: args.input.subjectId,
        status: "active",
        visibility: "private",
      },
      select: { id: true },
    }),
    resolveUsersByEmail(prisma, recipientEmails),
    args.input.groupIds.length
      ? prisma.learningGroup.findMany({
          where: {
            id: { in: args.input.groupIds },
            ...ownedTeachingRecordWhere(args.teachingUser),
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (!subject) {
    return {
      ok: false,
      status: 404,
      error: "Private course not found or is not active.",
    };
  }

  if (groups.length !== args.input.groupIds.length) {
    return {
      ok: false,
      status: 400,
      error: "One or more groups are unavailable.",
    };
  }

  return {
    ok: true,
    subject,
    users: resolvedUsers.users,
    pendingEmails: resolvedUsers.missingEmails,
    recipientEmails,
    groups,
  };
}

export function learningAssignmentScalarData(input: LearningAssignmentInput) {
  return {
    slug: input.slug,
    title: input.title,
    description: input.description ?? null,
    subjectId: input.subjectId,
    status: input.status,
    availableFrom: input.availableFrom ? new Date(input.availableFrom) : null,
    dueAt: input.dueAt ? new Date(input.dueAt) : null,
    solutionVisibility: input.solutionVisibility,
  };
}

export function learningAssignmentAudienceCreateData(
  resolution: Extract<LearningAssignmentWriteResolution, { ok: true }>,
) {
  return {
    users: resolution.users.length
      ? {
          createMany: {
            data: resolution.users.map((user) => ({ userId: user.id })),
          },
        }
      : undefined,
    groups: resolution.groups.length
      ? {
          createMany: {
            data: resolution.groups.map((group) => ({ groupId: group.id })),
          },
        }
      : undefined,
  };
}

export function learningAssignmentAudienceReplaceData(
  resolution: Extract<LearningAssignmentWriteResolution, { ok: true }>,
) {
  return {
    users: {
      deleteMany: {},
      ...(resolution.users.length
        ? {
            createMany: {
              data: resolution.users.map((user) => ({ userId: user.id })),
            },
          }
        : {}),
    },
    groups: {
      deleteMany: {},
      ...(resolution.groups.length
        ? {
            createMany: {
              data: resolution.groups.map((group) => ({ groupId: group.id })),
            },
          }
        : {}),
    },
  };
}
