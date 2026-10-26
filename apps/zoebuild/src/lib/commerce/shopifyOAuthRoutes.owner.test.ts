import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const base = "src/app/api/build/projects/[buildProjectId]/commerce/providers/shopify/oauth/[environment]";
function source(path: string) { return readFileSync(resolve(__dirname, "../../..", path), "utf8"); }

describe("Shopify OAuth HTTP route boundaries", () => {
  it("reuses Zoéskoul authentication and project ownership", () => {
    const access = source("src/lib/commerce/shopifyOAuthRouteAccess.ts");
    expect(access).toContain("loadCurrentBuildAccessSnapshot(request)");
    expect(access).toContain("getBuildProjectCommand({");
    expect(access).toContain("commerceStore.findUnique");
  });
  it("requires same-origin POST, rate limits, and a secure nonce binding cookie", () => {
    const route = source(`${base}/start/route.ts`);
    expect(route).toContain("enforceSameOriginPost(request)");
    expect(route).toContain("trustedShopifyOAuthOrigin(resolveZoeBuildOrigins().zoebuildOrigin)");
    expect(route).toContain("rateLimit(");
    expect(route).toContain("shopifyOAuthBrowserCookie(flow.browserBinding)");
    expect(route).toContain("response.cookies.set(cookie.name, cookie.value, cookie.options)");
  });
  it("uses one stable callback and resolves the project from a pending hashed state", () => {
    const route = source("src/app/api/build/commerce/providers/shopify/oauth/callback/route.ts");
    expect(route).toContain('createHash("sha256").update(stateValues[0])');
    expect(route).toContain("requireShopifyOAuthOwnedStore(prisma, request, pending.buildProjectId)");
    expect(route).toContain("completeShopifyOAuthFlow({");
    expect(route).toContain("request.cookies.get(SHOPIFY_OAUTH_BINDING_COOKIE)");
    expect(route).toContain('SHOPIFY_OAUTH_BINDING_COOKIE, ""');
    expect(route).not.toContain('searchParams.get("redirect")');
  });
  it("does not expose Shopify runtime without the acceptance gate", () => {
    const runtime = source("src/lib/commerce/commerceRuntimeRegistry.ts");
    expect(runtime).toContain("shopifyAcceptanceRuntimeAllowed({");
  });
});
