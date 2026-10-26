/** Stripe controls whether a new paid Checkout may start. This is NOT the access policy. */
export function blocksNewPlatformCheckout(status: string): boolean {
  // Canceled and incomplete_expired are terminal provider states.
  return status !== "canceled" && status !== "incomplete_expired";
}
/** Active / trialing / past_due keep access only within Stripe-reported period. */
export function isStripeSubscriptionLive(status: string): boolean {
  return status === "active" || status === "trialing" || status === "past_due";
}
