import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const root = resolve(__dirname, "../../../../..");
const file = (p: string) => readFileSync(resolve(root, p), "utf8");
const shell = file("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const settings = file("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/SiteSettingsWorkspacePanel.tsx");
const commerce = file("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx");
const stripe = file("apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/StripeConnectionPanel.tsx");
const css = file("apps/zoebuild/src/app/globals.css");
describe("ZoeBuild settings workspace owners", () => {
  it("routes every project to Site Settings while gating commercial controls by stack", () => {
    expect(shell).toContain("<SiteSettingsWorkspacePanel");
    expect(shell).toContain("Site Settings");
    expect(settings).toContain('props.commerceEnabled ? (');
    expect(settings).toContain("Commerce is not enabled");
  });
  it("separates store and payment configuration without duplicating providers", () => {
    expect(settings).toContain('id: "marketing"');
    expect(settings).toContain('id: "seo"');
    expect(settings).toContain('id: "payments"');
    expect(commerce).toContain('props.section === "payments"');
    expect(commerce).toContain("<StripeConnectionPanel");
    expect(settings).toContain("Not configured — no connection");
  });
  it("contains webhook endpoints and masks credentials within bounded layout", () => {
    expect(stripe).toContain("webhookPath(environment");
    expect(stripe).toContain("navigator.clipboard.writeText");
    expect(stripe).toContain('className="zb-stripe-webhook-url"');
    expect(stripe.match(/type="password"/g)?.length).toBe(4);
    expect(css).toContain("ZOEBUILD_SITE_SETTINGS_E2");
    expect(css).toContain("overflow-wrap: anywhere");
  });
});
