import "server-only";

import {
  escapeEmailHtml,
  resolveTransactionalEmailSender,
  sendTransactionalEmail,
  type TransactionalEmailResult,
} from "@/lib/email/transactionalEmail";
import { getSiteUrl } from "@/lib/seo/site";

export type WelcomeEmailArgs = {
  to: string;
  name?: string | null;
};

function firstName(name?: string | null) {
  const normalized = name?.trim().replace(/\s+/g, " ");
  if (!normalized) return null;

  return normalized.split(" ")[0]?.slice(0, 60) || null;
}

function resolveWelcomeSender() {
  return resolveTransactionalEmailSender({
    from:
      process.env.BREVO_WELCOME_FROM_EMAIL ??
      process.env.BREVO_FROM_EMAIL ??
      process.env.EMAIL_FROM,
    name:
      process.env.BREVO_WELCOME_FROM_NAME ??
      process.env.BREVO_FROM_NAME,
    defaultName: "ZoeSkoul",
  });
}

export async function sendWelcomeEmail(
  args: WelcomeEmailArgs,
): Promise<TransactionalEmailResult> {
  const recipientName = firstName(args.name);
  const heading = recipientName
    ? `Welcome to ZoeSkoul, ${recipientName}!`
    : "Welcome to ZoeSkoul!";
  const startUrl = new URL("/en", getSiteUrl()).toString();
  const intro = "Your account is ready.";
  const description =
    "Explore courses, practice new skills, and join tutoring sessions in one place.";
  const textContent = [
    heading,
    "",
    intro,
    description,
    "",
    `Start learning: ${startUrl}`,
    "",
    "We are glad you are here.",
    "Need help? Contact support@zoeskoul.com.",
    "",
    "This email was sent because you created a ZoeSkoul account.",
  ].join("\n");
  const htmlContent = `
    <div style="font-family:Inter,Arial,sans-serif;line-height:1.55;color:#111827">
      <h2 style="margin:0 0 12px">${escapeEmailHtml(heading)}</h2>
      <p>${escapeEmailHtml(intro)}</p>
      <p>${escapeEmailHtml(description)}</p>
      <p style="margin:24px 0">
        <a href="${escapeEmailHtml(startUrl)}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#111827;color:#ffffff;text-decoration:none;font-weight:600">Start learning</a>
      </p>
      <p>We are glad you are here.</p>
      <p style="color:#6b7280;font-size:13px">Need help? Contact <a href="mailto:support@zoeskoul.com" style="color:#374151">support@zoeskoul.com</a>.</p>
      <p style="color:#9ca3af;font-size:12px">This email was sent because you created a ZoeSkoul account.</p>
    </div>
  `;

  return sendTransactionalEmail({
    to: args.to,
    sender: resolveWelcomeSender(),
    subject: heading,
    textContent,
    htmlContent,
  });
}
