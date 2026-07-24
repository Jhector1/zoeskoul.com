import "server-only";

import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@/lib/prisma";
import type { TeachingUser } from "@/lib/teaching/teachingAccess";
import { ownedTeachingRecordWhere } from "@/lib/teaching/teachingAccess";
import {
  normalizeEmails,
  resolveUsersByEmail,
} from "@/lib/teaching/recipientResolution";
import type {
  TutoringSessionInput,
  TutoringSessionUpdateInput,
} from "@/lib/validators/tutoringSession";
import { TUTORING_SESSION_LIMITS } from "./sessionLimits";
import { buildTutoringSnapshot, serializeTutoringSnapshot } from "./sessionSnapshot";
import { syncPendingTutoringSessionInvites } from "./sessionInvites";

class TutoringSessionQuotaError extends Error {}

export async function resolveTutoringRecipients(
  prisma: PrismaClient,
  args: {
    teachingUser: TeachingUser;
    userEmails: readonly string[];
    groupIds: readonly string[];
  },
) {
  const recipientEmails = normalizeEmails(args.userEmails);
  const uniqueGroupIds = [...new Set(args.groupIds.filter(Boolean))];
  const [users, groups] = await Promise.all([
    resolveUsersByEmail(prisma, recipientEmails),
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

  if (groups.length !== uniqueGroupIds.length) {
    return {
      ok: false as const,
      status: 400 as const,
      error: "One or more groups are unavailable.",
    };
  }

  return {
    ok: true as const,
    users: users.users,
    pendingEmails: users.missingEmails,
    recipientEmails,
    groups,
  };
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
    pendingEmails: recipients.pendingEmails,
    recipientEmails: recipients.recipientEmails,
    groups: recipients.groups,
  };
}

export async function createTutoringSession(
  prisma: PrismaClient,
  args: { teachingUser: TeachingUser; input: TutoringSessionInput },
) {
  const resolved = await resolveTutoringAudience(prisma, args);
  if (!resolved.ok) return resolved;

  // Build and validate the frozen payload before a visible database row exists.
  // A UUID is a valid Prisma String id and lets snapshot module ids remain stable.
  const sessionId = randomUUID();
  const snapshot = await buildTutoringSnapshot({
    sessionId,
    subjectSlug: resolved.subject.slug,
    selection: {
      scope: args.input.selectionScope,
      moduleSlug: args.input.sourceModuleSlug,
      sectionSlug: args.input.sourceSectionSlug,
      topicId: args.input.sourceTopicId,
    },
  });
  const serialized = serializeTutoringSnapshot(snapshot);

  try {
    const session = await prisma.$transaction(
      async (tx) => {
        const usage = await tx.tutoringSession.aggregate({
          where: { ownerId: args.teachingUser.id },
          _count: { _all: true },
          _sum: { snapshotBytes: true },
        });
        if (usage._count._all >= TUTORING_SESSION_LIMITS.maxSessionsPerOwner) {
          throw new TutoringSessionQuotaError(
            `Tutoring session limit reached (${TUTORING_SESSION_LIMITS.maxSessionsPerOwner}).`,
          );
        }
        if (
          (usage._sum.snapshotBytes ?? 0) + serialized.snapshotBytes >
          TUTORING_SESSION_LIMITS.maxSnapshotBytesPerOwner
        ) {
          throw new TutoringSessionQuotaError(
            "Tutoring snapshot storage limit reached.",
          );
        }

        const created = await tx.tutoringSession.create({
          data: {
            id: sessionId,
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
            snapshot: JSON.parse(serialized.serialized) as Prisma.InputJsonValue,
            snapshotVersion: snapshot.version,
            snapshotBytes: serialized.snapshotBytes,
            moduleKeys: serialized.moduleKeys,
            boardKeys: serialized.boardKeys,
            status: args.input.status,
            allowStudentEditing: args.input.allowStudentEditing,
            sharedAt: args.input.status === "shared" ? new Date() : null,
            users: resolved.users.length
              ? {
                  createMany: {
                    data: resolved.users.map((user) => ({ userId: user.id })),
                  },
                }
              : undefined,
            groups: resolved.groups.length
              ? {
                  createMany: {
                    data: resolved.groups.map((group) => ({ groupId: group.id })),
                  },
                }
              : undefined,
          },
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            allowStudentEditing: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        await syncPendingTutoringSessionInvites(tx, {
          sessionId: created.id,
          pendingEmails: resolved.pendingEmails,
        });
        return created;
      },
      { isolationLevel: "Serializable" },
    );

    return {
      ok: true as const,
      session,
      pendingInvites: resolved.pendingEmails,
    };
  } catch (error) {
    if (error instanceof TutoringSessionQuotaError) {
      return {
        ok: false as const,
        status: 409 as const,
        error: error.message,
      };
    }
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
      invites: {
        where: { acceptedAt: null, revokedAt: null },
        select: { email: true },
      },
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
          [
            ...existing.users
              .map((row) => row.user.email)
              .filter((email): email is string => Boolean(email)),
            ...existing.invites.map((invite) => invite.email),
          ],
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

    if (args.input.userEmails !== undefined && recipients?.ok) {
      await syncPendingTutoringSessionInvites(tx, {
        sessionId: args.sessionId,
        pendingEmails: recipients.pendingEmails,
      });
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
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        allowStudentEditing: true,
        updatedAt: true,
      },
    });
  });

  return {
    ok: true as const,
    session,
    pendingInvites:
      recipients?.ok
        ? recipients.pendingEmails
        : existing.invites.map((invite) => invite.email),
  };
}
