import { z } from "zod";

import {
  appCorsJson,
  appCorsPreflight,
  isAppMutationOriginAllowed,
} from "@/lib/http/appCors";
import { deliverLearningGroupInvite } from "@/lib/learningGroups/groupInviteDelivery";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

const InviteDeliverySchema = z.object({
  email: z.string().trim().email(),
  action: z.enum(["link", "email"]),
  locale: z.enum(["en", "es", "fr", "ht"]).default("en"),
});

export async function POST(request: Request, context: Context) {
  if (!isAppMutationOriginAllowed(request)) {
    return appCorsJson(request, { error: "Forbidden" }, { status: 403 });
  }
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return appCorsJson(request, { error: "Forbidden" }, { status: 403 });

  const parsed = InviteDeliverySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return appCorsJson(
      request,
      { error: "Invalid invitation request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const email = parsed.data.email.trim().toLowerCase();
  const group = await prisma.learningGroup.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    select: {
      id: true,
      invites: {
        where: { email, acceptedAt: null, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!group) return appCorsJson(request, { error: "Class not found" }, { status: 404 });
  if (!group.invites.length) {
    return appCorsJson(
      request,
      { error: "This email is not waiting for a class invitation." },
      { status: 404 },
    );
  }

  const result = await deliverLearningGroupInvite(prisma, {
    groupId: group.id,
    email,
    origin: new URL(request.url).origin,
    locale: parsed.data.locale,
    action: parsed.data.action,
  });

  if (!result.ok) {
    const status =
      result.reason === "not_found"
        ? 404
        : result.reason === "invite_unavailable"
          ? 409
          : result.reason === "not_configured"
            ? 503
            : 502;

    return appCorsJson(
      request,
      {
        ok: false,
        error:
          result.reason === "not_configured"
            ? "Automatic invitation email delivery is not configured."
            : result.reason === "invite_unavailable"
              ? "This class invitation is no longer available."
              : "The class invitation email could not be delivered.",
        code: "INVITE_EMAIL_NOT_DELIVERED",
        ...("inviteUrl" in result
          ? {
              inviteUrl: result.inviteUrl,
              mailtoHref: result.mailtoHref,
              expiresAt: result.expiresAt,
              delivery: "failed",
            }
          : {}),
        ...("provider" in result ? { emailProvider: result.provider } : {}),
        ...(result.reason === "provider_error" ? { emailDetail: result.detail } : {}),
      },
      { status },
    );
  }

  return appCorsJson(request, {
    ok: true,
    inviteUrl: result.inviteUrl,
    mailtoHref: result.mailtoHref,
    expiresAt: result.expiresAt,
    delivery: result.delivery,
    ...(result.delivery === "email"
      ? {
          emailProvider: result.provider,
          emailMessageId: result.messageId,
          sentAt: result.sentAt,
        }
      : {}),
  });
}

export function OPTIONS(request: Request) {
  return appCorsPreflight(request);
}
