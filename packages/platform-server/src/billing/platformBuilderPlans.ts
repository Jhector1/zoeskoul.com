import { requirePlatformPriceForProduct, type PlatformPriceRecord } from "./productCatalog";

export type ProviderRecurringPrice = Readonly<{
  id: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  recurring: Readonly<{ interval: string; interval_count: number }> | null;
  nickname: string | null;
}>;

export type PublicPlatformBillingPlan = Readonly<{
  priceId: string;
  label: string;
  interval: string;
  intervalCount: number;
  currency: string;
  unitAmountMinor: number;
}>;

/** Server-authorized, active recurring price. No browser-controlled price selection. */
export function projectBuilderBillingPlan(
  catalog: readonly PlatformPriceRecord[],
  price: ProviderRecurringPrice,
): PublicPlatformBillingPlan {
  requirePlatformPriceForProduct({catalog, product: "builder_ai", priceId: price.id});
  if (!price.active || !price.recurring || typeof price.unit_amount !== "number" || !Number.isSafeInteger(price.unit_amount) ||
      (price.unit_amount ?? -1) < 0 || price.recurring.interval_count < 1 ||
      !Number.isInteger(price.recurring.interval_count) || !/^[a-z]{3}$/.test(price.currency)) {
    throw new Error("BILLING_PROVIDER_PRICE_INVALID");
  }
  return {
    priceId: price.id,
    label: price.nickname?.trim().slice(0, 100) || "Builder AI subscription",
    interval: price.recurring.interval,
    intervalCount: price.recurring.interval_count,
    currency: price.currency,
    unitAmountMinor: price.unit_amount!,
  };
}
