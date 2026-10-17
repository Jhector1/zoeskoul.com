import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@zoeskoul/platform-server/prisma";
import { createBuildSecretStore } from "@zoeskoul/platform-server/security/buildSecretStore";
import { resolveZoeBuildOrigins } from "@/lib/appOrigins";
import { SHOPIFY_OAUTH_BINDING_COOKIE } from "@/lib/commerce/shopifyOAuthCallbackBoundary";
import { ShopifyOAuthRouteAccessError, requireShopifyOAuthOwnedStore } from "@/lib/commerce/shopifyOAuthRouteAccess";
import {
  completeShopifyOAuthFlow,
  shopifyOAuthCallbackUri,
  shopifyOAuthRoutesConfigured,
  trustedShopifyOAuthOrigin,
} from "@/lib/commerce/shopifyOAuthRouteFlow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = Readonly<{ params: Promise<{ buildProjectId: string; environment: string }> }>;
function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.cookies.set(SHOPIFY_OAUTH_BINDING_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "lax", maxAge: 0, path: "/",
  });
  return response;
}
function json(code: string, status: number) {
  return noStore(NextResponse.json({ ok: false, code }, { status }));
}

export async function GET(request: NextRequest, context: Context) {
  if (!shopifyOAuthRoutesConfigured({
    enabled: process.env.ZOEBUILD_SHOPIFY_OAUTH_ROUTES_ENABLED,
    clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID,
    clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET,
  })) return json("SHOPIFY_OAUTH_NOT_CONFIGURED", 503);
  const { buildProjectId, environment } = await context.params;
  if (environment !== "test" && environment !== "live") {
    return json("SHOPIFY_OAUTH_ENVIRONMENT_INVALID", 400);
  }
  try {
    const origin = trustedShopifyOAuthOrigin(resolveZoeBuildOrigins().zoebuildOrigin);
    if (new URL(request.url).origin !== origin) return json("SHOPIFY_OAUTH_CALLBACK_INVALID", 400);
    const storeId = await requireShopifyOAuthOwnedStore(prisma, request, buildProjectId);
    const redirectUri = shopifyOAuthCallbackUri({ zoebuildOrigin: origin, buildProjectId, environment });
    await completeShopifyOAuthFlow({
      client: prisma,
      secretStore: createBuildSecretStore({ prisma }),
      buildProjectId,
      storeId,
      environment,
      redirectUri,
      callbackUrl: request.url,
      browserBinding: request.cookies.get(SHOPIFY_OAUTH_BINDING_COOKIE)?.value ?? null,
      clientId: process.env.ZOEBUILD_SHOPIFY_CLIENT_ID!,
      clientSecret: process.env.ZOEBUILD_SHOPIFY_CLIENT_SECRET!,
    });
    // Never redirect to a Shopify-supplied target or echo authorization codes.
    const destination = new URL(
      `/en/projects/${encodeURIComponent(buildProjectId)}?shopify=connected`,
      `${origin}/`,
    );
    return noStore(NextResponse.redirect(destination, 303));
  } catch (error) {
    if (error instanceof ShopifyOAuthRouteAccessError) {
      return json(error.status === 401 ? "BUILD_AUTH_REQUIRED" : "BUILD_PROJECT_NOT_FOUND", error.status);
    }
    return json("SHOPIFY_OAUTH_CALLBACK_REJECTED", 400);
  }
}
