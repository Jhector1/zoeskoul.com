import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import {
  buildClassroomInviteMailto,
  sendClassroomInviteEmail,
} from "@/lib/invitations/classroomInviteEmail";
import { resolveSubjectTitle } from "@/lib/subjects/resolveSubjectTitle";
import { rotateTutoringSessionInvite } from "./sessionInvites";

export type TutoringInviteLocale = "en" | "es" | "fr" | "ht";

type PreparedInvite = {
  id: string;
  email: string;
  token: string;
  expiresAt: Date;
};

function invitationErrorText(delivery: Awaited<ReturnType<typeof sendClassroomInviteEmail>>) {
  if (delivery.delivered) return null;
  if (delivery.reason === "not_configured") {
    return "Automatic invitation email delivery is not configured.";
  }
  if (delivery.reason === "provider_error") {
    return (delivery.detail ?? "Email provider error.").slice(0, 1000);
  }
  return "The email provider did not accept the invitation.";
}

async function loadDeliveryContext(
  prisma: PrismaClient,
  args: { sessionId: string; locale: TutoringInviteLocale },
) {
  const session = await prisma.tutoringSession.findUnique({
    where: { id: args.sessionId },
    select: {
      id: true,
      title: true,
      status: true,
      owner: { select: { name: true, email: true } },
      subject: { select: { title: true, slug: true } },
    },
  });
  if (!session) return null;
  const courseTitle = await resolveSubjectTitle({
    subjectSlug: session.subject.slug,
    locale: args.locale,
    fallback: session.subject.title,
  });
  return {
    session,
    courseTitle,
    instructorName:
      session.owner.name?.trim() || session.owner.email?.trim() || "Your tutor",
  };
}

export async function deliverPreparedTutoringInvite(
  prisma: PrismaClient,
  args: {
    sessionId: string;
    origin: string;
    locale: TutoringInviteLocale;
    prepared: PreparedInvite;
  },
) {
  const context = await loadDeliveryContext(prisma, args);
  if (!context) return { delivered: false as const, reason: "not_found" as const };
  if (context.session.status === "archived") {
    return { delivered: false as const, reason: "session_unavailable" as const };
  }

  const inviteUrl = `${args.origin}/${args.locale}/invitations/tutoring/${encodeURIComponent(args.prepared.token)}`;
  const emailArgs = {
    to: args.prepared.email,
    inviteUrl,
    classroomTitle: context.session.title,
    courseTitle: context.courseTitle,
    instructorName: context.instructorName,
    expiresAt: args.prepared.expiresAt,
    classroomKind: "tutoring session" as const,
  };
  const mailtoHref = buildClassroomInviteMailto(emailArgs);
  const delivery = await sendClassroomInviteEmail(emailArgs);
  const attemptedAt = new Date();

  if (!delivery.delivered) {
    const emailError = invitationErrorText(delivery);
    await prisma.tutoringSessionInvite.update({
      where: { id: args.prepared.id },
      data: {
        emailStatus: "FAILED",
        emailLastAttemptAt: attemptedAt,
        emailError,
      },
    });
    return {
      delivered: false as const,
      reason: delivery.reason,
      detail: delivery.reason === "provider_error" ? delivery.detail : undefined,
      provider: delivery.provider,
      inviteUrl,
      mailtoHref,
      expiresAt: args.prepared.expiresAt,
    };
  }

  await prisma.tutoringSessionInvite.update({
    where: { id: args.prepared.id },
    data: {
      emailStatus: "SENT",
      emailLastAttemptAt: attemptedAt,
      emailError: null,
      sentAt: attemptedAt,
    },
  });
  return {
    delivered: true as const,
    provider: delivery.provider,
    messageId: delivery.messageId,
    inviteUrl,
    mailtoHref,
    expiresAt: args.prepared.expiresAt,
    sentAt: attemptedAt,
  };
}

/**
 * Deliver only invitations that have never been attempted. Failed deliveries
 * remain visible for an explicit Resend action instead of retrying whenever an
 * unrelated session field is saved.
 */
export async function autoDeliverTutoringSessionInvites(
  prisma: PrismaClient,
  args: {
    sessionId: string;
    origin: string;
    locale: TutoringInviteLocale;
  },
) {
  const session = await prisma.tutoringSession.findUnique({
    where: { id: args.sessionId },
    select: { status: true },
  });
  if (!session || session.status === "archived") {
    return { sent: 0, failed: 0, skipped: true };
  }

  const rows = await prisma.tutoringSessionInvite.findMany({
    where: {
      sessionId: args.sessionId,
      acceptedAt: null,
      declinedAt: null,
      revokedAt: null,
      emailStatus: "NOT_SENT",
    },
    select: { email: true },
    orderBy: { createdAt: "asc" },
  });

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const rotated = await rotateTutoringSessionInvite(prisma, {
        sessionId: args.sessionId,
        email: row.email,
      });
      if (!rotated) continue;
      const result = await deliverPreparedTutoringInvite(prisma, {
        ...args,
        prepared: {
          id: rotated.invite.id,
          email: rotated.invite.email,
          token: rotated.token,
          expiresAt: rotated.invite.expiresAt,
        },
      });
      if (result.delivered) sent += 1;
      else failed += 1;
    } catch (error) {
      failed += 1;
      console.error("[tutoring-invite] automatic delivery failed", {
        sessionId: args.sessionId,
        recipient: row.email,
        error,
      });
    }
  }
  return { sent, failed, skipped: false };
}
