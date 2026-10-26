import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const repo = resolve(__dirname, "../../../../..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");
const base = "apps/zoebuild/src/";
const settings = read(`${base}app/[locale]/projects/[buildProjectId]/SiteSettingsWorkspacePanel.tsx`);
const commerce = read(`${base}app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx`);
const directory = read(`${base}components/builder/ProviderDirectory.tsx`);
const catalog = read(`${base}lib/integrations/providerDirectoryCatalog.ts`);

describe("ZoeBuild E13 provider directory ownership", () => {
  it("adds database providers and keeps capability categories distinct", () => {
    expect(settings).toContain('id: "databases"');
    for (const label of ["neon", "supabase", "firebase", "turso", "planetscale", "mongodb-atlas"]) {
      expect(catalog).toContain(`id: "${label}"`);
    }
    for (const label of ["commerce", "payments", "marketing", "databases", "seo"]) {
      expect(catalog).toContain(`${label}: [`);
    }
    expect(catalog).toContain("Public presentation metadata ONLY");
  });
  it("keeps unimplemented provider connections disabled and navigates per category", () => {
    expect(settings).toContain('status: "unavailable"');
    expect(settings).toContain('status: "browse"');
    expect(directory).toContain("disabled={disabled}");
    expect(directory).toContain('status === "unavailable"');
    expect(directory).toContain("onOpen(provider.id)");
    expect(directory).not.toMatch(/apiKey|accessToken|secretKey|connectionString|DATABASE_URL/);
  });
  it("derives actionable commerce and payment states from the existing server response", () => {
    expect(commerce).toContain("shopifyOAuthConfigured === true");
    expect(commerce).toContain('item.provider === "shopify" && item.status === "active"');
    expect(commerce).toContain('item.provider === "stripe" && item.status === "active"');
    expect(commerce).toContain("item.executableCapabilities?.payments === true");
    expect(commerce).toContain("<ShopifyConnectionPanel");
    expect(commerce).toContain("<StripeConnectionPanel");
    expect(commerce).toContain("Commerce status unavailable");
    expect(commerce).not.toMatch(/type=["']password["']|cardNumber|\bcvv\b/);
  });
});


describe("ZoeBuild E13B read failure behavior", () => {
  it("keeps native store identifiable and allows inspection without inventing a connection", () => {
    expect(commerce).toContain('provider.id === "zoebuild-native" && !paymentsOnly');
    expect(commerce).toContain('status = "built-in"');
    expect(commerce).toContain('status = configurationError ? "unverified" : "checking"');
    expect(commerce).toContain('Connection could not be verified');
    expect(directory).toContain('unverified: "Status unverified"');
    expect(directory).toContain('status === "unavailable" || status === "checking"');
  });
  it("shows request id and retry without showing fake connections while API is down", () => {
    expect(commerce).toContain('response.headers.get("X-Request-Id")');
    expect(commerce).toContain('HTTP {configurationFailure.status}');
    expect(commerce).toContain('onClick={retryConfiguration}');
    expect(commerce).toContain('openedProvider === "stripe" && currentConfiguration');
    expect(commerce).toContain('openedProvider === "shopify" && currentConfiguration');
    expect(commerce).not.toContain('status = "connected";\n          note = configurationError');
  });
});
