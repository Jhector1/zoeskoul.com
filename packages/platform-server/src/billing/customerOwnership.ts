/** One verified platform Stripe account; never merchant-commerce customers. */
export function isVerifiedPlatformSubscriptionOwner(input: Readonly<{
  userId: string;
  storedStripeCustomerId: string | null;
  subscriptionCustomerId: string;
  subscriptionMetadataUserId?: string | null;
}>): boolean {
  const userId = input.userId.trim();
  if (!userId || !input.subscriptionCustomerId) return false;
  if (!input.storedStripeCustomerId || input.storedStripeCustomerId !== input.subscriptionCustomerId) return false;
  // A signed Stripe event is not by itself proof that client-supplied metadata may reassign ownership.
  const metadataUserId = input.subscriptionMetadataUserId?.trim();
  if (metadataUserId && metadataUserId !== userId) return false;
  return true;
}
