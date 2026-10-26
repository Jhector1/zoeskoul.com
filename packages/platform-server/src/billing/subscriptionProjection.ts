import { hasCurrentSubscriptionAccess } from "./subscriptionEligibility";
import { resolvePlatformProductForPrice, type PlatformPriceRecord, type PlatformBillingProduct } from "./productCatalog";
export type PlatformSubscriptionRecord = Readonly<{
  priceId: string | null;
  status: string;
  trialEnd: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd?: boolean;
}>;
export function activePlatformProductSubscription(input: Readonly<{
  product: PlatformBillingProduct;
  catalog: readonly PlatformPriceRecord[];
  subscriptions: readonly PlatformSubscriptionRecord[];
  now?: Date;
}>): PlatformSubscriptionRecord | null {
  const nowMs = (input.now ?? new Date()).getTime();
  const matching = input.subscriptions.filter(s => s.priceId && resolvePlatformProductForPrice(input.catalog,s.priceId)?.product === input.product);
  return matching.find(s => hasCurrentSubscriptionAccess({...s, nowMs})) ?? null;
}
