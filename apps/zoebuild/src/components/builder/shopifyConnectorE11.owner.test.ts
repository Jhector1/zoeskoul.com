import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../../..");
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("ZoeBuild Shopify E11 merchant connector", () => {
  it("shows the merchant OAuth control without asking for a Headless private token", () => {
    const ui = source("src/app/[locale]/projects/[buildProjectId]/ShopifyConnectionPanel.tsx");
    const workspace = source("src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx");
    expect(ui).toContain("Connect with Shopify");
    expect(ui).toContain("/commerce/providers/shopify/oauth/test/start");
    expect(ui).toContain("/commerce/providers/shopify/connection");
    expect(ui).not.toContain("privateToken");
    expect(ui).not.toContain("whsec_");
    expect(workspace).toContain("<ShopifyConnectionPanel");
    const shell = source("src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
    expect(shell).toContain('get("shopify") === "connected"');
    expect(shell).toContain('initialSection={shopifyConnectedReturn ? "commerce" : undefined}');
  });

  it("uses one fixed callback URL and an owner-bound one-time state", () => {
    const callback = source("src/app/api/build/commerce/providers/shopify/oauth/callback/route.ts");
    expect(callback).toContain('createHash("sha256").update(stateValues[0])');
    expect(callback).toContain("requireShopifyOAuthOwnedStore(prisma, request, pending.buildProjectId)");
    expect(callback).toContain("completeShopifyOAuthFlow({");
    expect(callback).toContain("provisionShopifyStorefrontAfterOAuth(prisma");
    expect(callback).toContain("request.cookies.get(SHOPIFY_OAUTH_BINDING_COOKIE)");
    expect(existsSync(resolve(root, "src/app/api/build/projects/[buildProjectId]/commerce/providers/shopify/oauth/[environment]/callback/route.ts"))).toBe(false);
  });

  it("provisions a scoped Storefront credential after merchant authorization", () => {
    const provision = source("src/lib/commerce/shopifyStorefrontProvisioning.ts");
    const graphql = source("src/lib/commerce/shopifyStorefrontGraphql.ts");
    expect(provision).toContain("storefrontAccessTokenCreate");
    expect(provision).toContain('"X-Shopify-Access-Token": admin.accessToken');
    expect(provision).toContain("credentialsSecretRef: connection.credentialsSecretRef");
    expect(provision).toContain("shopify-storefront-public");
    expect(graphql).toContain("X-Shopify-Storefront-Access-Token");
  });

  it("keeps Shopify runtime activation separate from authorizing a store", () => {
    const flow = source("src/lib/commerce/shopifyOAuthRouteFlow.ts");
    const registry = source("src/lib/commerce/commerceRuntimeRegistry.ts");
    const connection = source("src/lib/commerce/commerceProviderConnectionRegistry.ts");
    expect(flow).not.toContain("commerceProviderRoute.create");
    expect(registry).toContain("shopifyAcceptanceRuntimeAllowed({");
    expect(connection).toContain("SHOPIFY_OAUTH_REQUIRED");
  });
});
