import "server-only";

export type TransactionalEmailResult =
  | { delivered: true; provider: "brevo"; messageId: string }
  | { delivered: false; provider: "manual"; reason: "not_configured" }
  | {
      delivered: false;
      provider: "brevo";
      reason: "provider_error";
      detail?: string;
    };

export type TransactionalEmailSender = {
  email: string;
  name: string;
};

type ResolveTransactionalEmailSenderArgs = {
  from?: string | null;
  name?: string | null;
  defaultName?: string;
};

type SendTransactionalEmailArgs = {
  to: string;
  sender: TransactionalEmailSender | null;
  subject: string;
  textContent: string;
  htmlContent: string;
};

export function escapeEmailHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function resolveTransactionalEmailSender(
  args: ResolveTransactionalEmailSenderArgs,
): TransactionalEmailSender | null {
  const configuredFrom = args.from?.trim();

  if (!configuredFrom) return null;

  const mailboxMatch = configuredFrom.match(
    /^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/,
  );
  const email = (mailboxMatch?.[2] ?? configuredFrom).trim();
  const configuredName = args.name?.trim();
  const mailboxName = mailboxMatch?.[1]?.trim();
  const name = configuredName || mailboxName || args.defaultName || "ZoeSkoul";

  if (!/^\S+@\S+\.\S+$/.test(email)) return null;

  return { email, name };
}

export async function sendTransactionalEmail(
  args: SendTransactionalEmailArgs,
): Promise<TransactionalEmailResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();

  if (!apiKey || !args.sender) {
    return { delivered: false, provider: "manual", reason: "not_configured" };
  }

  try {
    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        accept: "application/json",
        "api-key": apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        sender: args.sender,
        to: [{ email: args.to }],
        subject: args.subject,
        textContent: args.textContent,
        htmlContent: args.htmlContent,
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        delivered: false,
        provider: "brevo",
        reason: "provider_error",
        detail: (await response.text()).slice(0, 500),
      };
    }

    const payload = (await response.json().catch(() => null)) as
      | { messageId?: unknown }
      | null;
    const messageId =
      typeof payload?.messageId === "string" ? payload.messageId.trim() : "";

    if (!messageId) {
      return {
        delivered: false,
        provider: "brevo",
        reason: "provider_error",
        detail: "Brevo accepted the request but did not return a message id.",
      };
    }

    return { delivered: true, provider: "brevo", messageId };
  } catch (error) {
    return {
      delivered: false,
      provider: "brevo",
      reason: "provider_error",
      detail: error instanceof Error ? error.message : "Unknown email error",
    };
  }
}
