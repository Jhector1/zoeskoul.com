import "server-only";

import { isIP } from "node:net";

import type { CommerceCheckoutResult } from "./commerceRuntimeContracts";

/**
 * A checkout URL is a secret-bearing browser *navigation* URL, never a provider
 * identifier or a token to persist/log. Its authority must be the canonical
 * Shopify shop or the primary domain freshly attested by Storefront GraphQL.
 * Do not accept an arbitrary host or a user-supplied permitted-domain list.
 */
export class ShopifyHostedCheckoutError extends Error {
  readonly code = "SHOPIFY_HOSTED_CHECKOUT_UNAVAILABLE" as const;
  constructor() {
    super("Shopify hosted checkout is unavailable for this cart.");
    this.name = "ShopifyHostedCheckoutError";
  }
}

function reject(): never {
  throw new ShopifyHostedCheckoutError();
}

function canonicalHost(value: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() ||
      value.length > 253 || /[\/?#@:\s\\]/.test(value)) reject();
  let url: URL;
  try { url = new URL(`https://${value}/`); } catch { return reject(); }
  if (!url.hostname || isIP(url.hostname) !== 0 || url.hostname !== value.toLowerCase() ||
      url.hostname === "localhost" || url.hostname.endsWith(".localhost") ||
      !url.hostname.includes(".") || url.hostname.startsWith("[") ||
      !/^[a-z0-9.-]+$/.test(url.hostname) || url.hostname.endsWith(".")) reject();
  if (url.hostname.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) reject();
  return url.hostname;
}

export function shopifyHostedCheckoutResult(input: Readonly<{
  url: string;
  shopHostname: string;
  primaryDomain: Readonly<{ host: string; sslEnabled: boolean }>;
}>): CommerceCheckoutResult {
  if (!input || typeof input.url !== "string" || input.url.length > 4096 ||
      input.url !== input.url.trim() || /[\u0000-\u001f\u007f]/.test(input.url)) reject();

  const shop = canonicalHost(input.shopHostname);
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.myshopify\.com$/.test(shop)) reject();
  const primary = input.primaryDomain;
  // Only a Storefront-API-attested HTTPS primary domain can authorize a
  // custom storefront hostname. The adapter, not a request body, obtains it.
  if (!primary || primary.sslEnabled !== true) reject();
  const primaryHost = canonicalHost(primary.host);

  let checkout: URL;
  try { checkout = new URL(input.url); } catch { return reject(); }
  if (checkout.protocol !== "https:" || checkout.username || checkout.password ||
      checkout.hash || checkout.port || (checkout.hostname !== shop &&
      checkout.hostname !== primaryHost) || checkout.pathname === "/") reject();

  // Preserve Shopify's checkout navigation query: it may contain keys needed
  // for the buyer's session. Never print/store it in a log or local order.
  return { kind: "hosted", provider: "shopify", url: checkout.href };
}
