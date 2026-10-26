/**
 * Canonical PLATFORM subscription Checkout attempt lifecycle.
 * No Next.js, Stripe SDK, Prisma, environment-mode branches, or merchant-store payments.
 * Provider adapter supplies authenticated customer/session operations and idempotency keys.
 */
export type PlatformCheckoutSessionEvidence = Readonly<{
  id: string;
  mode?: string | null;
  status?: string | null;
  metadata?: Readonly<Record<string, string>> | null;
  line_items?: Readonly<{data: readonly Readonly<{price?: Readonly<{id: string}> | null}>[]}> | null;
  url?: string | null;
}>;

export type PlatformCheckoutIntentMatch = "match" | "mismatch" | "unknown";

export function classifyPlatformCheckoutIntent(input: Readonly<{
  session: PlatformCheckoutSessionEvidence;
  priceId: string;
  useTrial: boolean;
}>): PlatformCheckoutIntentMatch {
  const priceId = input.session.metadata?.priceId?.trim() ||
    input.session.line_items?.data?.[0]?.price?.id || null;
  const rawUseTrial = input.session.metadata?.useTrial;
  if (!priceId || (rawUseTrial !== "true" && rawUseTrial !== "false")) return "unknown";
  return priceId === input.priceId && (rawUseTrial === "true") === input.useTrial ? "match" : "mismatch";
}

export function findPlatformCheckoutAttemptSession<S extends PlatformCheckoutSessionEvidence>(input: Readonly<{
  sessions: readonly S[];
  checkoutAttemptId: string;
  statuses: readonly string[];
}>): S | null {
  return input.sessions.find(session =>
    session.mode === "subscription" &&
    session.metadata?.checkoutAttemptId === input.checkoutAttemptId &&
    input.statuses.includes(session.status ?? ""),
  ) ?? null;
}

/** Stripe expiration races must be settled by a provider re-read; never assume failure means expired. */
export async function expirePlatformCheckoutSession<S extends PlatformCheckoutSessionEvidence>(input: Readonly<{
  sessionId: string;
  expire: (id: string) => Promise<S>;
  retrieve: (id: string) => Promise<S>;
}>): Promise<S> {
  try {
    return await input.expire(input.sessionId);
  } catch (original) {
    try {
      const latest = await input.retrieve(input.sessionId);
      if (latest.status === "expired") return latest;
    } catch {
      // The original provider error remains authoritative without proof of expiration.
    }
    throw original;
  }
}

/**
 * Find a created session before issuing another POST. Matching attempt IDs with
 * contradictory price/trial intent must fail closed, not silently start a new session.
 */
export async function createOrRecoverPlatformSubscriptionCheckout<S extends PlatformCheckoutSessionEvidence>(input: Readonly<{
  checkoutAttemptId: string;
  priceId: string;
  useTrial: boolean;
  successUrl: string;
  listSessions: () => Promise<readonly S[]>;
  createSession: () => Promise<S>;
}>): Promise<Readonly<{id: string; url: string | null}>> {
  const sessions = await input.listSessions();
  const recovered = findPlatformCheckoutAttemptSession({
    sessions, checkoutAttemptId: input.checkoutAttemptId, statuses: ["open", "complete"],
  });
  if (recovered) {
    if (classifyPlatformCheckoutIntent({session: recovered, priceId: input.priceId, useTrial: input.useTrial}) !== "match") {
      throw new Error("Existing Stripe Checkout intent does not match this attempt.");
    }
    return {
      id: recovered.id,
      url: recovered.url ?? input.successUrl.replace("{CHECKOUT_SESSION_ID}", recovered.id),
    };
  }
  const created = await input.createSession();
  if (!created.id) throw new Error("Provider did not return a Checkout session ID.");
  return {id: created.id, url: created.url ?? null};
}
