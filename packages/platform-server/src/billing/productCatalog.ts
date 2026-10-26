/**
 * One canonical product/Stripe price mapping for platform subscriptions.
 * This is PLATFORM billing, not merchant storefront checkout.
 * Stripe prices are opaque identifiers; test/live mode is verified by the
 * Stripe provider and environment-bound database, not inferred from an ID.
 */
export type PlatformBillingProduct = "learning" | "builder_ai";
export type PlatformPriceRecord = Readonly<{
  product: PlatformBillingProduct;
  tier: "monthly" | "yearly" | "subscription";
  priceId: string;
}>;
/**
 * Environment bindings are arbitrary string-keyed values. NodeJS.ProcessEnv
 * implements this contract, so app runtimes can supply process.env without
 * casts while the catalog still reads only its three explicit price keys.
 */
export type BillingPriceEnvironment = Readonly<Record<string, string | undefined>>;

const PRICE_PATTERN = /^price_[A-Za-z0-9_]+$/;
const BUILDER_PRICE_KEY = "ZOEBUILD_AI_STRIPE_PRICE_IDS";

/** Missing builder prices mean disabled Builder AI sales, not free access. */
export function configuredBuilderAiPriceIds(
  raw: string | undefined = process.env.ZOEBUILD_AI_STRIPE_PRICE_IDS,
): ReadonlySet<string> {
  if (raw === undefined || raw.trim() === "") return new Set();
  const values = raw.split(",").map(v => v.trim());
  if (values.some(v => !PRICE_PATTERN.test(v))) {
    throw new Error(`${BUILDER_PRICE_KEY} must be a comma-separated list of Stripe price IDs.`);
  }
  if (new Set(values).size !== values.length) {
    throw new Error(`${BUILDER_PRICE_KEY} must not contain duplicate Stripe price IDs.`);
  }
  return new Set(values);
}

export function resolvePlatformBillingCatalog(
  env: BillingPriceEnvironment,
): readonly PlatformPriceRecord[] {
  const items: PlatformPriceRecord[] = [];
  const learningPrices = [
    ["monthly", env.STRIPE_PRICE_MONTHLY_ID],
    ["yearly", env.STRIPE_PRICE_YEARLY_ID],
  ] as const;
  for (const [tier, raw] of learningPrices) {
    const priceId = raw?.trim();
    if (!priceId) continue;
    if (!PRICE_PATTERN.test(priceId)) throw new Error(`Invalid Stripe learning ${tier} price ID.`);
    items.push({ product: "learning", tier, priceId });
  }
  for (const priceId of configuredBuilderAiPriceIds(env.ZOEBUILD_AI_STRIPE_PRICE_IDS)) {
    items.push({ product: "builder_ai", tier: "subscription", priceId });
  }
  if (new Set(items.map(item => item.priceId)).size !== items.length) {
    throw new Error("A Stripe price may belong to only one platform billing product/tier.");
  }
  return items;
}

export function resolvePlatformProductForPrice(
  catalog: readonly PlatformPriceRecord[], priceId: string,
): PlatformPriceRecord | null {
  const matches = catalog.filter(p => p.priceId === priceId);
  if (matches.length > 1) throw new Error("Ambiguous Stripe product mapping.");
  return matches[0] ?? null;
}

/** Refuse a cross-product checkout even if the browser supplies a valid price ID. */
export function requirePlatformPriceForProduct(input: Readonly<{
  catalog: readonly PlatformPriceRecord[];
  product: PlatformBillingProduct;
  priceId: string;
}>): PlatformPriceRecord {
  const found = resolvePlatformProductForPrice(input.catalog, input.priceId);
  if (!found || found.product !== input.product) throw new Error("BILLING_PRODUCT_PRICE_NOT_ALLOWED");
  return found;
}
