import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const read = (path: string) => readFileSync(resolve(app, path), "utf8");
const root = "src/app/[locale]/projects/[buildProjectId]/";
const stripe = read(`${root}StripeConnectionPanel.tsx`);
const css = read(`${root}StripeConnectionPanel.module.css`);

describe("ZoeBuild E9 Stripe settings layout and environment isolation", () => {
  it("uses a visible environment selector without mixing test and live controls", () => {
    expect(stripe).toContain('aria-label="Stripe environment"');
    expect(stripe).toContain('setVisibleEnvironment("test")');
    expect(stripe).toContain('setVisibleEnvironment("live")');
    expect((stripe.match(/hidden={visibleEnvironment !== "test"}/g) || []).length).toBe(2);
    expect((stripe.match(/hidden={visibleEnvironment !== "live"}/g) || []).length).toBe(2);
    expect(stripe).toContain('const testWebhookReady = webhookConfigured("test")');
    expect(stripe).toContain('const liveWebhookReady = webhookConfigured("live")');
  });
  it("makes payment section naturally sized, scrollable by its owner, never clipped internally", () => {
    expect(css).toContain("height: auto !important;");
    expect(css).toContain("max-height: none !important;");
    expect(css).toContain("overflow: visible !important;");
    expect(css).toContain(".panel :global([hidden]) { display: none !important; }");
    expect(css).not.toMatch(/overflow:\s*hidden\s*!important/);
    expect(css).toContain("var(--zb-surface)");
    expect(css).toContain("var(--zb-border)");
  });
  it("keeps a single green check per fully configured environment and secure key handling", () => {
    expect(stripe).toContain('testStatus === "active" && testWebhookReady && previewPaymentsActive ? <ReadyCheck />');
    expect(stripe).toContain('liveStatus === "active" && liveWebhookReady && publishedPaymentsActive ? <ReadyCheck />');
    expect(stripe).toContain('visibleEnvironment === "test" && !previewPaymentsActive');
    expect(stripe).toContain('visibleEnvironment === "live" && !publishedPaymentsActive');
    expect(stripe).toContain('type="password"');
    expect(stripe).not.toContain("localStorage");
    expect(stripe).not.toContain("sessionStorage");
  });
});
