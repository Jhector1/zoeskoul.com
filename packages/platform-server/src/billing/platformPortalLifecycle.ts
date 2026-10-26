import { withValidPlatformStripeCustomer, type PlatformStripeCustomerDeps } from "./platformStripeCustomer";
/** Shared PLATFORM customer portal. The app owns its trusted return URL. */
export async function createPlatformBillingPortalSession(input: Readonly<{
  userId: string;
  returnUrl: string;
  customerDeps: PlatformStripeCustomerDeps;
  createSession: (customerId: string, returnUrl: string) => Promise<Readonly<{url: string}>>;
}>): Promise<Readonly<{url: string}>> {
  const u = new URL(input.returnUrl);
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Invalid billing portal return URL.");
  if (u.username || u.password || u.hash) throw new Error("Invalid billing portal return URL.");
  const portal = await withValidPlatformStripeCustomer({
    userId: input.userId,
    deps: input.customerDeps,
    operate: (customerId) => input.createSession(customerId, u.href),
  });
  if (!portal.url.startsWith("https://")) throw new Error("Stripe did not return a secure billing portal URL.");
  return {url: portal.url};
}
