import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import { normalizeEmails } from "@/lib/teaching/recipientResolution";
import {
  classroomInviteExpiry,
  classroomInviteState,
  createClassroomInviteToken,
  hashClassroomInviteToken,
  maskClassroomInviteEmail,
} from "@/lib/invitations/inviteToken";

type InviteDb = Pick<PrismaClient, "learningAssignmentInvite">;

export function hashLearningAssignmentInviteToken(token: string) {
  return hashClassroomInviteToken(token);
}

export function createLearningAssignmentInviteToken() {
  return createClassroomInviteToken();
}

export function learningAssignmentInviteExpiry(now = new Date()) {
  return classroomInviteExpiry(now);
}

export function learningAssignmentInviteState(
  invite: {
    acceptedAt?: Date | string | null;
    revokedAt?: Date | string | null;
    expiresAt: Date | string;
  },
  now = new Date(),
) {
  return classroomInviteState(invite, now);
}

/**
 * Keeps pending invitations aligned with email recipients that do not yet have
 * accounts. Existing users are assigned through LearningAssignmentUser; only
 * unresolved emails need an invitation record.
 */
export async function syncPendingLearningAssignmentInvites(
  prisma: InviteDb,
  args: {
    assignmentId: string;
    pendingEmails: readonly string[];
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const emails = normalizeEmails(args.pendingEmails);

  await prisma.learningAssignmentInvite.updateMany({
    where: {
      assignmentId: args.assignmentId,
      acceptedAt: null,
      revokedAt: null,
      ...(emails.length ? { email: { notIn: emails } } : {}),
    },
    data: { revokedAt: now },
  });

  for (const email of emails) {
    const existing = await prisma.learningAssignmentInvite.findUnique({
      where: {
        assignmentId_email: {
          assignmentId: args.assignmentId,
          email,
        },
      },
      select: { expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    const shouldRotate =
      !existing || Boolean(existing.acceptedAt || existing.revokedAt) || existing.expiresAt <= now;
    const token = createLearningAssignmentInviteToken();
    const tokenHash = hashLearningAssignmentInviteToken(token);

    await prisma.learningAssignmentInvite.upsert({
      where: {
        assignmentId_email: {
          assignmentId: args.assignmentId,
          email,
        },
      },
      create: {
        assignmentId: args.assignmentId,
        email,
        tokenHash,
        expiresAt: learningAssignmentInviteExpiry(now),
      },
      update: {
        revokedAt: null,
        acceptedAt: null,
        acceptedByUserId: null,
        ...(shouldRotate
          ? {
              tokenHash,
              expiresAt: learningAssignmentInviteExpiry(now),
              sentAt: null,
            }
          : {}),
      },
    });
  }
}

export async function rotateLearningAssignmentInvite(
  prisma: InviteDb,
  args: { assignmentId: string; email: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const [email] = normalizeEmails([args.email]);
  if (!email) return null;

  const token = createLearningAssignmentInviteToken();
  const invite = await prisma.learningAssignmentInvite.update({
    where: {
      assignmentId_email: {
        assignmentId: args.assignmentId,
        email,
      },
    },
    data: {
      tokenHash: hashLearningAssignmentInviteToken(token),
      expiresAt: learningAssignmentInviteExpiry(now),
      revokedAt: null,
      acceptedAt: null,
      acceptedByUserId: null,
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
    },
  });

  return { invite, token };
}

export async function findLearningAssignmentInviteByToken(
  prisma: InviteDb,
  token: string,
) {
  const raw = String(token ?? "").trim();
  if (!raw || raw.length > 256) return null;

  return prisma.learningAssignmentInvite.findUnique({
    where: { tokenHash: hashLearningAssignmentInviteToken(raw) },
    include: {
      assignment: {
        include: {
          subject: {
            include: {
              modules: { orderBy: { order: "asc" }, take: 1 },
            },
          },
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function acceptLearningAssignmentInvite(
  prisma: PrismaClient,
  args: {
    token: string;
    userId: string;
    userEmail: string | null | undefined;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const invite = await findLearningAssignmentInviteByToken(prisma, args.token);
  if (!invite) return { ok: false as const, reason: "not_found" as const };

  const state = learningAssignmentInviteState(invite, now);
  if (state === "revoked" || state === "expired") {
    return { ok: false as const, reason: state };
  }

  const [accountEmail] = normalizeEmails([args.userEmail ?? ""]);
  if (!accountEmail || accountEmail !== invite.email) {
    return {
      ok: false as const,
      reason: "email_mismatch" as const,
      assignment: invite.assignment,
      invitedEmail: invite.email,
    };
  }

  if (invite.assignment.status !== "assigned") {
    return {
      ok: false as const,
      reason: "assignment_unavailable" as const,
      assignment: invite.assignment,
    };
  }

  if (
    invite.acceptedAt &&
    invite.acceptedByUserId &&
    invite.acceptedByUserId !== args.userId
  ) {
    return { ok: false as const, reason: "already_used" as const };
  }

  await prisma.$transaction([
    prisma.learningAssignmentUser.upsert({
      where: {
        assignmentId_userId: {
          assignmentId: invite.assignmentId,
          userId: args.userId,
        },
      },
      create: {
        assignmentId: invite.assignmentId,
        userId: args.userId,
      },
      update: {},
    }),
    prisma.learningAssignmentInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: invite.acceptedAt ?? now,
        acceptedByUserId: args.userId,
      },
    }),
  ]);

  return {
    ok: true as const,
    assignment: invite.assignment,
  };
}

export function maskInviteEmail(email: string) {
  return maskClassroomInviteEmail(email);
}
