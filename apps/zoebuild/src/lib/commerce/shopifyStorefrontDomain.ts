import "server-only";

/** Shopify payloads stay untrusted until normalized at this boundary. */
export class ShopifyStorefrontDomainError extends Error {
  readonly code: "SHOPIFY_STOREFRONT_DOMAIN_INVALID" | "SHOPIFY_STOREFRONT_OPERATION_REJECTED";
  constructor(code: ShopifyStorefrontDomainError["code"] = "SHOPIFY_STOREFRONT_DOMAIN_INVALID") {
    super("Shopify storefront data could not be processed securely.");
    this.name = "ShopifyStorefrontDomainError";
    this.code = code;
  }
}

export function failDomain(code?: ShopifyStorefrontDomainError["code"]): never {
  throw new ShopifyStorefrontDomainError(code);
}

export function object(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return failDomain();
  return value as Record<string, unknown>;
}

export function string(value: unknown, max = 4096): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) return failDomain();
  return value;
}

export function optionalString(value: unknown, max = 4096): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string" || value.length > max) return failDomain();
  return value;
}

export function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) return failDomain();
  return value;
}

export function nonNegativeInt(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return failDomain();
  return value;
}

export function positiveInt(value: unknown, max = 100): number {
  const quantity = nonNegativeInt(value);
  if (quantity < 1 || quantity > max) return failDomain();
  return quantity;
}

const CURRENCY = /^[A-Z]{3}$/;
export function currency(value: unknown): string {
  if (typeof value !== "string" || !CURRENCY.test(value)) return failDomain();
  try {
    new Intl.NumberFormat("en", { style: "currency", currency: value });
  } catch { return failDomain(); }
  return value;
}

/** Strict decimal -> integer minor units, without floating point rounding. */
export function moneyMinor(value: unknown, expectedCurrency?: string): Readonly<{minor: number; currency: string}> {
  const data = object(value);
  const code = currency(data.currencyCode);
  if (expectedCurrency !== undefined && code !== expectedCurrency) return failDomain();
  const raw = data.amount;
  if (typeof raw !== "string" || !/^(?:0|[1-9]\d{0,13})(?:\.\d{1,3})?$/.test(raw)) return failDomain();
  const scale = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? failDomain();
  const [whole, fraction = ""] = raw.split(".");
  if (fraction.length > scale) {
    // Extra zeroes are harmless, but non-zero fractional minor units cannot be represented.
    if (/[^0]/.test(fraction.slice(scale))) return failDomain();
  }
  const padded = fraction.slice(0, scale).padEnd(scale, "0");
  const minor = BigInt(whole) * 10n ** BigInt(scale) + BigInt(padded || "0");
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) return failDomain();
  return { minor: Number(minor), currency: code };
}

export function shopifyGid(value: unknown, type: "Product" | "ProductVariant"): string {
  const gid = string(value, 256);
  if (!new RegExp(`^gid://shopify/${type}/[0-9]+$`).test(gid)) return failDomain();
  return gid;
}

export function remoteCartId(value: unknown): string {
  const id = string(value, 4096);
  // Cart IDs may carry sensitive key material after a question mark.
  if (!/^gid:\/\/shopify\/Cart\/[A-Za-z0-9_-]+(?:\?key=[A-Za-z0-9_-]+)?$/.test(id)) return failDomain();
  return id;
}

export function rejectUserErrors(payload: Record<string, unknown>): void {
  const errors = array(payload.userErrors, 250);
  if (errors.length > 0) failDomain("SHOPIFY_STOREFRONT_OPERATION_REJECTED");
  // No silently ignored warnings that could change quantities or checkout eligibility.
  if (payload.warnings !== undefined && array(payload.warnings, 250).length > 0) {
    failDomain("SHOPIFY_STOREFRONT_OPERATION_REJECTED");
  }
}
