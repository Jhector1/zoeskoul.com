import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import {
  classroomInviteExpiry,
  createClassroomInviteToken,
  hashClassroomInviteToken,
  maskClassroomInviteEmail,
} from "@/lib/invitations/inviteToken";
import { normalizeEmails } from "@/lib/teaching/recipientResolution";

type TutoringInviteDb = Pick<
  PrismaClient,
  "tutoringSessionInvite" | "tutoringSessionUser"
>;

export type TutoringInviteRecipient = {
  email: string;
  userId: string | null;
};

export type TutoringInviteLifecycleState =
  | "invited"
  | "viewed"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled";

export { maskClassroomInviteEmail as maskTutoringInviteEmail };

export function tutoringSessionInviteState(
  invite: {
    viewedAt?: Date | string | null;
    acceptedAt?: Date | string | null;
    declinedAt?: Date | string | null;
    revokedAt?: Date | string | null;
    expiresAt: Date | string;
  },
  now = new Date(),
): TutoringInviteLifecycleState {
  if (invite.revokedAt) return "cancelled";
  if (invite.acceptedAt) return "accepted";
  if (invite.declinedAt) return "declined";
  if (new Date(invite.expiresAt) <= now) return "expired";
  if (invite.viewedAt) return "viewed";
  return "invited";
}

function normalizedRecipients(
  recipients: readonly TutoringInviteRecipient[],
): TutoringInviteRecipient[] {
  const usersByEmail = new Map<string, string | null>();
  for (const recipient of recipients) {
    const [email] = normalizeEmails([recipient.email]);
    if (!email) continue;
    const previous = usersByEmail.get(email) ?? null;
    usersByEmail.set(email, recipient.userId ?? previous);
  }
  return [...usersByEmail].map(([email, userId]) => ({ email, userId }));
}

/**
 * Synchronize every explicitly entered email with one invitation record.
 * Existing accounts and not-yet-created accounts intentionally use the same
 * record and token lifecycle. Direct tutoring membership is created only when
 * the invitation is accepted.
 */
export async function syncTutoringSessionInvites(
  prisma: TutoringInviteDb,
  args: {
    sessionId: string;
    recipients: readonly TutoringInviteRecipient[];
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const recipients = normalizedRecipients(args.recipients);
  const emails = recipients.map((recipient) => recipient.email);
  const existingRows = await prisma.tutoringSessionInvite.findMany({
    where: { sessionId: args.sessionId },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      viewedAt: true,
      acceptedAt: true,
      declinedAt: true,
      acceptedByUserId: true,
      invitedUserId: true,
      revokedAt: true,
    },
  });
  const existingByEmail = new Map(existingRows.map((row) => [row.email, row]));
  const removedRows = existingRows.filter((row) => !emails.includes(row.email));

  if (removedRows.length) {
    await prisma.tutoringSessionInvite.updateMany({
      where: { id: { in: removedRows.map((row) => row.id) } },
      data: { revokedAt: now },
    });
    const removedUserIds = [
      ...new Set(
        removedRows
          .flatMap((row) => [row.invitedUserId, row.acceptedByUserId])
          .filter((userId): userId is string => Boolean(userId)),
      ),
    ];
    if (removedUserIds.length) {
      await prisma.tutoringSessionUser.deleteMany({
        where: {
          sessionId: args.sessionId,
          userId: { in: removedUserIds },
        },
      });
    }
  }

  for (const recipient of recipients) {
    const existing = existingByEmail.get(recipient.email);
    const acceptedByDifferentUser = Boolean(
      existing?.acceptedAt &&
        recipient.userId &&
        existing.acceptedByUserId &&
        existing.acceptedByUserId !== recipient.userId,
    );
    const shouldReactivate = Boolean(
      existing &&
        (existing.revokedAt ||
          existing.declinedAt ||
          existing.expiresAt <= now ||
          acceptedByDifferentUser),
    );
    const token = createClassroomInviteToken();

    await prisma.tutoringSessionInvite.upsert({
      where: {
        sessionId_email: {
          sessionId: args.sessionId,
          email: recipient.email,
        },
      },
      create: {
        sessionId: args.sessionId,
        email: recipient.email,
        invitedUserId: recipient.userId,
        tokenHash: hashClassroomInviteToken(token),
        expiresAt: classroomInviteExpiry(now),
        emailStatus: "NOT_SENT",
      },
      update: {
        invitedUserId: recipient.userId,
        ...(shouldReactivate
          ? {
              tokenHash: hashClassroomInviteToken(token),
              expiresAt: classroomInviteExpiry(now),
              viewedAt: null,
              declinedAt: null,
              revokedAt: null,
              acceptedAt: null,
              acceptedByUserId: null,
              emailStatus: "NOT_SENT" as const,
              emailLastAttemptAt: null,
              emailError: null,
              sentAt: null,
            }
          : {}),
      },
    });
  }

  return prisma.tutoringSessionInvite.findMany({
    where: {
      sessionId: args.sessionId,
      email: { in: emails },
      revokedAt: null,
    },
    orderBy: { email: "asc" },
    select: {
      id: true,
      email: true,
      invitedUserId: true,
      viewedAt: true,
      acceptedAt: true,
      declinedAt: true,
      revokedAt: true,
      expiresAt: true,
      sentAt: true,
      emailStatus: true,
      emailLastAttemptAt: true,
      emailError: true,
    },
  });
}

/** Backward-compatible name for older call sites while patches roll out. */
export async function syncPendingTutoringSessionInvites(
  prisma: TutoringInviteDb,
  args: {
    sessionId: string;
    pendingEmails: readonly string[];
    now?: Date;
  },
) {
  return syncTutoringSessionInvites(prisma, {
    sessionId: args.sessionId,
    recipients: normalizeEmails(args.pendingEmails).map((email) => ({
      email,
      userId: null,
    })),
    now: args.now,
  });
}

export async function rotateTutoringSessionInvite(
  prisma: TutoringInviteDb,
  args: { sessionId: string; email: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const [email] = normalizeEmails([args.email]);
  if (!email) return null;

  const existing = await prisma.tutoringSessionInvite.findUnique({
    where: { sessionId_email: { sessionId: args.sessionId, email } },
    select: {
      id: true,
      acceptedAt: true,
      declinedAt: true,
      revokedAt: true,
      expiresAt: true,
    },
  });
  if (!existing || existing.acceptedAt) return null;

  const token = createClassroomInviteToken();
  const wasInactive = Boolean(
    existing.declinedAt || existing.revokedAt || existing.expiresAt <= now,
  );
  const invite = await prisma.tutoringSessionInvite.update({
    where: { id: existing.id },
    data: {
      tokenHash: hashClassroomInviteToken(token),
      expiresAt: classroomInviteExpiry(now),
      viewedAt: null,
      declinedAt: null,
      revokedAt: null,
      ...(wasInactive
        ? {
            emailStatus: "NOT_SENT" as const,
            emailLastAttemptAt: null,
            emailError: null,
            sentAt: null,
          }
        : {}),
    },
    select: { id: true, email: true, expiresAt: true },
  });

  return { invite, token };
}

export async function findTutoringSessionInviteByToken(
  prisma: TutoringInviteDb,
  token: string,
) {
  const raw = String(token ?? "").trim();
  if (!raw || raw.length > 256) return null;

  return prisma.tutoringSessionInvite.findUnique({
    where: { tokenHash: hashClassroomInviteToken(raw) },
    include: {
      session: {
        include: {
          subject: { select: { id: true, slug: true, title: true } },
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
}

export async function linkTutoringSessionInvitesToUser(
  prisma: Pick<PrismaClient, "tutoringSessionInvite">,
  args: { userId: string; userEmail: string | null | undefined },
) {
  const [email] = normalizeEmails([args.userEmail ?? ""]);
  if (!email) return;
  await prisma.tutoringSessionInvite.updateMany({
    where: {
      email,
      OR: [{ invitedUserId: null }, { invitedUserId: args.userId }],
    },
    data: { invitedUserId: args.userId },
  });
}

export async function markTutoringSessionInviteViewed(
  prisma: Pick<PrismaClient, "tutoringSessionInvite">,
  args: { inviteId: string; userId: string; now?: Date },
) {
  const now = args.now ?? new Date();
  await prisma.tutoringSessionInvite.updateMany({
    where: {
      id: args.inviteId,
      OR: [{ invitedUserId: null }, { invitedUserId: args.userId }],
      acceptedAt: null,
      declinedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    data: { invitedUserId: args.userId, viewedAt: now },
  });
}

async function loadInviteForResponse(
  prisma: PrismaClient,
  args: { inviteId: string; userId: string; userEmail: string | null | undefined },
) {
  const [email] = normalizeEmails([args.userEmail ?? ""]);
  const invite = await prisma.tutoringSessionInvite.findUnique({
    where: { id: args.inviteId },
    include: {
      session: {
        include: {
          subject: { select: { id: true, slug: true, title: true } },
          owner: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });
  if (!invite) return { ok: false as const, reason: "not_found" as const };
  const matchesUser = invite.invitedUserId
    ? invite.invitedUserId === args.userId
    : Boolean(email && email === invite.email);
  if (!matchesUser) {
    return {
      ok: false as const,
      reason: "email_mismatch" as const,
      session: invite.session,
      invitedEmail: invite.email,
    };
  }
  return { ok: true as const, invite };
}

export async function acceptTutoringSessionInviteById(
  prisma: PrismaClient,
  args: {
    inviteId: string;
    userId: string;
    userEmail: string | null | undefined;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const loaded = await loadInviteForResponse(prisma, args);
  if (!loaded.ok) return loaded;
  const invite = loaded.invite;
  const state = tutoringSessionInviteState(invite, now);
  if (state === "cancelled" || state === "expired" || state === "declined") {
    return { ok: false as const, reason: state };
  }
  if (invite.session.status !== "live" && invite.session.status !== "shared") {
    return {
      ok: false as const,
      reason: "session_unavailable" as const,
      session: invite.session,
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
    prisma.tutoringSessionUser.upsert({
      where: {
        sessionId_userId: {
          sessionId: invite.sessionId,
          userId: args.userId,
        },
      },
      create: { sessionId: invite.sessionId, userId: args.userId },
      update: {},
    }),
    prisma.tutoringSessionInvite.update({
      where: { id: invite.id },
      data: {
        invitedUserId: args.userId,
        viewedAt: invite.viewedAt ?? now,
        acceptedAt: invite.acceptedAt ?? now,
        acceptedByUserId: args.userId,
        declinedAt: null,
      },
    }),
  ]);

  return { ok: true as const, session: invite.session };
}

export async function declineTutoringSessionInviteById(
  prisma: PrismaClient,
  args: {
    inviteId: string;
    userId: string;
    userEmail: string | null | undefined;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const loaded = await loadInviteForResponse(prisma, args);
  if (!loaded.ok) return loaded;
  const invite = loaded.invite;
  const state = tutoringSessionInviteState(invite, now);
  if (state === "accepted") {
    return { ok: false as const, reason: "already_accepted" as const };
  }
  if (state === "cancelled" || state === "expired") {
    return { ok: false as const, reason: state };
  }

  await prisma.tutoringSessionInvite.update({
    where: { id: invite.id },
    data: {
      invitedUserId: args.userId,
      viewedAt: invite.viewedAt ?? now,
      declinedAt: now,
    },
  });
  return { ok: true as const, session: invite.session };
}

export async function acceptTutoringSessionInvite(
  prisma: PrismaClient,
  args: {
    token: string;
    userId: string;
    userEmail: string | null | undefined;
    now?: Date;
  },
) {
  const invite = await findTutoringSessionInviteByToken(prisma, args.token);
  if (!invite) return { ok: false as const, reason: "not_found" as const };
  return acceptTutoringSessionInviteById(prisma, {
    inviteId: invite.id,
    userId: args.userId,
    userEmail: args.userEmail,
    now: args.now,
  });
}
