/** UI-facing diagnostics derived only from verified, read-only billing evidence.
 * This module never creates subscriptions or grants and has no Stripe/DB calls.
 */
export type BuilderSandboxMode = "test" | "live" | "missing";
export type BuilderCheckoutReturnState = "not_checked" | "verified" | "paid_unreconciled" | "pending" | "invalid" | "unavailable";

export type BuilderBillingEvidence = Readonly<{
  mode: BuilderSandboxMode;
  planConfigured: boolean;
  customerLinked: boolean;
  subscriptionRecorded: boolean;
  subscriptionActive: boolean;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  cancellationDate?:string|null;
  nextBillingDate?:string|null;
  nextBillingAmountMinor?:number|null;
  nextBillingCurrency?:string|null;
  webhookProcessed: boolean;
  webhookProcessedAt: string | null;
  generateGrant: boolean;
  editGrant: boolean;
  checkoutReturn: BuilderCheckoutReturnState;
  checkedAt: string;
}>;

export type BuilderFlowCheck = Readonly<{
  id: "setup" | "checkout" | "webhook" | "subscription" | "access";
  label: string;
  state: "passed" | "pending" | "blocked";
  detail: string;
}>;

export function builderSandboxMode(secret: string | null | undefined): BuilderSandboxMode {
  const value = secret?.trim() ?? "";
  if (/^sk_test_[A-Za-z0-9_]+$/.test(value)) return "test";
  if (/^sk_live_[A-Za-z0-9_]+$/.test(value)) return "live";
  return "missing";
}

export function builderBillingFlowChecks(e: BuilderBillingEvidence): readonly BuilderFlowCheck[] {
  return [
    {id:"setup",label:"Test environment",state:e.mode !== "test" || !e.planConfigured ? "blocked" : "passed",
      detail:e.mode === "live" ? "Live Stripe key detected. Use a separate test environment for acceptance." :
        e.mode === "missing" ? "Platform Stripe key is missing or invalid." :
        e.planConfigured ? "Stripe test mode and Builder price mapping are present." : "No Builder subscription prices configured."},
    {id:"checkout",label:"Checkout payment",state:e.checkoutReturn === "verified" || e.checkoutReturn === "paid_unreconciled" ? "passed" : e.checkoutReturn === "invalid" ? "blocked" : "pending",
      detail:e.checkoutReturn === "verified" ? "Stripe confirms payment and the matching Builder subscription is recorded." :
        e.checkoutReturn === "paid_unreconciled" ? (e.webhookProcessed && e.subscriptionActive && e.customerLinked
          ? "Stripe confirms the historical test payment. Its customer-owned Builder subscription and signed webhook are now reconciled."
          : "Stripe confirms payment for this account; webhook or subscription reconciliation is still pending. Do not pay again.") :
        e.checkoutReturn === "invalid" ? "Stripe Checkout session did not match your account, product, or payment." :
        e.checkoutReturn === "unavailable" ? "Stripe verification is unavailable. Recheck without retrying payment." :
        e.checkoutReturn === "pending" ? "Stripe returned, but the Checkout/session record is still settling." :
        "Complete a test Checkout to verify the exact payment session."},
    {id:"webhook",label:"Webhook reconciliation",state:e.webhookProcessed ? "passed" : "pending",
      detail:e.webhookProcessed ? "A subscription event was processed in the canonical webhook ledger." : "No processed webhook evidence for this Builder subscription yet."},
    {id:"subscription",label:"Subscription in platform DB",state:e.subscriptionActive && e.customerLinked ? "passed" : "pending",
      detail:e.subscriptionActive && e.customerLinked ? "Active Builder subscription belongs to your linked platform customer." :
        e.subscriptionRecorded ? "Subscription is recorded but not currently eligible." : "Waiting for a matching customer-owned Builder subscription."},
    {id:"access",label:"Builder AI entitlements",state:e.generateGrant && e.editGrant && e.subscriptionActive ? "passed" : "pending",
      detail:e.generateGrant && e.editGrant && e.subscriptionActive ? "Subscription-sourced generation and editing grants are both active." :
        "Generation and editing grants must both be active and sourced from the subscription."},
  ];
}

export function builderFlowPassed(e: BuilderBillingEvidence): boolean {
  return builderBillingFlowChecks(e).every(c => c.state === "passed");
}

/** Correlates a Stripe Checkout return with this authenticated user and
 * one of this user's already-persisted Builder subscriptions. No URL claims.
 */
export function classifyBuilderCheckoutSession(input:Readonly<{
  session:Readonly<{
    mode:string|null;status:string|null;paymentStatus:string|null;livemode:boolean;
    userId:string|null;billingProduct:string|null;priceId:string|null;
    customerId:string|null;subscriptionId:string|null;
  }>;
  userId:string;customerId:string;subscriptionIds:readonly string[];
  builderPriceIds:readonly string[];expectedLivemode:boolean;
}>): "verified" | "paid_unreconciled" | "pending" | "invalid" {
  const s=input.session;
  // Checkout metadata preserves the price at payment time. Stripe allows a
  // merchant to switch the SAME subscription to a new recurring Builder price.
  // Accept historical Checkout pricing ONLY if the authenticated user's
  // customer-owned DB subscription is now mapped to a registered Builder price.
  // The provider has already verified the Stripe session independently.
  const isCurrentOwnedBuilderSubscription=Boolean(s.subscriptionId && input.subscriptionIds.includes(s.subscriptionId));
  const currentBuilderCheckoutPrice=Boolean(s.priceId && input.builderPriceIds.includes(s.priceId));
  if(s.mode!=="subscription" || s.livemode!==input.expectedLivemode ||
    s.userId!==input.userId || s.customerId!==input.customerId ||
    s.billingProduct!=="builder_ai" || !s.priceId ||
    (!currentBuilderCheckoutPrice && !isCurrentOwnedBuilderSubscription))return "invalid";
  if(s.status==="open")return "pending";
  if(s.status!=="complete")return "invalid";
  if(s.paymentStatus!=="paid" || !s.subscriptionId)return "pending";
  // Customer, product, price, live-mode and authenticated user were already
  // checked. A paid Stripe session is payment evidence even before the
  // canonical webhook writes the matching subscription into our database.
  if(!input.subscriptionIds.includes(s.subscriptionId))return "paid_unreconciled";
  return "verified";
}
