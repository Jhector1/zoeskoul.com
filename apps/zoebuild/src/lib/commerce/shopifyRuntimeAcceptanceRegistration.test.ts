import { describe, expect, it } from "vitest";
import {
  SHOPIFY_ACCEPTANCE_RUNTIME_REGISTRATION,
  SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN,
  shopifyAcceptanceRuntimeAllowed,
} from "./shopifyRuntimeAcceptanceRegistration";

const key = "a".repeat(32);

describe("Shopify runtime acceptance registration is disabled by default", () => {
  it("requires explicit token, trusted ingress signer and isolated test mode", () => {
    expect(shopifyAcceptanceRuntimeAllowed({})).toBe(false);
    expect(shopifyAcceptanceRuntimeAllowed({ nodeEnv: "test", activationToken: SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN })).toBe(false);
    expect(shopifyAcceptanceRuntimeAllowed({ nodeEnv: "test", activationToken: SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN, signingKey: "weak" })).toBe(false);
    expect(shopifyAcceptanceRuntimeAllowed({ nodeEnv: "development", activationToken: SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN, signingKey: key })).toBe(false);
    expect(shopifyAcceptanceRuntimeAllowed({ nodeEnv: "production", activationToken: SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN, signingKey: key })).toBe(false);
    expect(shopifyAcceptanceRuntimeAllowed({ nodeEnv: "test", activationToken: SHOPIFY_ACCEPTANCE_RUNTIME_TOKEN, signingKey: key })).toBe(true);
  });

  it("has ONLY a test-environment manifest while public executable manifests remain separate", () => {
    expect(SHOPIFY_ACCEPTANCE_RUNTIME_REGISTRATION.manifest).toMatchObject({
      key: "shopify", environments: ["test"], connectionKinds: ["credentials"],
    });
    expect(Object.keys(SHOPIFY_ACCEPTANCE_RUNTIME_REGISTRATION.handlers).sort()).toEqual([
      "commerce.catalog", "commerce.inventory", "commerce.cart", "commerce.orders", "commerce.checkout", "commerce.payments",
    ].sort());
    expect(SHOPIFY_ACCEPTANCE_RUNTIME_REGISTRATION.handlers["commerce.payments"]).toMatchObject({
      executionMode: "provider-hosted", requiresSecretStore: false,
    });
  });

  it("rejects unverified buyer IP before reaching Shopify cart adapter", async () => {
    const execute = SHOPIFY_ACCEPTANCE_RUNTIME_REGISTRATION.handlers["commerce.cart"].executeCommand;
    await expect(execute({} as never, {
      buildProjectId: "p", surface: "preview", command: { operation: "get", cartId: "opaque" },
    }, {
      buildProjectId: "p", provider: "shopify", environment: "test", connection: {} as never,
    })).rejects.toThrow("Shopify commerce capability is unavailable");
  });
});
