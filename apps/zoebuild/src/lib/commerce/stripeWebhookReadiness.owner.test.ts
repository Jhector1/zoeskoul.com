import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const app = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const read = (relative: string) => readFileSync(resolve(app, relative), "utf8");
const routes = read("src/app/api/build/projects/[buildProjectId]/commerce/providers/route.ts");
const ui = read("src/app/[locale]/projects/[buildProjectId]/StripeConnectionPanel.tsx");
const checkout = read("src/lib/commerce/stripeCommerceCheckout.ts");
const webhook = read("src/app/api/build/projects/[buildProjectId]/commerce/providers/stripe/webhook/[environment]/route.ts");

describe("Stripe payment activation webhook readiness", () => {
  it("exposes only derived readiness state from authorized provider GET", () => {
    expect(routes).toContain("webhookConfigured:");
    expect(routes).toContain("Boolean(connection.webhookSecretRef)");
    const publicSnapshot = routes.slice(routes.indexOf("function publicStoreSnapshot"), routes.indexOf("export async function GET"));
    expect(publicSnapshot).not.toContain("webhookSecretRef:");
  });
  it("fails closed on Stripe payment route activation without the environment webhook", () => {
    expect(routes).toContain('definition.id === "stripe"');
    expect(routes).toContain('capabilities.includes("payments")');
    expect(routes).toContain('"STRIPE_WEBHOOK_CONFIGURATION_REQUIRED"');
    expect(routes).toContain("connection.environment === targetEnvironment");
  });
  it("presents readiness and disables both environment activation actions", () => {
    expect(ui).toContain("testWebhookReady");
    expect(ui).toContain("liveWebhookReady");
    expect(ui).toContain("props.onChanged();");
    expect(ui).toContain("!testWebhookReady ||");
    expect(ui).toContain("!liveWebhookReady ||");
    expect(ui).toContain("actual Stripe webhook delivery must");
  });
  it("blocks legacy routed checkout with a missing Stripe webhook secret", () => {
    expect(checkout).toContain("input.connection.webhookSecretRef?.trim()");
    expect(checkout).toContain('"STRIPE_WEBHOOK_CONFIGURATION_REQUIRED"');
  });
  it("bounds Stripe payloads before signature verification", () => {
    expect(webhook).toContain("readBoundedRequestBody(request, MAX_WEBHOOK_BYTES)");
    expect(webhook).toContain("readBoundedRequestBody(request, MAX_CONFIG_BYTES)");
    expect(webhook).toContain("Buffer.from(rawBytes)");
    expect(webhook).not.toContain("await request.text()");
  });
});
