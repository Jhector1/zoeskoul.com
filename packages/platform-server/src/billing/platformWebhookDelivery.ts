/**
 * Shared PLATFORM billing webhook delivery state machine.
 * Signature verification and provider operations are supplied by an app adapter;
 * this module never handles generated-store merchant payment webhooks.
 */
export type PlatformBillingWebhookEvent = Readonly<{
  id: string;
  type: string;
  livemode: boolean;
  created: number;
}>;
export type PlatformBillingWebhookReferences = Readonly<{
  objectId: string | null;
  customerId: string | null;
  subscriptionId: string | null;
}>;
export type PlatformBillingEventClaim =
  | Readonly<{kind: "duplicate"; status: "processed" | "ignored"}>
  | Readonly<{kind: "in_progress"}>
  | Readonly<{kind: "claimed"; attemptCount: number; recovered?: boolean}>;
export type PlatformBillingReconciliationResult =
  | Readonly<{kind: "ignored"; reason: string}>
  | Readonly<{kind: "processed"; action?: string}>;
export type PlatformWebhookResponse = Readonly<{
  status: number;
  body: Readonly<Record<string, string | number | boolean>>;
}>;

export async function processPlatformBillingWebhook<E extends PlatformBillingWebhookEvent>(input: Readonly<{
  event: E;
  relevant: (type: string) => boolean;
  references: (event: E) => PlatformBillingWebhookReferences;
  claim: (evidence: PlatformBillingWebhookEvent & PlatformBillingWebhookReferences) => Promise<PlatformBillingEventClaim>;
  reconcile: (event: E) => Promise<PlatformBillingReconciliationResult>;
  markIgnored: (id: string, attemptCount: number, reason: string) => Promise<boolean>;
  markProcessed: (id: string, attemptCount: number) => Promise<boolean>;
  markFailed: (id: string, attemptCount: number, error: unknown) => Promise<unknown>;
  reportError: (stage: "mark_failed" | "reconciliation", error: unknown) => void;
}>): Promise<PlatformWebhookResponse> {
  const { event } = input;
  if (!input.relevant(event.type)) return {status: 200, body: {received: true, outcome: "unrelated"}};

  let claimAttempt: number | null = null;
  try {
    const claim = await input.claim({
      id: event.id, type: event.type, livemode: event.livemode, created: event.created,
      ...input.references(event),
    });
    if (claim.kind === "duplicate") {
      return {status: 200, body: {received: true, duplicate: true, outcome: claim.status}};
    }
    if (claim.kind === "in_progress") {
      return {status: 409, body: {received: false, outcome: "processing"}};
    }
    claimAttempt = claim.attemptCount;
    const result = await input.reconcile(event);
    if (result.kind === "ignored") {
      if (!await input.markIgnored(event.id, claim.attemptCount, result.reason)) {
        throw new Error("Stripe event could not be marked ignored");
      }
      return {status: 200, body: {received: true, outcome: "ignored"}};
    }
    if (!await input.markProcessed(event.id, claim.attemptCount)) {
      throw new Error("Stripe event could not be marked processed");
    }
    return {status: 200, body: {received: true, outcome: "processed"}};
  } catch (error) {
    if (claimAttempt !== null) {
      try { await input.markFailed(event.id, claimAttempt, error); }
      catch (markError) { input.reportError("mark_failed", markError); }
    }
    input.reportError("reconciliation", error);
    return {status: 500, body: {message: "Webhook handler failed", outcome: "failed"}};
  }
}
