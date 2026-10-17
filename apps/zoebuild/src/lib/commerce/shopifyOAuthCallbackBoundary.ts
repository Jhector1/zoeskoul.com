import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PrismaClient } from "@zoeskoul/db";
import type { ShopifyAuthorizationCode } from "@zoeskoul/build-imports";

const HOST = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;
const NONCE = /^[A-Za-z0-9_-]{43}$/;
const MAX_AGE_MS = 5 * 60 * 1000;
const COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const SHOPIFY_OAUTH_BINDING_COOKIE = "zoebuild_shopify_oauth_binding";

export type ShopifyOAuthScope = Readonly<{
  buildProjectId: string;
  storeId: string;
  environment: "test" | "live";
  shopHostname: string;
  redirectUri: string;
}>;

export class ShopifyOAuthCallbackError extends Error {
  readonly code = "SHOPIFY_OAUTH_CALLBACK_REJECTED" as const;
  constructor() {
    super("Shopify authorization callback could not be verified.");
    this.name = "ShopifyOAuthCallbackError";
  }
}

function reject(): never { throw new ShopifyOAuthCallbackError(); }
function digest(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
function validatedScope(scope: ShopifyOAuthScope): ShopifyOAuthScope {
  if (!scope.buildProjectId.trim() || !scope.storeId.trim() ||
      (scope.environment !== "test" && scope.environment !== "live") ||
      !HOST.test(scope.shopHostname)) reject();
  let url: URL;
  try { url = new URL(scope.redirectUri); } catch { return reject(); }
  if (url.protocol !== "https:" || url.username || url.password ||
      url.hash || url.search || !url.hostname || url.port) reject();
  return scope;
}

export function shopifyOAuthBrowserCookie(value: string) {
  if (!NONCE.test(value)) reject();
  return {
    name: SHOPIFY_OAUTH_BINDING_COOKIE,
    value,
    options: {
      httpOnly: true as const,
      secure: true as const,
      sameSite: "lax" as const,
      maxAge: COOKIE_MAX_AGE_SECONDS,
      path: "/" as const,
    },
  };
}

/** Create one durable, hashed state bound to the originating browser. */
export async function beginShopifyOAuthState(
  client: PrismaClient,
  scopeInput: ShopifyOAuthScope,
  now: Date = new Date(),
): Promise<Readonly<{ state: string; browserBinding: string }>> {
  const scope = validatedScope(scopeInput);
  if (!Number.isFinite(now.getTime())) reject();
  const state = randomBytes(32).toString("base64url");
  const browserBinding = randomBytes(32).toString("base64url");
  await client.commerceProviderOAuthState.create({
    data: {
      stateHash: digest(state),
      browserBindingHash: digest(browserBinding),
      buildProjectId: scope.buildProjectId,
      storeId: scope.storeId,
      provider: "shopify",
      environment: scope.environment,
      shopHostname: scope.shopHostname,
      redirectUri: scope.redirectUri,
      expiresAt: new Date(now.getTime() + COOKIE_MAX_AGE_SECONDS * 1000),
    },
  });
  return { state, browserBinding };
}

function singleton(params: URLSearchParams, name: string): string {
  const all = params.getAll(name);
  if (all.length !== 1 || !all[0]) reject();
  return all[0];
}

/** Verifies Shopify's OAuth query HMAC (not its separate webhook/app-proxy signatures). */
function verifiedCallbackParams(callbackUrl: string, clientSecret: string, now: Date) {
  if (callbackUrl.length > 8192 || !clientSecret || !Number.isFinite(now.getTime())) reject();
  let url: URL;
  try { url = new URL(callbackUrl); } catch { return reject(); }
  const params = url.searchParams;
  const names = [...params.keys()];
  if (new Set(names).size !== names.length || names.includes("signature")) reject();
  const supplied = singleton(params, "hmac");
  if (!/^[a-fA-F0-9]{64}$/.test(supplied)) reject();
  const signed = [...params.entries()]
    .filter(([name]) => name !== "hmac")
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
  const expected = createHmac("sha256", clientSecret).update(signed).digest();
  const actual = Buffer.from(supplied, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) reject();
  const shop = singleton(params, "shop");
  const state = singleton(params, "state");
  const code = singleton(params, "code");
  const timestamp = singleton(params, "timestamp");
  if (!HOST.test(shop) || !NONCE.test(state) || code.length > 4096 ||
      !/^\d{10,11}$/.test(timestamp)) reject();
  const timestampMs = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now.getTime() - timestampMs) > MAX_AGE_MS) reject();
  return { url, shop, state, code };
}

/** Consumes the nonce exactly once using a conditional SQL update. */
export async function verifyAndConsumeShopifyOAuthCallback(
  client: PrismaClient,
  input: Readonly<{
    callbackUrl: string;
    clientSecret: string;
    browserBinding: string | null;
    scope: ShopifyOAuthScope;
    now?: Date;
  }>,
): Promise<ShopifyAuthorizationCode> {
  const now = input.now ?? new Date();
  const scope = validatedScope(input.scope);
  const verified = verifiedCallbackParams(input.callbackUrl, input.clientSecret, now);
  if (verified.url.origin + verified.url.pathname !== scope.redirectUri ||
      verified.shop !== scope.shopHostname ||
      !input.browserBinding || !NONCE.test(input.browserBinding)) reject();
  const updated = await client.commerceProviderOAuthState.updateMany({
    where: {
      stateHash: digest(verified.state),
      browserBindingHash: digest(input.browserBinding),
      buildProjectId: scope.buildProjectId,
      storeId: scope.storeId,
      provider: "shopify",
      environment: scope.environment,
      shopHostname: scope.shopHostname,
      redirectUri: scope.redirectUri,
      consumedAt: null,
      expiresAt: { gt: now },
    },
    data: { consumedAt: now },
  });
  if (updated.count !== 1) reject();
  return {
    store: { hostname: verified.shop, origin: `https://${verified.shop}/` },
    code: verified.code,
    state: verified.state,
  };
}

/** For createShopifyOAuthTransport: only this exact verified code may be exchanged once. */
export function oneTimeShopifyCallbackValidator(verified: ShopifyAuthorizationCode) {
  let exchanged = false;
  return async (candidate: ShopifyAuthorizationCode): Promise<void> => {
    if (exchanged || candidate.code !== verified.code || candidate.state !== verified.state ||
        candidate.store.hostname !== verified.store.hostname ||
        candidate.store.origin !== verified.store.origin) reject();
    exchanged = true;
  };
}
