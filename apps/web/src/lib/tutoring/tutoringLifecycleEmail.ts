import "server-only";

import {
  getLocalAppOrigin,
  getProductionAppOrigin,
} from "@zoeskoul/app-config";

import {
  escapeEmailHtml,
  resolveTransactionalEmailSender,
  sendTransactionalEmail,
} from "@/lib/email/transactionalEmail";
import { prisma } from "@/lib/prisma";

type TutoringLifecycleAudience = "student" | "teacher";
type TutoringLifecycleEvent =
  | "request_submitted"
  | "scheduled"
  | "canceled";
type TutoringCancellationActor = "learner" | "teacher";

type EmailRecipient = {
  email: string;
  name: string | null;
};

export type TutoringLifecycleEmailInput = {
  audience: TutoringLifecycleAudience;
  event: TutoringLifecycleEvent;
  actionUrl: string;
  learnerName?: string | null;
  teacherName?: string | null;
  requestedMinutes: number;
  sourceSubjectSlug?: string | null;
  preferredStartsAt?: Date | null;
  startsAt?: Date | null;
  note?: string | null;
  canceledBy?: TutoringCancellationActor;
};

export type TutoringLifecycleEmailContent = {
  subject: string;
  textContent: string;
  htmlContent: string;
};

function normalizeRecipient(
  value: {
    email?: string | null;
    name?: string | null;
  } | null | undefined,
): EmailRecipient | null {
  const email = value?.email?.trim() ?? "";
  if (!/^\S+@\S+\.\S+$/.test(email)) return null;

  const name = value?.name?.trim() || null;
  return { email, name };
}

function uniqueRecipients(
  recipients: Array<EmailRecipient | null>,
): EmailRecipient[] {
  const seen = new Set<string>();
  const result: EmailRecipient[] = [];

  for (const recipient of recipients) {
    if (!recipient) continue;
    const key = recipient.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(recipient);
  }

  return result;
}

function displayName(name: string | null | undefined, fallback: string) {
  const normalized = name?.trim();
  return normalized || fallback;
}

function titleFromSlug(value: string | null | undefined) {
  const normalized = value?.trim();
  if (!normalized) return "General tutoring";

  return normalized
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatUtc(value: Date | null | undefined) {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(value);
}

function configuredOrigin(
  app: "student" | "teacher",
): string | null {
  const raw =
    app === "student"
      ? process.env.NEXT_PUBLIC_STUDENT_APP_ORIGIN
      : process.env.NEXT_PUBLIC_TEACHER_APP_ORIGIN;

  if (!raw?.trim()) return null;

  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

function appOrigin(app: "student" | "teacher") {
  const configured = configuredOrigin(app);
  if (configured) return configured;

  return process.env.NODE_ENV === "development"
    ? getLocalAppOrigin(app)
    : getProductionAppOrigin(app);
}

function studentTutoringUrl() {
  return new URL(
    "/en/tutoring-sessions",
    appOrigin("student"),
  ).toString();
}

function teacherTutoringUrl() {
  return new URL("/", appOrigin("teacher")).toString();
}

function resolveTutoringSender() {
  return resolveTransactionalEmailSender({
    from:
      process.env.BREVO_TUTORING_FROM_EMAIL ??
      process.env.BREVO_FROM_EMAIL ??
      process.env.EMAIL_FROM,
    name:
      process.env.BREVO_TUTORING_FROM_NAME ??
      process.env.BREVO_FROM_NAME,
    defaultName: "ZoeSkoul",
  });
}

function copyFor(
  args: TutoringLifecycleEmailInput,
): {
  subject: string;
  heading: string;
  intro: string;
  statusLine: string;
  actionLabel: string;
} {
  const learner = displayName(args.learnerName, "The learner");
  const teacher = displayName(args.teacherName, "your tutor");

  if (args.event === "request_submitted") {
    if (args.audience === "student") {
      return {
        subject: "We received your tutoring request",
        heading: "Tutoring request received",
        intro:
          "Your request is in the tutoring queue. We will confirm the session time after a tutor reviews it.",
        statusLine:
          "Your tutoring minutes are reserved while this request is waiting.",
        actionLabel: "View tutoring requests",
      };
    }

    return {
      subject: "New tutoring request",
      heading: "A new tutoring request is waiting",
      intro:
        `${learner} submitted a tutoring request that is available in the ZoeSkoul tutoring queue.`,
      statusLine:
        "Review the request and schedule it only if the requested time fits your saved availability.",
      actionLabel: "Review tutoring requests",
    };
  }

  if (args.event === "scheduled") {
    if (args.audience === "student") {
      return {
        subject: "Your tutoring session is scheduled",
        heading: "Your tutoring session is confirmed",
        intro:
          `${teacher} confirmed your tutoring session.`,
        statusLine:
          "The tutoring minutes for this session remain reserved until the session is completed or canceled.",
        actionLabel: "View tutoring",
      };
    }

    return {
      subject: "Tutoring session scheduled",
      heading: "Tutoring session confirmed",
      intro:
        `Your tutoring session with ${learner} is scheduled.`,
      statusLine:
        "Open the teacher dashboard to review the request and prepare the tutoring workspace.",
      actionLabel: "Open teacher dashboard",
    };
  }

  const sessionLabel = args.startsAt
    ? "tutoring session"
    : "tutoring request";

  if (args.audience === "student") {
    const actorLine =
      args.canceledBy === "teacher"
        ? "Your tutor canceled this session."
        : "Your cancellation was confirmed.";

    return {
      subject: `Your ${sessionLabel} was canceled`,
      heading: `${sessionLabel.charAt(0).toUpperCase()}${sessionLabel.slice(1)} canceled`,
      intro: actorLine,
      statusLine:
        "Any reserved tutoring minutes for this request have been returned to your available tutoring balance.",
      actionLabel: "View tutoring",
    };
  }

  return {
    subject: `${sessionLabel.charAt(0).toUpperCase()}${sessionLabel.slice(1)} canceled`,
    heading: "Tutoring cancellation",
    intro:
      args.canceledBy === "teacher"
        ? `Your cancellation of the ${sessionLabel} with ${learner} was confirmed.`
        : `${learner} canceled the ${sessionLabel}.`,
    statusLine:
      "The learner's reserved minutes for this request have been returned to their available tutoring balance.",
    actionLabel: "Open teacher dashboard",
  };
}

export function renderTutoringLifecycleEmail(
  args: TutoringLifecycleEmailInput,
): TutoringLifecycleEmailContent {
  const copy = copyFor(args);
  const course = titleFromSlug(args.sourceSubjectSlug);
  const preferred = formatUtc(args.preferredStartsAt);
  const scheduled = formatUtc(args.startsAt);
  const when =
    args.event === "scheduled"
      ? scheduled
      : args.event === "canceled"
        ? scheduled ?? preferred
        : preferred;
  const whenLabel =
    args.event === "scheduled"
      ? "Scheduled time"
      : args.event === "canceled" && scheduled
        ? "Session time"
        : "Preferred time";

  const details: Array<[string, string]> = [
    ["Course", course],
    ["Duration", `${args.requestedMinutes} minutes`],
  ];

  if (when) details.push([whenLabel, when]);

  if (args.audience === "teacher") {
    details.unshift([
      "Learner",
      displayName(args.learnerName, "Learner"),
    ]);
  } else if (
    args.event === "scheduled" &&
    args.teacherName?.trim()
  ) {
    details.unshift(["Tutor", args.teacherName.trim()]);
  }

  if (
    args.audience === "teacher" &&
    args.event === "request_submitted" &&
    args.note?.trim()
  ) {
    details.push(["Learner note", args.note.trim()]);
  }

  const textDetails = details
    .map(([label, value]) => `${label}: ${value}`)
    .join("\n");

  const textContent = [
    copy.heading,
    "",
    copy.intro,
    "",
    textDetails,
    "",
    copy.statusLine,
    "",
    `${copy.actionLabel}: ${args.actionUrl}`,
    "",
    "Times in this email are shown in UTC. ZoeSkoul displays times in your local timezone in the app.",
    "",
    "Need help? Contact support@zoeskoul.com.",
    "This is a transactional ZoeSkoul tutoring email.",
  ].join("\n");

  const detailRows = details
    .map(
      ([label, value]) => `
        <tr>
          <td style="padding:8px 10px;color:#64748b;font-size:13px;vertical-align:top">${escapeEmailHtml(label)}</td>
          <td style="padding:8px 10px;color:#0f172a;font-size:13px;font-weight:600;vertical-align:top">${escapeEmailHtml(value)}</td>
        </tr>
      `,
    )
    .join("");

  const htmlContent = `
    <div style="margin:0;padding:32px 16px;background:#f3f6f4;font-family:Inter,Arial,sans-serif;color:#0f172a">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden">
        <div style="padding:24px 28px 10px">
          <div style="font-size:14px;font-weight:800;letter-spacing:.02em;color:#15803d">ZoeSkoul Tutoring</div>
          <h1 style="margin:10px 0 10px;font-size:25px;line-height:1.25;color:#0f172a">${escapeEmailHtml(copy.heading)}</h1>
          <p style="margin:0;color:#475569;font-size:15px;line-height:1.6">${escapeEmailHtml(copy.intro)}</p>
        </div>

        <div style="padding:14px 28px 4px">
          <table role="presentation" style="width:100%;border-collapse:collapse;background:#f8fafc;border-radius:12px">
            ${detailRows}
          </table>
        </div>

        <div style="padding:18px 28px 28px">
          <p style="margin:0 0 20px;color:#334155;font-size:14px;line-height:1.6">${escapeEmailHtml(copy.statusLine)}</p>
          <a href="${escapeEmailHtml(args.actionUrl)}" style="display:inline-block;padding:11px 18px;border-radius:9px;background:#166534;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">${escapeEmailHtml(copy.actionLabel)}</a>
        </div>

        <div style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0">
          <p style="margin:0 0 6px;color:#64748b;font-size:12px;line-height:1.55">Times in this email are shown in UTC. ZoeSkoul displays times in your local timezone in the app.</p>
          <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.55">Need help? <a href="mailto:support@zoeskoul.com" style="color:#475569">support@zoeskoul.com</a> · This is a transactional tutoring email.</p>
        </div>
      </div>
    </div>
  `;

  return {
    subject: copy.subject,
    textContent,
    htmlContent,
  };
}

async function deliver(
  recipient: EmailRecipient | null,
  args: TutoringLifecycleEmailInput,
) {
  if (!recipient) return;

  const content = renderTutoringLifecycleEmail(args);
  const result = await sendTransactionalEmail({
    to: recipient.email,
    sender: resolveTutoringSender(),
    subject: content.subject,
    textContent: content.textContent,
    htmlContent: content.htmlContent,
  });

  if (!result.delivered) {
    const detail = {
      to: recipient.email,
      audience: args.audience,
      event: args.event,
      provider: result.provider,
      reason: result.reason,
      detail: "detail" in result ? result.detail : undefined,
    };

    if (result.reason === "not_configured") {
      console.warn("[tutoring-email] skipped", detail);
    } else {
      console.error("[tutoring-email] delivery failed", detail);
    }
  }
}

async function enabledTeacherPoolRecipients() {
  const rows = await prisma.tutoringTeacherPoolMember.findMany({
    where: { enabled: true },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    take: 100,
    select: {
      user: {
        select: {
          name: true,
          email: true,
          roles: true,
        },
      },
    },
  });

  return uniqueRecipients(
    rows.map((row) => {
      const isTeacher = row.user.roles
        .map((role) => String(role))
        .includes("teacher");
      return isTeacher ? normalizeRecipient(row.user) : null;
    }),
  );
}

async function requestContext(requestId: string) {
  return prisma.tutoringRequest.findUnique({
    where: { id: requestId },
    select: {
      id: true,
      status: true,
      requestedMinutes: true,
      preferredStartsAt: true,
      sourceSubjectSlug: true,
      note: true,
      learner: {
        select: {
          name: true,
          email: true,
        },
      },
      assignedTeacher: {
        select: {
          name: true,
          email: true,
        },
      },
      bookings: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          startsAt: true,
          durationMinutes: true,
          teacher: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });
}

export async function notifyTutoringRequestSubmitted(args: {
  requestId: string;
}) {
  const request = await requestContext(args.requestId);
  if (!request || request.status === "canceled") return;

  const student = normalizeRecipient(request.learner);
  const teachers = await enabledTeacherPoolRecipients();

  const jobs: Promise<unknown>[] = [];

  if (student) {
    jobs.push(
      deliver(student, {
        audience: "student",
        event: "request_submitted",
        actionUrl: studentTutoringUrl(),
        learnerName: request.learner.name,
        requestedMinutes: request.requestedMinutes,
        sourceSubjectSlug: request.sourceSubjectSlug,
        preferredStartsAt: request.preferredStartsAt,
      }),
    );
  }

  for (const teacher of teachers) {
    jobs.push(
      deliver(teacher, {
        audience: "teacher",
        event: "request_submitted",
        actionUrl: teacherTutoringUrl(),
        learnerName: request.learner.name,
        teacherName: teacher.name,
        requestedMinutes: request.requestedMinutes,
        sourceSubjectSlug: request.sourceSubjectSlug,
        preferredStartsAt: request.preferredStartsAt,
        note: request.note,
      }),
    );
  }

  await Promise.allSettled(jobs);
}

export async function notifyTutoringScheduled(args: {
  bookingId: string;
}) {
  const booking = await prisma.tutoringBooking.findUnique({
    where: { id: args.bookingId },
    select: {
      id: true,
      status: true,
      startsAt: true,
      durationMinutes: true,
      teacher: {
        select: {
          name: true,
          email: true,
        },
      },
      request: {
        select: {
          sourceSubjectSlug: true,
          learner: {
            select: {
              name: true,
              email: true,
            },
          },
        },
      },
    },
  });

  if (!booking || booking.status !== "scheduled") return;

  const student = normalizeRecipient(booking.request.learner);
  const teacher = normalizeRecipient(booking.teacher);

  await Promise.allSettled([
    deliver(student, {
      audience: "student",
      event: "scheduled",
      actionUrl: studentTutoringUrl(),
      learnerName: booking.request.learner.name,
      teacherName: booking.teacher?.name,
      requestedMinutes: booking.durationMinutes,
      sourceSubjectSlug: booking.request.sourceSubjectSlug,
      startsAt: booking.startsAt,
    }),
    deliver(teacher, {
      audience: "teacher",
      event: "scheduled",
      actionUrl: teacherTutoringUrl(),
      learnerName: booking.request.learner.name,
      teacherName: booking.teacher?.name,
      requestedMinutes: booking.durationMinutes,
      sourceSubjectSlug: booking.request.sourceSubjectSlug,
      startsAt: booking.startsAt,
    }),
  ]);
}

export async function notifyTutoringRequestCanceled(args: {
  requestId: string;
  canceledBy: TutoringCancellationActor;
}) {
  const request = await requestContext(args.requestId);
  if (!request || request.status !== "canceled") return;

  const booking = request.bookings[0] ?? null;
  const student = normalizeRecipient(request.learner);
  const specificTeacher = normalizeRecipient(
    booking?.teacher ?? request.assignedTeacher,
  );
  const teachers = specificTeacher
    ? [specificTeacher]
    : await enabledTeacherPoolRecipients();

  const common = {
    learnerName: request.learner.name,
    teacherName:
      booking?.teacher?.name ??
      request.assignedTeacher?.name ??
      null,
    requestedMinutes:
      booking?.durationMinutes ??
      request.requestedMinutes,
    sourceSubjectSlug: request.sourceSubjectSlug,
    preferredStartsAt: request.preferredStartsAt,
    startsAt: booking?.startsAt ?? null,
    canceledBy: args.canceledBy,
  };

  const jobs: Promise<unknown>[] = [];

  if (student) {
    jobs.push(
      deliver(student, {
        audience: "student",
        event: "canceled",
        actionUrl: studentTutoringUrl(),
        ...common,
      }),
    );
  }

  for (const teacher of teachers) {
    jobs.push(
      deliver(teacher, {
        audience: "teacher",
        event: "canceled",
        actionUrl: teacherTutoringUrl(),
        ...common,
      }),
    );
  }

  await Promise.allSettled(jobs);
}

export async function notifyTutoringBookingCanceled(args: {
  bookingId: string;
  canceledBy: TutoringCancellationActor;
}) {
  const booking = await prisma.tutoringBooking.findUnique({
    where: { id: args.bookingId },
    select: {
      id: true,
      status: true,
      requestId: true,
    },
  });

  if (!booking || booking.status !== "canceled") return;

  await notifyTutoringRequestCanceled({
    requestId: booking.requestId,
    canceledBy: args.canceledBy,
  });
}
