/**
 * Single server-side policy for default and purpose-specific email senders.
 * Intentional overrides: welcome and invitation emails may have distinct
 * verified sender identities. No platform/auth/tenant secrets are handled here.
 */
export type EmailSenderPurpose = "welcome" | "classroom-invite";

type SenderEnvironment = Readonly<Record<string, string | undefined>>;

export function resolveEmailSenderSettings(
  purpose: EmailSenderPurpose,
  env: SenderEnvironment,
): { from: string | undefined; name: string | undefined; defaultName: "ZoeSkoul" } {
  const fromOverride = purpose === "welcome"
    ? env.BREVO_WELCOME_FROM_EMAIL
    : env.BREVO_INVITE_FROM_EMAIL;
  const nameOverride = purpose === "welcome"
    ? env.BREVO_WELCOME_FROM_NAME
    : env.BREVO_INVITE_FROM_NAME;

  return {
    from: fromOverride ?? env.BREVO_FROM_EMAIL ?? env.EMAIL_FROM,
    name: nameOverride ?? env.BREVO_FROM_NAME,
    defaultName: "ZoeSkoul",
  };
}
