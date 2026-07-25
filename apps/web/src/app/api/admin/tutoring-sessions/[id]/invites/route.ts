import { z } from "zod";

import { prisma } from "@/lib/prisma";
import {
  bodyJsonResponse,
  enforceSameOriginPost,
  exceedsContentLength,
  readJsonSafe,
} from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import { deliverPreparedTutoringInvite } from "@/lib/tutoring/sessionInviteDelivery";
import { rotateTutoringSessionInvite } from "@/lib/tutoring/sessionInvites";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const InviteActionSchema = z.object({
  email: z.string().trim().email(),
  action: z.enum(["link", "email", "cancel"]),
  locale: z.enum(["en", "es", "fr", "ht"]).default("en"),
});

export async function POST(req: Request, context: Context) {
  if (!enforceSameOriginPost(req)) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (exceedsContentLength(req, 16 * 1024)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }
  const teachingUser = await getTeachingUser();
  if (!teachingUser) return bodyJsonResponse({ error: "Forbidden" }, 403);

  const parsed = InviteActionSchema.safeParse(await readJsonSafe(req));
  if (!parsed.success) {
    return bodyJsonResponse(
      { error: "Invalid invitation request", details: parsed.error.flatten() },
      400,
    );
  }

  const { id } = await context.params;
  try {
    const limited = await rateLimit(`tutoring-invite:${teachingUser.id}:${id}`, {
      bucket: "tutoring-invite-delivery",
      limit: 30,
      window: "1 h",
    });
    if (!limited.ok) return bodyJsonResponse({ error: "Too many requests" }, 429);
  } catch {
    return bodyJsonResponse({ error: "Service unavailable" }, 503);
  }

  const email = parsed.data.email.toLowerCase();
  const tutoringSession = await prisma.tutoringSession.findFirst({
    where: { id, ...ownedTeachingRecordWhere(teachingUser) },
    select: {
      id: true,
      status: true,
      invites: {
        where: { email },
        select: {
          id: true,
          acceptedAt: true,
          revokedAt: true,
        },
        take: 1,
      },
    },
  });
  if (!tutoringSession) {
    return bodyJsonResponse({ error: "Tutoring session not found" }, 404);
  }
  const invite = tutoringSession.invites[0];
  if (!invite) return bodyJsonResponse({ error: "Invitation not found" }, 404);

  if (parsed.data.action === "cancel") {
    if (invite.acceptedAt) {
      return bodyJsonResponse(
        { error: "Accepted students must be removed from the session audience instead." },
        409,
      );
    }
    const revokedAt = new Date();
    await prisma.tutoringSessionInvite.update({
      where: { id: invite.id },
      data: { revokedAt },
    });
    return bodyJsonResponse({ ok: true, delivery: "cancelled", revokedAt });
  }

  if (tutoringSession.status === "archived") {
    return bodyJsonResponse(
      { error: "Restore the tutoring session before sending invitations." },
      409,
    );
  }
  if (invite.acceptedAt) {
    return bodyJsonResponse({ error: "This invitation was already accepted." }, 409);
  }

  const rotated = await rotateTutoringSessionInvite(prisma, {
    sessionId: tutoringSession.id,
    email,
  });
  if (!rotated) return bodyJsonResponse({ error: "Invitation not found" }, 404);

  const origin = new URL(req.url).origin;
  if (parsed.data.action === "link") {
    const inviteUrl = `${origin}/${parsed.data.locale}/invitations/tutoring/${encodeURIComponent(rotated.token)}`;
    return bodyJsonResponse({
      ok: true,
      inviteUrl,
      expiresAt: rotated.invite.expiresAt,
      delivery: "link",
    });
  }

  const delivery = await deliverPreparedTutoringInvite(prisma, {
    sessionId: tutoringSession.id,
    origin,
    locale: parsed.data.locale,
    prepared: {
      id: rotated.invite.id,
      email: rotated.invite.email,
      token: rotated.token,
      expiresAt: rotated.invite.expiresAt,
    },
  });
  if (!delivery.delivered) {
    return bodyJsonResponse(
      {
        ok: false,
        error:
          delivery.reason === "not_configured"
            ? "Automatic invitation email delivery is not configured."
            : "The tutoring invitation email could not be delivered.",
        code: "INVITE_EMAIL_NOT_DELIVERED",
        ...delivery,
        delivery: "failed",
      },
      delivery.reason === "not_configured" ? 503 : 502,
    );
  }

  return bodyJsonResponse({ ok: true, ...delivery, delivery: "email" });
}
