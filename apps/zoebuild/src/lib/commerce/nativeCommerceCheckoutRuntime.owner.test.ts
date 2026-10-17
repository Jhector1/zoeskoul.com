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
  "provider-neutral checkout ownership",
  () => {
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
      "keeps Zoé Store checkout orchestration separate from payment ownership",
      () => {
        expect(
          checkout,
        ).toContain(
          "ZOESTORE_COMMERCE_PROVIDER",
        );

        expect(
          checkout,
        ).toContain(
          "prepareCommercePaymentCheckout",
        );
      },
    );

    it(
      "routes payments through the provider composition registry and shared contract",
      () => {
        expect(
          registry,
        ).toContain(
          '"commerce.payments"',
        );

        expect(
          registry,
        ).toContain(
          "prepareStripeCommercePayments",
        );

        expect(
          registry,
        ).toContain(
          "CommercePaymentsCapabilityHandler",
        );

        expect(
          runtime,
        ).toContain(
          "prepareCommercePaymentCheckout",
        );

        expect(
          runtime,
        ).not.toContain(
          "prepareStripeCommercePayments",
        );

        expect(
          runtime,
        ).not.toContain(
          'session.redirectUrl ??',
        );

        expect(
          runtime,
        ).toContain(
          "Configured commerce payment provider did not return a hosted checkout URL.",
        );
      },
    );

    it(
      "keeps provider secrets and provider executors out of Zoé Store checkout",
      () => {
        expect(
          checkout,
        ).not.toContain(
          "createBuildSecretStore",
        );

        expect(
          checkout,
        ).not.toContain(
          "STRIPE_COMMERCE_CHECKOUT_EXECUTOR",
        );

        expect(
          checkout,
        ).not.toContain(
          "COMMERCE_PAYMENT_CHECKOUT_EXECUTORS",
        );
      },
    );
  },
);
