/**
 * Canonical platform subscription synchronization. Both apps supply the same
 * provider operations; this module has no learning plan or merchant-commerce logic.
 * All destructive local expiration occurs only after a COMPLETE provider listing.
 */
export type PlatformRemoteSubscription = Readonly<{ id: string; customer: string | Readonly<{id: string}> }>;
export type PlatformSubscriptionSyncDependencies<S extends PlatformRemoteSubscription> = Readonly<{
  readCustomerId: (userId: string) => Promise<string | null>;
  verifyCustomer: (customerId: string) => Promise<Readonly<{deleted?: boolean}> | null>;
  clearCustomerId: (userId: string) => Promise<unknown>;
  fetchAllSubscriptions: (customerId: string) => Promise<readonly S[]>;
  persistSubscription: (subscription: S, userId: string) => Promise<unknown>;
  expireMissing: (userId: string, ids: readonly string[]) => Promise<unknown>;
  isMissingCustomerError: (error: unknown) => boolean;
}>;
export async function synchronizePlatformCustomerSubscriptions<S extends PlatformRemoteSubscription>(input: Readonly<{
  userId: string;
  deps: PlatformSubscriptionSyncDependencies<S>;
}>): Promise<void> {
  const userId = input.userId.trim();
  if (!userId) throw new Error("Platform billing requires an authenticated user id.");
  const d = input.deps;
  const customerId = await d.readCustomerId(userId);
  if (!customerId) {
    await d.expireMissing(userId, []);
    return;
  }
  try {
    const customer = await d.verifyCustomer(customerId);
    if (!customer || customer.deleted === true) {
      await d.clearCustomerId(userId);
      await d.expireMissing(userId, []);
      return;
    }
  } catch (error) {
    if (!d.isMissingCustomerError(error)) throw error;
    await d.clearCustomerId(userId);
    await d.expireMissing(userId, []);
    return;
  }
  // A transient provider error or incomplete page must never expire local grants.
  const subscriptions = await d.fetchAllSubscriptions(customerId);
  const seen = new Set<string>();
  for (const subscription of subscriptions) {
    const remoteCustomer = typeof subscription.customer === "string"
      ? subscription.customer : subscription.customer.id;
    if (!subscription.id || remoteCustomer !== customerId || seen.has(subscription.id)) {
      throw new Error("Incomplete or inconsistent platform subscription listing.");
    }
    seen.add(subscription.id);
  }
  for (const subscription of subscriptions) await d.persistSubscription(subscription, userId);
  await d.expireMissing(userId, [...seen]);
}

/** Fetch every provider page. Fail closed instead of expiring unseen subscriptions. */
export async function collectPlatformSubscriptionPages<S extends Readonly<{id: string}>>(input: Readonly<{
  listPage: (cursor: string | undefined) => Promise<Readonly<{data: readonly S[]; has_more: boolean}>>;
  maxPages?: number;
}>): Promise<readonly S[]> {
  const pages = input.maxPages ?? 100;
  if (!Number.isInteger(pages) || pages < 1) throw new Error("Invalid billing pagination bound.");
  const all: S[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  for (let pageNum = 0; pageNum < pages; pageNum++) {
    const page = await input.listPage(cursor);
    all.push(...page.data);
    if (!page.has_more) return all;
    const last = page.data.at(-1)?.id;
    if (!last || cursors.has(last)) throw new Error("Stripe subscription pagination did not advance.");
    cursors.add(last);
    cursor = last;
  }
  throw new Error("Stripe subscription listing exceeds safety page limit.");
}
