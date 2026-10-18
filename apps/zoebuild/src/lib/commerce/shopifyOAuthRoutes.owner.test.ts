import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const base = "src/app/api/build/projects/[buildProjectId]/commerce/providers/shopify/oauth/[environment]";
function source(path: string) { return readFileSync(resolve(__dirname, "../../..", path), "utf8"); }

describe("Shopify OAuth HTTP route boundaries", () => {
  it("uses canonical Zoéskoul Web auth and requires an owned Build project for both steps", () => {
    const access = source("src/lib/commerce/shopifyOAuthRouteAccess.ts");
    expect(access).toContain("loadCurrentBuildAccessSnapshot(request)");
    expect(access).toContain("getBuildProjectCommand({");
    expect(access).toContain("createPrismaBuildProjectReader(client)");
    expect(access).toContain("commerceStore.findUnique");
  });
  it("requires same-origin POST, trusted callback origin, rate limits, and a secure binding cookie", () => {
    const route = source(`${base}/start/route.ts`);
    expect(route).toContain("enforceSameOriginPost(request)");
    expect(route).toContain("trustedShopifyOAuthOrigin(resolveZoeBuildOrigins().zoebuildOrigin)");
    expect(route).toContain("rateLimit(");
    expect(route).toContain("shopifyOAuthBrowserCookie(flow.browserBinding)");
    expect(route).toContain("response.cookies.set(cookie.name, cookie.value, cookie.options)");
    expect(route).toContain("shopifyOAuthRoutesConfigured");
  });
  it("never follows a Shopify callback redirect target and clears browser nonce cookie", () => {
    const route = source(`${base}/callback/route.ts`);
    expect(route).toContain("completeShopifyOAuthFlow({");
    expect(route).toContain("request.cookies.get(SHOPIFY_OAUTH_BINDING_COOKIE)");
    expect(route).toContain("new URL(");
    expect(route).toContain("SHOPIFY_OAUTH_BINDING_COOKIE, \"\"");
    expect(route).not.toContain("searchParams.get(\"redirect\")");
  });
  it("leaves Shopify non-executable and does not register a checkout runtime", () => {
    const manifests = source("src/lib/commerce/commerceProviderExecutableManifests.ts");
    const runtime = source("src/lib/commerce/commerceRuntimeRegistry.ts");
    expect(manifests).not.toContain("SHOPIFY_COMMERCE_PROVIDER_MANIFEST");
    expect(runtime).not.toContain("registerShopifyCommerceRuntime");
  });
});
