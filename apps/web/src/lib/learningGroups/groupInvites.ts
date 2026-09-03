import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import {
  classroomInviteExpiry,
  classroomInviteState,
  createClassroomInviteToken,
  hashClassroomInviteToken,
  maskClassroomInviteEmail,
} from "@/lib/invitations/inviteToken";
import { normalizeEmails } from "@/lib/teaching/recipientResolution";

type GroupInviteDb = Pick<PrismaClient, "learningGroupInvite">;

export function hashLearningGroupInviteToken(token: string) {
  return hashClassroomInviteToken(token);
}

export function createLearningGroupInviteToken() {
  return createClassroomInviteToken();
}

export function learningGroupInviteExpiry(now = new Date()) {
  return classroomInviteExpiry(now);
}

export function learningGroupInviteState(
  invite: {
    acceptedAt?: Date | string | null;
    revokedAt?: Date | string | null;
    expiresAt: Date | string;
  },
  now = new Date(),
) {
  return classroomInviteState(invite, now);
}

export {
  maskClassroomInviteEmail as maskLearningGroupInviteEmail,
};

/**
 * Class invitations own only class-membership intent.
 * Teacher-entered learner emails remain invitation intent until accepted,
 * regardless of whether a ZoeSkoul account already exists for the email.
 * Acceptance is the normal Teacher path that creates LearningGroupMember.
 */
export async function syncPendingLearningGroupInvites(
  prisma: GroupInviteDb,
  args: {
    groupId: string;
    pendingEmails: readonly string[];
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const emails = normalizeEmails(args.pendingEmails);
  const autoDeliveryEmails: string[] = [];

  await prisma.learningGroupInvite.updateMany({
    where: {
      groupId: args.groupId,
      acceptedAt: null,
      revokedAt: null,
      ...(emails.length ? { email: { notIn: emails } } : {}),
    },
    data: { revokedAt: now },
  });

  for (const email of emails) {
    const existing = await prisma.learningGroupInvite.findUnique({
      where: { groupId_email: { groupId: args.groupId, email } },
      select: { expiresAt: true, acceptedAt: true, revokedAt: true },
    });

    const shouldRotate =
      !existing ||
      Boolean(existing.acceptedAt || existing.revokedAt) ||
      existing.expiresAt <= now;

    const token = createLearningGroupInviteToken();
    const tokenHash = hashLearningGroupInviteToken(token);

    await prisma.learningGroupInvite.upsert({
      where: { groupId_email: { groupId: args.groupId, email } },
      create: {
        groupId: args.groupId,
        email,
        tokenHash,
        expiresAt: learningGroupInviteExpiry(now),
      },
      update: {
        revokedAt: null,
        acceptedAt: null,
        acceptedByUserId: null,
        ...(shouldRotate
          ? {
              tokenHash,
              expiresAt: learningGroupInviteExpiry(now),
              sentAt: null,
            }
          : {}),
      },
    });

    if (shouldRotate) autoDeliveryEmails.push(email);
  }

  return { autoDeliveryEmails };
}

export async function rotateLearningGroupInvite(
  prisma: GroupInviteDb,
  args: {
    groupId: string;
    email: string;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const [email] = normalizeEmails([args.email]);
  if (!email) return null;

  const token = createLearningGroupInviteToken();
  const invite = await prisma.learningGroupInvite.update({
    where: {
      groupId_email: {
        groupId: args.groupId,
        email,
      },
    },
    data: {
      tokenHash: hashLearningGroupInviteToken(token),
      expiresAt: learningGroupInviteExpiry(now),
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

export async function findLearningGroupInviteByToken(
  prisma: Pick<PrismaClient, "learningGroupInvite">,
  token: string,
) {
  const raw = String(token ?? "").trim();
  if (!raw || raw.length > 256) return null;

  return prisma.learningGroupInvite.findUnique({
    where: {
      tokenHash: hashLearningGroupInviteToken(raw),
    },
    include: {
      group: {
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      },
    },
  });
}

export async function acceptLearningGroupInvite(
  prisma: PrismaClient,
  args: {
    token: string;
    userId: string;
    userEmail: string | null | undefined;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const invite = await findLearningGroupInviteByToken(prisma, args.token);

  if (!invite) {
    return { ok: false as const, reason: "not_found" as const };
  }

  const state = learningGroupInviteState(invite, now);
  if (state === "revoked" || state === "expired") {
    return {
      ok: false as const,
      reason: state,
      group: invite.group,
    };
  }

  const [accountEmail] = normalizeEmails([args.userEmail ?? ""]);
  if (!accountEmail || accountEmail !== invite.email) {
    return {
      ok: false as const,
      reason: "email_mismatch" as const,
      group: invite.group,
      invitedEmail: invite.email,
    };
  }

  if (
    invite.acceptedAt &&
    invite.acceptedByUserId &&
    invite.acceptedByUserId !== args.userId
  ) {
    return {
      ok: false as const,
      reason: "already_used" as const,
      group: invite.group,
    };
  }

  await prisma.$transaction([
    prisma.learningGroupMember.upsert({
      where: {
        groupId_userId: {
          groupId: invite.groupId,
          userId: args.userId,
        },
      },
      create: {
        groupId: invite.groupId,
        userId: args.userId,
        role: "student",
      },
      // Preserve an existing instructor/co-teacher membership.
      update: {},
    }),
    prisma.learningGroupInvite.update({
      where: { id: invite.id },
      data: {
        acceptedAt: invite.acceptedAt ?? now,
        acceptedByUserId: args.userId,
      },
    }),
  ]);

  return {
    ok: true as const,
    group: invite.group,
  };
}
