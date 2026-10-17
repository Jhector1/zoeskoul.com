import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  );
}

describe(
  "ZoeBuild Stripe checkout ownership",
  () => {
    const stripe =
      source(
        "src/lib/commerce/stripeCommerceCheckout.ts",
      );

    const checkout =
      source(
        "src/lib/commerce/nativeCommerceCheckout.ts",
      );

    const runtime =
      source(
        "src/lib/commerce/commerceRuntime.ts",
      );

    const registry =
      source(
        "src/lib/commerce/commerceRuntimeRegistry.ts",
      );

    it(
      "keeps Stripe server-only and outside generated storefront code",
      () => {
        expect(stripe).toContain('import "server-only"');
        expect(stripe).toContain('from "stripe"');
        expect(checkout).not.toContain('from "stripe"');
      },
    );

    it(
      "dereferences credentials only through the generic BuildSecretStore",
      () => {
        expect(stripe).toContain("BuildSecretStore");
        expect(stripe).toContain("readStripeSecretKey");
        expect(stripe).toContain("credentialsSecretRef");
      },
    );

    it(
      "enforces exact Stripe test and live credential environments",
      () => {
        expect(stripe).toContain("/^(sk|rk)_test_/");
        expect(stripe).toContain("/^(sk|rk)_live_/");
        expect(stripe).toContain("STRIPE_ENVIRONMENT_MISMATCH");
      },
    );

    it(
      "owns trusted HTTPS return URLs inside the provider adapter",
      () => {
        expect(stripe).toContain("ZOEBUILD_PUBLIC_ORIGIN");
        expect(stripe).toContain('"https:"');
        expect(stripe).toContain('"localhost"');
      },
    );

    it(
      "uses the trusted order id as Stripe idempotency and metadata authority",
      () => {
        expect(stripe).toContain("request.idempotencyKey");
        expect(stripe).toContain("zoebuildOrderId");
        expect(stripe).toContain("zoebuildProjectId");
      },
    );

    it(
      "preflights credentials before Zoé Store creates the order without a transitional executor",
      () => {
        expect(stripe).toContain("prepareStripeCommercePayments");
        expect(stripe).toContain("await readStripeSecretKey");
        expect(stripe).not.toContain("createStripeCommerceCheckoutExecutor");
        expect(stripe).not.toContain("STRIPE_COMMERCE_CHECKOUT_EXECUTOR");

        const payment =
          checkout.indexOf(
            "await preparePaymentProvider",
          );

        const order =
          checkout.indexOf(
            "await createOrReuseOrderSnapshot",
          );

        expect(payment).toBeGreaterThan(-1);
        expect(order).toBeGreaterThan(payment);
      },
    );

    it(
      "registers Stripe payments only at the provider composition root",
      () => {
        expect(registry).toContain("prepareStripeCommercePayments");
        expect(registry).toContain('"commerce.payments"');
        expect(runtime).not.toContain("STRIPE_COMMERCE_PROVIDER");
        expect(runtime).not.toContain("prepareStripeCommercePayments");
      },
    );
  },
);
