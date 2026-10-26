import { NextResponse } from "next/server";
import {
  enforceSameOriginPost,
  readJsonSafe,
} from "@zoeskoul/platform-server/http";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { createBuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import { rateLimit } from "@zoeskoul/platform-server/security/ratelimit";
import { resolveZoeBuildOrigins } from "@/lib/appOrigins";
import { shopifyOAuthBrowserCookie } from "@/lib/commerce/shopifyOAuthCallbackBoundary";
import { requireShopifyOAuthOwnedStore, ShopifyOAuthRouteAccessError } from "@/lib/commerce/shopifyOAuthRouteAccess";
import {
  shopifyOAuthCallbackUri,
  shopifyOAuthRoutesConfigured,
  startShopifyOAuthFlow,
  trustedShopifyOAuthOrigin,
} from "@/lib/commerce/shopifyOAuthRouteFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ buildProjectId: string; environment: string }> }>;
function json(code: string, status: number) {
  const response = NextResponse.json({ ok: false, code }, { status });
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function POST(request: Request, context: Context) {
  if (!shopifyOAuthRoutesConfigured({
    enabled: process.env.ZOEBUILD_SHOPIFY_OAUTH_ROUTES_ENABLED,
    clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID,
    clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET,
  })) return json("SHOPIFY_OAUTH_NOT_CONFIGURED", 503);
  if (!enforceSameOriginPost(request)) return json("BUILD_FORBIDDEN", 403);
  const { buildProjectId, environment } = await context.params;
  if (environment !== "test" && environment !== "live") {
    return json("SHOPIFY_OAUTH_ENVIRONMENT_INVALID", 400);
  }
  if (environment === "live" && process.env.ZOEBUILD_SHOPIFY_LIVE_CONNECT_ENABLED !== "true") {
    return json("SHOPIFY_OAUTH_LIVE_DISABLED", 403);
  }
  try {
    const origin = trustedShopifyOAuthOrigin(resolveZoeBuildOrigins().zoebuildOrigin);
    if (new URL(request.url).origin !== origin) return json("BUILD_FORBIDDEN", 403);
    const storeId = await requireShopifyOAuthOwnedStore(prisma, request, buildProjectId);
    const limited = await rateLimit(
      `zoebuild-shopify-oauth:${buildProjectId}:${storeId}:${environment}`,
      { bucket: "zoebuild-shopify-oauth", limit: 10, window: "1 h" },
    ).catch(() => null);
    if (!limited) return json("SHOPIFY_OAUTH_UNAVAILABLE", 503);
    if (!limited.ok) return json("SHOPIFY_OAUTH_RATE_LIMITED", 429);
    const body = await readJsonSafe(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json("SHOPIFY_OAUTH_INPUT_INVALID", 400);
    }
    const shop = (body as Record<string, unknown>).shop;
    if (typeof shop !== "string" || !/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)) {
      return json("SHOPIFY_OAUTH_INPUT_INVALID", 400);
    }
    const redirectUri = shopifyOAuthCallbackUri({ zoebuildOrigin: origin });
    const flow = await startShopifyOAuthFlow({
      client: prisma,
      secretStore: createBuildSecretStore({ prisma }),
      scope: { buildProjectId, storeId, environment, shopHostname: shop, redirectUri },
      clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID!,
      clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET!,
    });
    const response = NextResponse.json({
      ok: true,
      authorizationUrl: flow.authorizationUrl,
      environment,
    });
    const cookie = shopifyOAuthBrowserCookie(flow.browserBinding);
    response.cookies.set(cookie.name, cookie.value, cookie.options);
    response.headers.set("Cache-Control", "no-store, max-age=0");
    return response;
  } catch (error) {
    if (error instanceof ShopifyOAuthRouteAccessError) {
      return json(error.status === 401 ? "BUILD_AUTH_REQUIRED" : "BUILD_PROJECT_NOT_FOUND", error.status);
    }
    return json("SHOPIFY_OAUTH_START_FAILED", 503);
  }
}
