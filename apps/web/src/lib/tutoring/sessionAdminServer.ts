import "server-only";

import type { Prisma, PrismaClient } from "@/lib/prisma";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import { resolveUsersByEmail } from "@/lib/teaching/recipientResolution";
import type {
  TutoringSessionInput,
  TutoringSessionUpdateInput,
} from "@/lib/validators/tutoringSession";
import { buildTutoringSnapshot } from "./sessionSnapshot";

export async function resolveTutoringRecipients(
  prisma: PrismaClient,
  args: {
    teachingUser: TeachingUser;
    userEmails: readonly string[];
    groupIds: readonly string[];
  },
) {
  const uniqueGroupIds = [...new Set(args.groupIds.filter(Boolean))];
  const [users, groups] = await Promise.all([
    resolveUsersByEmail(prisma, args.userEmails),
    uniqueGroupIds.length
      ? prisma.learningGroup.findMany({
          where: {
            id: { in: uniqueGroupIds },
            ...ownedTeachingRecordWhere(args.teachingUser),
          },
          select: { id: true },
        })
      : Promise.resolve([]),
  ]);

  if (users.missingEmails.length) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "Some students do not have ZoeSkoul accounts.",
      missingEmails: users.missingEmails,
    };
  }
  if (groups.length !== uniqueGroupIds.length) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "One or more groups are unavailable.",
    };
  }

  return { ok: true as const, users: users.users, groups };
}

export async function resolveTutoringAudience(
  prisma: PrismaClient,
  args: { teachingUser: TeachingUser; input: TutoringSessionInput },
) {
  const [subject, recipients] = await Promise.all([
    prisma.practiceSubject.findFirst({
      where: { id: args.input.subjectId, status: "active" },
      select: { id: true, slug: true },
    }),
    resolveTutoringRecipients(prisma, {
      teachingUser: args.teachingUser,
      userEmails: args.input.userEmails,
      groupIds: args.input.groupIds,
    }),
  ]);

  if (!subject) {
    return { ok: false as const, status: 404 as const, error: "Course not found." };
  }
  if (!recipients.ok) return recipients;

  return {
    ok: true as const,
    subject,
    users: recipients.users,
    groups: recipients.groups,
  };
}

export async function createTutoringSession(
  prisma: PrismaClient,
  args: { teachingUser: TeachingUser; input: TutoringSessionInput },
) {
  const resolved = await resolveTutoringAudience(prisma, args);
  if (!resolved.ok) return resolved;

  const created = await prisma.tutoringSession.create({
    data: {
      slug: args.input.slug,
      title: args.input.title,
      description: args.input.description ?? null,
      ownerId: args.teachingUser.id,
      subjectId: resolved.subject.id,
      sourceSubjectSlug: resolved.subject.slug,
      selectionScope: args.input.selectionScope,
      sourceModuleSlug: args.input.sourceModuleSlug ?? null,
      sourceSectionSlug: args.input.sourceSectionSlug ?? null,
      sourceTopicId: args.input.sourceTopicId ?? null,
      snapshot: { version: 1, subjectSlug: resolved.subject.slug, modules: [] },
      status: args.input.status,
      allowStudentEditing: args.input.allowStudentEditing,
      sharedAt: args.input.status === "shared" ? new Date() : null,
      users: resolved.users.length
        ? { createMany: { data: resolved.users.map((user) => ({ userId: user.id })) } }
        : undefined,
      groups: resolved.groups.length
        ? { createMany: { data: resolved.groups.map((group) => ({ groupId: group.id })) } }
        : undefined,
    },
  });

  try {
    const snapshot = await buildTutoringSnapshot({
      sessionId: created.id,
      subjectSlug: resolved.subject.slug,
      selection: {
        scope: args.input.selectionScope,
        moduleSlug: args.input.sourceModuleSlug,
        sectionSlug: args.input.sourceSectionSlug,
        topicId: args.input.sourceTopicId,
      },
    });
    return {
      ok: true as const,
      session: await prisma.tutoringSession.update({
        where: { id: created.id },
        data: {
          snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        },
      }),
    };
  } catch (error) {
    await prisma.tutoringSession.delete({ where: { id: created.id } });
    throw error;
  }
}

export async function updateTutoringSession(
  prisma: PrismaClient,
  args: {
    teachingUser: TeachingUser;
    sessionId: string;
    input: TutoringSessionUpdateInput;
  },
) {
  const existing = await prisma.tutoringSession.findFirst({
    where: {
      id: args.sessionId,
      ...ownedTeachingRecordWhere(args.teachingUser),
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      allowStudentEditing: true,
      sharedAt: true,
      users: { include: { user: { select: { email: true } } } },
      groups: { select: { groupId: true } },
    },
  });
  if (!existing) {
    return { ok: false as const, status: 404 as const, error: "Not found" };
  }

  const audienceChanging =
    args.input.userEmails !== undefined || args.input.groupIds !== undefined;
  const recipients = audienceChanging
    ? await resolveTutoringRecipients(prisma, {
        teachingUser: args.teachingUser,
        userEmails:
          args.input.userEmails ??
          existing.users
            .map((row) => row.user.email)
            .filter((email): email is string => Boolean(email)),
        groupIds: args.input.groupIds ?? existing.groups.map((row) => row.groupId),
      })
    : null;
  if (recipients && !recipients.ok) return recipients;

  const nextStatus = args.input.status ?? existing.status;
  const session = await prisma.$transaction(async (tx) => {
    if (args.input.userEmails !== undefined) {
      await tx.tutoringSessionUser.deleteMany({ where: { sessionId: args.sessionId } });
      if (recipients?.ok && recipients.users.length) {
        await tx.tutoringSessionUser.createMany({
          data: recipients.users.map((user) => ({
            sessionId: args.sessionId,
            userId: user.id,
          })),
        });
      }
    }

    if (args.input.groupIds !== undefined) {
      await tx.tutoringSessionGroup.deleteMany({ where: { sessionId: args.sessionId } });
      if (recipients?.ok && recipients.groups.length) {
        await tx.tutoringSessionGroup.createMany({
          data: recipients.groups.map((group) => ({
            sessionId: args.sessionId,
            groupId: group.id,
          })),
        });
      }
    }

    return tx.tutoringSession.update({
      where: { id: args.sessionId },
      data: {
        ...(args.input.title !== undefined ? { title: args.input.title } : {}),
        ...(args.input.description !== undefined
          ? { description: args.input.description ?? null }
          : {}),
        ...(args.input.status !== undefined
          ? {
              status: nextStatus,
              sharedAt:
                nextStatus === "shared"
                  ? existing.sharedAt ?? new Date()
                  : null,
            }
          : {}),
        ...(args.input.allowStudentEditing !== undefined
          ? { allowStudentEditing: args.input.allowStudentEditing }
          : {}),
      },
    });
  });

  return { ok: true as const, session };
}
