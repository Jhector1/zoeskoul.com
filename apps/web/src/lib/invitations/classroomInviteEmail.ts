import "server-only";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

import {
  resolveTransactionalEmailSender,
  sendTransactionalEmail,
  type TransactionalEmailResult,
} from "@/lib/email/transactionalEmail";

export type ClassroomInviteEmailResult = TransactionalEmailResult;

export type ClassroomInviteArgs = {
  to: string;
  inviteUrl: string;
  instructorName: string;
  classroomTitle: string;
  courseTitle: string;
  classroomKind: "assigned course" | "tutoring session";
};

export type ClassroomInviteEmailArgs = ClassroomInviteArgs & {
  expiresAt: Date;
};

function resolveInviteSender() {
  return resolveTransactionalEmailSender({
    from:
      process.env.BREVO_INVITE_FROM_EMAIL ??
      process.env.BREVO_FROM_EMAIL ??
      process.env.CLASSROOM_INVITE_FROM_EMAIL ??
      process.env.LEARNING_INVITE_FROM_EMAIL ??
      process.env.EMAIL_FROM,
    name:
      process.env.BREVO_INVITE_FROM_NAME ?? process.env.BREVO_FROM_NAME,
    defaultName: "ZoeSkoul",
  });
}

function classroomInviteCopy(args: ClassroomInviteArgs) {
  const intro = `${args.instructorName} invited you to a ZoeSkoul ${args.classroomKind} for ${args.courseTitle}.`;

  if (args.classroomKind === "tutoring session") {
    return {
      subject: `${args.instructorName} invited you to a ZoeSkoul tutoring session`,
      heading: "You are invited to a ZoeSkoul tutoring session",
      intro,
      detailLabel: "Course",
      detailValue: args.courseTitle,
      actionLabel: "Join tutoring session",
      accountInstruction:
        "Create an account or sign in using the email address that received this invitation. You will be taken directly to your tutoring session.",
    };
  }

  return {
    subject: `${args.instructorName} invited you to ${args.classroomTitle}`,
    heading: "You have been invited to a ZoeSkoul classroom",
    intro,
    detailLabel: "Classroom",
    detailValue: args.classroomTitle,
    actionLabel: "Open classroom",
    accountInstruction:
      "Create an account or sign in with the email address that received this invitation. You will be taken directly to the classroom.",
  };
}

export async function sendClassroomInviteEmail(
  args: ClassroomInviteEmailArgs,
): Promise<ClassroomInviteEmailResult> {
  const copy = classroomInviteCopy(args);
  const expires = args.expiresAt.toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
  const text = [
    copy.intro,
    "",
    `${copy.detailLabel}: ${copy.detailValue}`,
    `${copy.actionLabel}: ${args.inviteUrl}`,
    "",
    copy.accountInstruction,
    `This invitation expires ${expires}.`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111827">
      <h2 style="margin:0 0 12px">${escapeHtml(copy.heading)}</h2>
      <p>${escapeHtml(copy.intro)}</p>
      <p><strong>${escapeHtml(copy.detailLabel)}:</strong> ${escapeHtml(copy.detailValue)}</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(args.inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:white;text-decoration:none;font-weight:600">${escapeHtml(copy.actionLabel)}</a>
      </p>
      <p>${escapeHtml(copy.accountInstruction)}</p>
      <p style="color:#6b7280;font-size:13px">This invitation expires ${escapeHtml(expires)}.</p>
    </div>
  `;

  return sendTransactionalEmail({
    to: args.to,
    sender: resolveInviteSender(),
    subject: copy.subject,
    textContent: text,
    htmlContent: html,
  });
}

export function buildClassroomInviteMailto(args: ClassroomInviteArgs) {
  const copy = classroomInviteCopy(args);
  const body = [
    copy.intro,
    "",
    `${copy.detailLabel}: ${copy.detailValue}`,
    `${copy.actionLabel}: ${args.inviteUrl}`,
    "",
    copy.accountInstruction,
  ].join("\n");

  return `mailto:${encodeURIComponent(args.to)}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`;
}
