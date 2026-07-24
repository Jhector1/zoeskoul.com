import "server-only";

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export type ClassroomInviteEmailResult =
  | { delivered: true; provider: "resend" }
  | { delivered: false; provider: "manual"; reason: "not_configured" }
  | {
      delivered: false;
      provider: "resend";
      reason: "provider_error";
      detail?: string;
    };

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

function classroomInviteCopy(args: ClassroomInviteArgs) {
  const subject = `${args.instructorName} invited you to ${args.classroomTitle}`;
  const intro = `${args.instructorName} invited you to a ZoeSkoul ${args.classroomKind} for ${args.courseTitle}.`;
  const accountInstruction =
    "Create an account or sign in with the email address that received this invitation. You will be taken directly to the classroom.";
  return { subject, intro, accountInstruction };
}

export async function sendClassroomInviteEmail(
  args: ClassroomInviteEmailArgs,
): Promise<ClassroomInviteEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = (
    process.env.CLASSROOM_INVITE_FROM_EMAIL ??
    process.env.LEARNING_INVITE_FROM_EMAIL ??
    process.env.EMAIL_FROM
  )?.trim();

  if (!apiKey || !from) {
    return { delivered: false, provider: "manual", reason: "not_configured" };
  }

  const copy = classroomInviteCopy(args);
  const expires = args.expiresAt.toLocaleDateString("en-US", {
    dateStyle: "medium",
  });
  const text = [
    copy.intro,
    "",
    `Classroom: ${args.classroomTitle}`,
    `Open classroom: ${args.inviteUrl}`,
    "",
    copy.accountInstruction,
    `This invitation expires ${expires}.`,
  ].join("\n");

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111827">
      <h2 style="margin:0 0 12px">You have been invited to a ZoeSkoul classroom</h2>
      <p>${escapeHtml(copy.intro)}</p>
      <p><strong>Classroom:</strong> ${escapeHtml(args.classroomTitle)}</p>
      <p style="margin:24px 0">
        <a href="${escapeHtml(args.inviteUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:white;text-decoration:none;font-weight:600">Open classroom</a>
      </p>
      <p>${escapeHtml(copy.accountInstruction)}</p>
      <p style="color:#6b7280;font-size:13px">This invitation expires ${escapeHtml(expires)}.</p>
    </div>
  `;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: copy.subject,
        text,
        html,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        delivered: false,
        provider: "resend",
        reason: "provider_error",
        detail: (await response.text()).slice(0, 500),
      };
    }

    return { delivered: true, provider: "resend" };
  } catch (error) {
    return {
      delivered: false,
      provider: "resend",
      reason: "provider_error",
      detail: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}

export function buildClassroomInviteMailto(args: ClassroomInviteArgs) {
  const copy = classroomInviteCopy(args);
  const body = [
    copy.intro,
    "",
    `Classroom: ${args.classroomTitle}`,
    `Open classroom: ${args.inviteUrl}`,
    "",
    copy.accountInstruction,
  ].join("\n");

  return `mailto:${encodeURIComponent(args.to)}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(body)}`;
}
