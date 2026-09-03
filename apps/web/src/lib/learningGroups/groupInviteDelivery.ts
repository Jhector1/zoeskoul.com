import "server-only";

import type { PrismaClient } from "@/lib/prisma";
import {
  buildLearningGroupInviteMailto,
  sendLearningGroupInviteEmail,
} from "@/lib/learningGroups/groupInviteEmail";
import {
  learningGroupInviteState,
  rotateLearningGroupInvite,
} from "@/lib/learningGroups/groupInvites";
import { normalizeEmails } from "@/lib/teaching/recipientResolution";

export type LearningGroupInviteLocale = "en" | "es" | "fr" | "ht";

function normalizeInviteLocale(value: string | null | undefined): LearningGroupInviteLocale {
  const normalized = value?.trim().toLowerCase();
  return normalized === "es" || normalized === "fr" || normalized === "ht"
    ? normalized
    : "en";
}

export function resolveLearningGroupInviteLocaleFromRequest(
  request: Request,
): LearningGroupInviteLocale {
  const referer = request.headers.get("referer");
  if (referer) {
    try {
      const first = new URL(referer).pathname.split("/").filter(Boolean)[0];
      if (first === "en" || first === "es" || first === "fr" || first === "ht") {
        return first;
      }
    } catch {
      // Fall through to Accept-Language/default.
    }
  }

  const language = request.headers.get("accept-language")?.split(",")[0]?.split("-")[0];
  return normalizeInviteLocale(language);
}

export async function deliverLearningGroupInvite(
  prisma: PrismaClient,
  args: {
    groupId: string;
    email: string;
    origin: string;
    locale: LearningGroupInviteLocale;
    action: "link" | "email";
  },
) {
  const [email] = normalizeEmails([args.email]);
  if (!email) return { ok: false as const, reason: "not_found" as const };

  const context = await prisma.learningGroup.findUnique({
    where: { id: args.groupId },
    select: {
      id: true,
      name: true,
      owner: { select: { name: true, email: true } },
      invites: {
        where: { email },
        select: {
          id: true,
          email: true,
          expiresAt: true,
          acceptedAt: true,
          revokedAt: true,
        },
        take: 1,
      },
    },
  });

  const invite = context?.invites[0];
  if (!context || !invite) {
    return { ok: false as const, reason: "not_found" as const };
  }
  if (learningGroupInviteState(invite) !== "pending") {
    return { ok: false as const, reason: "invite_unavailable" as const };
  }

  const rotated = await rotateLearningGroupInvite(prisma, {
    groupId: context.id,
    email,
  });
  if (!rotated) return { ok: false as const, reason: "not_found" as const };

  const origin = new URL(args.origin).origin;
  const inviteUrl = `${origin}/${args.locale}/invitations/class/${encodeURIComponent(rotated.token)}`;
  const instructorName =
    context.owner.name?.trim() || context.owner.email?.trim() || "Your teacher";
  const emailArgs = {
    to: email,
    inviteUrl,
    className: context.name,
    instructorName,
  };
  const mailtoHref = buildLearningGroupInviteMailto(emailArgs);

  if (args.action === "link") {
    return {
      ok: true as const,
      delivery: "link" as const,
      inviteUrl,
      mailtoHref,
      expiresAt: rotated.invite.expiresAt,
    };
  }

  const delivery = await sendLearningGroupInviteEmail({
    ...emailArgs,
    expiresAt: rotated.invite.expiresAt,
  });

  if (!delivery.delivered) {
    return {
      ok: false as const,
      reason: delivery.reason,
      detail: delivery.reason === "provider_error" ? delivery.detail : undefined,
      provider: delivery.provider,
      inviteUrl,
      mailtoHref,
      expiresAt: rotated.invite.expiresAt,
    };
  }

  const sentAt = new Date();
  await prisma.learningGroupInvite.update({
    where: { id: rotated.invite.id },
    data: { sentAt },
  });

  return {
    ok: true as const,
    delivery: "email" as const,
    provider: delivery.provider,
    messageId: delivery.messageId,
    inviteUrl,
    mailtoHref,
    expiresAt: rotated.invite.expiresAt,
    sentAt,
  };
}

export async function autoDeliverLearningGroupInvites(
  prisma: PrismaClient,
  args: {
    groupId: string;
    emails: readonly string[];
    origin: string;
    locale: LearningGroupInviteLocale;
  },
) {
  const emails = normalizeEmails(args.emails);
  let sent = 0;
  let failed = 0;

  for (const email of emails) {
    try {
      const result = await deliverLearningGroupInvite(prisma, {
        groupId: args.groupId,
        email,
        origin: args.origin,
        locale: args.locale,
        action: "email",
      });

      if (result.ok) {
        if (result.delivery === "email") sent += 1;
        else failed += 1;
      } else {
        failed += 1;
        console.error("[learning-group-invite] automatic delivery failed", {
          groupId: args.groupId,
          recipient: email,
          reason: result.reason,
        });
      }
    } catch (error) {
      failed += 1;
      console.error("[learning-group-invite] automatic delivery failed", {
        groupId: args.groupId,
        recipient: email,
        error,
      });
    }
  }

  return { attempted: emails.length, sent, failed };
}
