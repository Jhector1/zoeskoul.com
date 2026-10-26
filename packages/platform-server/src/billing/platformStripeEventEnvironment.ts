/**
 * Platform-only Stripe webhook mode gate, called AFTER signature verification
 * and BEFORE durable event claims or entitlement mutations. Never use merchant
 * payment credentials at this boundary. No API or database access.
 */
export type PlatformStripeEventEnvironmentResult =
  | "accepted"
  | "unconfigured"
  | "mode_mismatch"
  | "connected_account";

export function checkPlatformStripeEventEnvironment(input: Readonly<{
  secretKey: string | null | undefined;
  event: Readonly<{ livemode: unknown; account?: unknown }>;
}>): PlatformStripeEventEnvironmentResult {
  const key = input.secretKey?.trim() ?? "";
  const expectedLivemode = key.startsWith("sk_test_") && key.length > "sk_test_".length
    ? false
    : key.startsWith("sk_live_") && key.length > "sk_live_".length
      ? true
      : null;
  if (expectedLivemode === null) return "unconfigured";
  // Platform billing does not accept Connect-account merchant webhooks.
  if (input.event.account !== undefined && input.event.account !== null) {
    return "connected_account";
  }
  if (typeof input.event.livemode !== "boolean" || input.event.livemode !== expectedLivemode) {
    return "mode_mismatch";
  }
  return "accepted";
}
