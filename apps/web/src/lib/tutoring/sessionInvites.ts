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

type TutoringInviteDb = Pick<PrismaClient, "tutoringSessionInvite">;

export { classroomInviteState as tutoringSessionInviteState };
export { maskClassroomInviteEmail as maskTutoringInviteEmail };

export async function syncPendingTutoringSessionInvites(
  prisma: TutoringInviteDb,
  args: {
    sessionId: string;
    pendingEmails: readonly string[];
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const emails = normalizeEmails(args.pendingEmails);

  await prisma.tutoringSessionInvite.updateMany({
    where: {
      sessionId: args.sessionId,
      acceptedAt: null,
      revokedAt: null,
      ...(emails.length ? { email: { notIn: emails } } : {}),
    },
    data: { revokedAt: now },
  });

  for (const email of emails) {
    const existing = await prisma.tutoringSessionInvite.findUnique({
      where: { sessionId_email: { sessionId: args.sessionId, email } },
      select: { expiresAt: true, acceptedAt: true, revokedAt: true },
    });
    const shouldRotate =
      !existing || Boolean(existing.acceptedAt || existing.revokedAt) || existing.expiresAt <= now;
    const token = createClassroomInviteToken();

    await prisma.tutoringSessionInvite.upsert({
      where: { sessionId_email: { sessionId: args.sessionId, email } },
      create: {
        sessionId: args.sessionId,
        email,
        tokenHash: hashClassroomInviteToken(token),
        expiresAt: classroomInviteExpiry(now),
      },
      update: {
        revokedAt: null,
        acceptedAt: null,
        acceptedByUserId: null,
        ...(shouldRotate
          ? {
              tokenHash: hashClassroomInviteToken(token),
              expiresAt: classroomInviteExpiry(now),
              sentAt: null,
            }
          : {}),
      },
    });
  }
}

export async function rotateTutoringSessionInvite(
  prisma: TutoringInviteDb,
  args: { sessionId: string; email: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const [email] = normalizeEmails([args.email]);
  if (!email) return null;

  const token = createClassroomInviteToken();
  const invite = await prisma.tutoringSessionInvite.update({
    where: { sessionId_email: { sessionId: args.sessionId, email } },
    data: {
      tokenHash: hashClassroomInviteToken(token),
      expiresAt: classroomInviteExpiry(now),
      revokedAt: null,
      acceptedAt: null,
      acceptedByUserId: null,
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

export async function acceptTutoringSessionInvite(
  prisma: PrismaClient,
  args: {
    token: string;
    userId: string;
    userEmail: string | null | undefined;
    now?: Date;
  },
) {
  const now = args.now ?? new Date();
  const invite = await findTutoringSessionInviteByToken(prisma, args.token);
  if (!invite) return { ok: false as const, reason: "not_found" as const };

  const state = classroomInviteState(invite, now);
  if (state === "revoked" || state === "expired") {
    return { ok: false as const, reason: state };
  }

  const [accountEmail] = normalizeEmails([args.userEmail ?? ""]);
  if (!accountEmail || accountEmail !== invite.email) {
    return {
      ok: false as const,
      reason: "email_mismatch" as const,
      session: invite.session,
      invitedEmail: invite.email,
    };
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
        acceptedAt: invite.acceptedAt ?? now,
        acceptedByUserId: args.userId,
      },
    }),
  ]);

  return { ok: true as const, session: invite.session };
}
