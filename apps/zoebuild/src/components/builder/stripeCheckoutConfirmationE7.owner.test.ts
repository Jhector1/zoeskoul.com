import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const read = (path: string) => readFileSync(resolve(app, path), "utf8");
const panel = read("src/app/[locale]/projects/[buildProjectId]/StripeConnectionPanel.tsx");
const panelStyles = read("src/app/[locale]/projects/[buildProjectId]/StripeConnectionPanel.module.css");
const store = read("src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx");
const shell = read("src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx");
const notice = read("src/app/[locale]/projects/[buildProjectId]/StripeCheckoutReturnNotice.tsx");
const route = read("src/app/api/build/projects/[buildProjectId]/commerce/orders/[orderId]/status/route.ts");

describe("Stripe preview payment visibility and trusted receipt", () => {
  it("shows one green ready check per fully configured Stripe environment", () => {
    // Readiness requires the saved API connection, webhook secret, and routed payments.
    expect(panel).toContain("function ReadyCheck()");
    expect(panel).toContain("className={styles.readyCheck}");
    expect(panel).toContain('aria-label="API key, webhook and payment routing configured"');
    expect(panel).toContain('testStatus === "active" && testWebhookReady && previewPaymentsActive ? <ReadyCheck />');
    expect(panel).toContain('liveStatus === "active" && liveWebhookReady && publishedPaymentsActive ? <ReadyCheck />');
    expect((panel.match(/<ReadyCheck \/>/g) ?? []).length).toBe(2);
    // The green presentation lives in the CSS module, not in inline style declarations.
    expect(panelStyles).toContain(".readyCheck");
    expect(panelStyles).toContain("color: #0f9f52;");
    expect(panelStyles).toContain("background: color-mix(in srgb, #22c55e 12%, transparent);");
    // The E10 UI intentionally removed redundant status messages inside the form.
    for (const removed of [
      "Test API key configured",
      "Live API key configured",
      "Signing secret configured",
      "Preview payments active",
      "Live payments active",
      "ConfiguredCheck",
    ]) {
      expect(panel).not.toContain(removed);
    }
  });
  it("reads the real routed payment provider before showing active labels", () => {
    expect(store).toContain("routes={configuration?.store.routes ?? []}");
    expect(panel).toContain('route.capability === "payments"');
    expect(panel).toContain('route.provider === "stripe"');
    expect(panel).toContain("route.connected === true");
    expect(panel).toContain("previewPaymentsActive");
    expect(panel).toContain("publishedPaymentsActive");
  });
  it("checks database order payment and inventory reservations under owner authorization", () => {
    expect(route).toContain("loadCurrentBuildAccessSnapshot(request)");
    expect(route).toContain("getBuildProjectCommand({");
    expect(route).toContain("store: { buildProjectId }");
    expect(route).toContain('paymentEnvironment: "test"');
    expect(route).toContain('paymentStatus === "paid"');
    expect(route).toContain('reservation.status === "committed"');
    expect(route).not.toContain("credentialsSecretRef");
    expect(route).not.toContain("webhookSecretRef");
  });
  it("never treats checkout=success as proof of payment", () => {
    expect(shell).toContain("StripeCheckoutReturnNotice");
    expect(notice).toContain("order.confirmed && order.paymentStatus");
    expect(notice).toContain("order.committedCount === order.reservationCount");
    expect(notice).toContain("Recheck order");
  });
});
