import {
  readFileSync,
} from "node:fs";

import { resolve } from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

function read(
  path: string,
) {
  return readFileSync(
    resolve(__dirname, "../../..", path),
    "utf8",
  );
}

describe(
  "ZoeBuild provider-neutral stale commerce reconciliation ownership",
  () => {
    const generic =
      read(
        "src/lib/commerce/commerceCheckoutReconciliation.ts",
      );

    const runtime =
      read(
        "src/lib/commerce/commerceRuntime.ts",
      );

    const registry =
      read(
        "src/lib/commerce/commerceRuntimeRegistry.ts",
      );

    const stripe =
      read(
        "src/lib/commerce/stripeCommerceReconciliation.ts",
      );

    const webhook =
      read(
        "src/lib/commerce/stripeCommerceWebhook.ts",
      );

    it(
      "uses the single commerce payment registry instead of a second reconciliation registry",
      () => {
        expect(generic).toContain("prepareCommercePaymentReconciliation");
        expect(generic).not.toContain("COMMERCE_CHECKOUT_RECONCILIATION_EXECUTORS");
        expect(generic).not.toContain("STRIPE_COMMERCE_RECONCILIATION_EXECUTOR");
        expect(registry).toContain("COMMERCE_RUNTIME_REGISTRY");
        expect(registry).toContain("prepareStripeCommercePaymentReconciliation");
        expect(runtime).not.toContain("prepareStripeCommercePaymentReconciliation");
      },
    );

    it(
      "keeps Stripe SDK and remote session semantics inside the Stripe adapter",
      () => {
        expect(generic).not.toContain('from "stripe"');
        expect(stripe).toContain(".retrieve(");
        expect(stripe).toContain(".expire(");
        expect(stripe).toContain("CommercePaymentsCapabilityHandler");
      },
    );

    it(
      "reuses the trusted webhook lifecycle after provider-neutral inspection",
      () => {
        expect(webhook).toContain("export async function reconcileStripeCommercePaidSession");
        expect(webhook).toContain("export async function reconcileStripeCommerceExpiredSession");
        expect(stripe).toContain("reconcileStripeCommercePaidSession");
        expect(stripe).toContain("reconcileStripeCommerceExpiredSession");
      },
    );

    it(
      "does not infer missing historical environments",
      () => {
        expect(generic).not.toContain("inferEnvironmentFromProviderRef");
        expect(stripe).not.toContain("cs_test_");
        expect(stripe).not.toContain("cs_live_");
      },
    );
  },
);
