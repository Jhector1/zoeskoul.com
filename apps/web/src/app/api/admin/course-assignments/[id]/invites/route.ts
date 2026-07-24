import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  getTeachingUser,
  ownedTeachingRecordWhere,
} from "@/lib/teaching/teachingAccess";
import { rotateLearningAssignmentInvite } from "@/lib/learningAssignments/assignmentInvites";
import { resolveSubjectTitle } from "@/lib/subjects/resolveSubjectTitle";
import {
  buildLearningAssignmentInviteMailto,
  sendLearningAssignmentInviteEmail,
} from "@/lib/learningAssignments/assignmentInviteEmail";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

const InviteDeliverySchema = z.object({
  email: z.string().trim().email(),
  action: z.enum(["link", "email"]),
  locale: z.enum(["en", "fr", "ht"]).default("en"),
});

export async function POST(req: Request, context: Context) {
  const teachingUser = await getTeachingUser();
  if (!teachingUser) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = InviteDeliverySchema.safeParse(
    await req.json().catch(() => null),
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid invitation request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id } = await context.params;
  const email = parsed.data.email.toLowerCase();
  const assignment = await prisma.learningAssignment.findFirst({
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

  if (!assignment) {
    return NextResponse.json({ error: "Assignment not found" }, { status: 404 });
  }
  if (assignment.status !== "assigned") {
    return NextResponse.json(
      { error: "Publish the assignment before sending invitations." },
      { status: 409 },
    );
  }
  if (!assignment.invites.length) {
    return NextResponse.json(
      { error: "This email is no longer waiting for an account invitation." },
      { status: 404 },
    );
  }

  const rotated = await rotateLearningAssignmentInvite(prisma, {
    assignmentId: assignment.id,
    email,
  });
  if (!rotated) {
    return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  }

  const origin = new URL(req.url).origin;
  const inviteUrl = `${origin}/${parsed.data.locale}/invitations/course/${encodeURIComponent(rotated.token)}`;
  const instructorName =
    assignment.owner.name?.trim() ||
    assignment.owner.email?.trim() ||
    "Your instructor";
  const courseTitle = await resolveSubjectTitle({
    subjectSlug: assignment.subject.slug,
    locale: parsed.data.locale,
    fallback: assignment.subject.title,
  });
  const mailtoHref = buildLearningAssignmentInviteMailto({
    to: email,
    inviteUrl,
    assignmentTitle: assignment.title,
    courseTitle,
    instructorName,
  });

  if (parsed.data.action === "link") {
    return NextResponse.json({
      ok: true,
      inviteUrl,
      mailtoHref,
      expiresAt: rotated.invite.expiresAt,
      delivery: "link",
    });
  }

  const delivery = await sendLearningAssignmentInviteEmail({
    to: email,
    inviteUrl,
    assignmentTitle: assignment.title,
    courseTitle,
    instructorName,
    expiresAt: rotated.invite.expiresAt,
  });

  if (delivery.delivered) {
    await prisma.learningAssignmentInvite.update({
      where: { id: rotated.invite.id },
      data: { sentAt: new Date() },
    });
  }

  return NextResponse.json({
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
