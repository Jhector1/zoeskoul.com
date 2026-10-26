/**
 * V12J.9E: Stable per-logical-AI-attempt identity, distinct from the HTTP trace.
 * A browser-supplied UUID is only an idempotency marker, NEVER authorization,
 * a price input, or proof of billing entitlement. Ledger remains user scoped.
 * Production review/activation gates remain independently mandatory.
 */
export const ZOE_AI_OPERATION_HEADER = "X-ZoeBuild-Ai-Operation-Id";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ZoeAiOperationIdentityError extends Error {
  readonly code = "AI_BILLING_OPERATION_ID_REQUIRED";
  constructor() { super("AI_BILLING_OPERATION_ID_REQUIRED"); this.name = "ZoeAiOperationIdentityError"; }
}

export function requireZoeAiBillingOperationId(input: Readonly<{
  supplied: string | null;
  purpose: "plan" | "intent" | "edit" | "answer";
  projectId?: string;
}>): string {
  // Deliberately no fallback to a server-generated per-request trace UUID:
  // a network retry must be able to reuse the SAME ledger reservation key.
  if (typeof input.supplied !== "string" || !UUID_V4.test(input.supplied)) {
    throw new ZoeAiOperationIdentityError();
  }
  // Project routing is never trusted for ownership: the route must independently
  // verify the authenticated owner and current source version before spending.
  if (input.purpose !== "plan" &&
      (!input.projectId || !/^[a-zA-Z0-9_-]{1,48}$/.test(input.projectId))) {
    throw new ZoeAiOperationIdentityError();
  }
  const operation = `zb:${input.purpose}:${input.projectId ? `${input.projectId}:` : ""}${input.supplied.toLowerCase()}`;
  // The composed route appends :intent, :edit or :attempt:N downstream.
  if (operation.length > 100) throw new ZoeAiOperationIdentityError();
  return operation;
}
