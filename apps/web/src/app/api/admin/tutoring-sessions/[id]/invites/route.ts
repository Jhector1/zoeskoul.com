import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { bodyJsonResponse, enforceSameOriginPost, exceedsContentLength, readJsonSafe } from "@/lib/practice/api/shared/http";
import { rateLimit } from "@/lib/security/ratelimit";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import { rotateTutoringSessionInvite } from "@/lib/tutoring/sessionInvites";
import { resolveSubjectTitle } from "@/lib/subjects/resolveSubjectTitle";
import {
  buildClassroomInviteMailto,
  sendClassroomInviteEmail,
} from "@/lib/invitations/classroomInviteEmail";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const InviteDeliverySchema = z.object({
  email: z.string().trim().email(),
  action: z.enum(["link", "email"]),
  locale: z.enum(["en", "fr", "ht"]).default("en"),
});

export async function POST(req: Request, context: Context) {
  if (!enforceSameOriginPost(req)) return bodyJsonResponse({ error: "Forbidden" }, 403);
  if (exceedsContentLength(req, 16 * 1024)) {
    return bodyJsonResponse({ error: "Request body is too large" }, 413);
  }
  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return bodyJsonResponse({ error: "Forbidden" }, 403);
  }

  const parsed = InviteDeliverySchema.safeParse(await readJsonSafe(req));
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
      title: true,
      status: true,
      owner: { select: { name: true, email: true } },
      subject: { select: { title: true, slug: true } },
      invites: {
        where: { email, acceptedAt: null, revokedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!tutoringSession) {
    return bodyJsonResponse({ error: "Tutoring session not found" }, 404);
  }
  if (tutoringSession.status !== "live" && tutoringSession.status !== "shared") {
    return bodyJsonResponse(
      { error: "Set the tutoring session to Live or Shared before sending invitations." },
      409,
    );
  }
  if (!tutoringSession.invites.length) {
    return bodyJsonResponse(
      { error: "This email is no longer waiting for an account invitation." },
      404,
    );
  }

  const rotated = await rotateTutoringSessionInvite(prisma, {
    sessionId: tutoringSession.id,
    email,
  });
  if (!rotated) {
    return bodyJsonResponse({ error: "Invitation not found" }, 404);
  }

  const origin = new URL(req.url).origin;
  const inviteUrl = `${origin}/${parsed.data.locale}/invitations/tutoring/${encodeURIComponent(rotated.token)}`;
  const instructorName =
    tutoringSession.owner.name?.trim() ||
    tutoringSession.owner.email?.trim() ||
    "Your tutor";
  const courseTitle = await resolveSubjectTitle({
    subjectSlug: tutoringSession.subject.slug,
    locale: parsed.data.locale,
    fallback: tutoringSession.subject.title,
  });
  const emailArgs = {
    to: email,
    inviteUrl,
    classroomTitle: tutoringSession.title,
    courseTitle,
    instructorName,
    expiresAt: rotated.invite.expiresAt,
    classroomKind: "tutoring session" as const,
  };
  const mailtoHref = buildClassroomInviteMailto(emailArgs);

  if (parsed.data.action === "link") {
    return bodyJsonResponse({
      ok: true,
      inviteUrl,
      mailtoHref,
      expiresAt: rotated.invite.expiresAt,
      delivery: "link",
    });
  }

  const delivery = await sendClassroomInviteEmail(emailArgs);
  if (delivery.delivered) {
    await prisma.tutoringSessionInvite.update({
      where: { id: rotated.invite.id },
      data: { sentAt: new Date() },
    });
  }

  return bodyJsonResponse({
    ok: true,
    inviteUrl,
    mailtoHref,
    expiresAt: rotated.invite.expiresAt,
    delivery: delivery.delivered ? "email" : "manual",
    emailProvider: delivery.provider,
    ...(delivery.delivered
      ? {}
      : {
          emailReason: delivery.reason,
          emailDetail:
            delivery.reason === "provider_error" ? delivery.detail : undefined,
        }),
  });
}
