import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { createBuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import { resolveZoeBuildOrigins } from "@/lib/appOrigins";
import { SHOPIFY_OAUTH_BINDING_COOKIE } from "@/lib/commerce/shopifyOAuthCallbackBoundary";
import { provisionShopifyStorefrontAfterOAuth } from "@/lib/commerce/shopifyStorefrontProvisioning";
import { ShopifyOAuthRouteAccessError, requireShopifyOAuthOwnedStore } from "@/lib/commerce/shopifyOAuthRouteAccess";
import {
  completeShopifyOAuthFlow,
  shopifyOAuthCallbackUri,
  shopifyOAuthRoutesConfigured,
  trustedShopifyOAuthOrigin,
} from "@/lib/commerce/shopifyOAuthRouteFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NONCE = /^[A-Za-z0-9_-]{43}$/;

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(SHOPIFY_OAUTH_BINDING_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/",
  });
  return response;
}

function fail(status = 400) {
  // No callback query, token, shop name or OAuth state is ever reflected.
  return noStore(NextResponse.json({ ok: false, code: "SHOPIFY_OAUTH_CALLBACK_REJECTED" }, { status }));
}

/** The state is only a lookup key. Project ownership, browser binding and HMAC
 * are validated before the authorization code is exchanged. */
export async function GET(request: NextRequest) {
  if (!shopifyOAuthRoutesConfigured({
    enabled: process.env.ZOEBUILD_SHOPIFY_OAUTH_ROUTES_ENABLED,
    clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID,
    clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET,
  })) return fail(503);

  try {
    const origin = trustedShopifyOAuthOrigin(resolveZoeBuildOrigins().zoebuildOrigin);
    const redirectUri = shopifyOAuthCallbackUri({ zoebuildOrigin: origin });
    const callback = new URL(request.url);
    if (`${callback.origin}${callback.pathname}` !== redirectUri || request.url.length > 8192) return fail();
    const stateValues = callback.searchParams.getAll("state");
    if (stateValues.length !== 1 || !NONCE.test(stateValues[0])) return fail();

    const pending = await prisma.commerceProviderOAuthState.findUnique({
      where: { stateHash: createHash("sha256").update(stateValues[0]).digest("hex") },
      select: {
        provider: true, buildProjectId: true, storeId: true, environment: true, shopHostname: true,
        redirectUri: true, expiresAt: true, consumedAt: true,
      },
    });
    if (!pending || pending.provider !== "shopify" || pending.redirectUri !== redirectUri ||
        pending.consumedAt || pending.expiresAt <= new Date() ||
        (pending.environment !== "test" && pending.environment !== "live")) return fail();
    if (pending.environment === "live" && process.env.ZOEBUILD_SHOPIFY_LIVE_CONNECT_ENABLED !== "true") return fail(403);

    // Never trust a project ID, environment or redirect destination from the URL.
    const storeId = await requireShopifyOAuthOwnedStore(prisma, request, pending.buildProjectId);
    if (storeId !== pending.storeId) return fail(403);

    const secretStore = createBuildSecretStore({ prisma });
    await completeShopifyOAuthFlow({
      client: prisma,
      secretStore,
      buildProjectId: pending.buildProjectId,
      storeId,
      environment: pending.environment,
      redirectUri,
      callbackUrl: request.url,
      browserBinding: request.cookies.get(SHOPIFY_OAUTH_BINDING_COOKIE)?.value ?? null,
      clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID!,
      clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET!,
    });
    await provisionShopifyStorefrontAfterOAuth(prisma, {
      buildProjectId: pending.buildProjectId,
      storeId,
      environment: pending.environment,
      // This name is read from the verified state, not a user-supplied redirect.
      shopHostname: pending.shopHostname,
      secretStore,
    });
    const destination = new URL(`/en/projects/${encodeURIComponent(pending.buildProjectId)}?shopify=connected`, `${origin}/`);
    return noStore(NextResponse.redirect(destination, 303));
  } catch (error) {
    if (error instanceof ShopifyOAuthRouteAccessError) return fail(error.status);
    return fail();
  }
}
