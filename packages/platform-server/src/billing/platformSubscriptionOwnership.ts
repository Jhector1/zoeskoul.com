/**
 * Shared platform customer-binding filter for persisted SaaS subscriptions.
 * Product/price eligibility alone is NOT ownership. Stripe customer IDs are
 * server-owned and may not be supplied by the requesting browser.
 * Never apply this helper to a merchant storefront/customer database.
 */
export function verifiedPlatformSubscriptionRows<S extends Readonly<{stripeCustomerId: string}>>(input: Readonly<{
  storedStripeCustomerId: string | null | undefined;
  rows: readonly S[];
}>): readonly S[] {
  const customerId = input.storedStripeCustomerId?.trim();
  if (!customerId) return [];
  return input.rows.filter(row => row.stripeCustomerId === customerId);
}
