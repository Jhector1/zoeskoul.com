import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(
    fileURLToPath(
      new URL(
        "../../../../../",
        import.meta.url,
      ),
    ),
  );

function source(
  relative:
    string,
) {
  return readFileSync(
    resolve(
      repo,
      relative,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild Stripe checkout ownership",
  () => {
    const stripe =
      source(
        "apps/zoebuild/src/lib/commerce/stripeCommerceCheckout.ts",
      );

    const checkout =
      source(
        "apps/zoebuild/src/lib/commerce/nativeCommerceCheckout.ts",
      );

    const pkg =
      source(
        "apps/zoebuild/package.json",
      );

    it(
      "keeps Stripe server-only and outside generated storefront code",
      () => {
        expect(
          stripe,
        ).toContain(
          'import "server-only"',
        );

        expect(
          stripe,
        ).toContain(
          'from "stripe"',
        );

        expect(
          pkg,
        ).toContain(
          '"stripe"',
        );

        expect(
          stripe,
        ).not.toContain(
          "globalThis",
        );

        expect(
          stripe,
        ).not.toContain(
          "window.",
        );

        expect(
          stripe,
        ).not.toContain(
          "localStorage",
        );
      },
    );

    it(
      "dereferences credentials only through the generic BuildSecretStore",
      () => {
        expect(
          stripe,
        ).toContain(
          "BuildSecretStore",
        );

        expect(
          stripe,
        ).toContain(
          "credentialsSecretRef",
        );

        expect(
          stripe,
        ).not.toContain(
          "STRIPE_SECRET_KEY",
        );
      },
    );

    it(
      "enforces test/live credential separation",
      () => {
        expect(
          stripe,
        ).toContain(
          "/^(sk|rk)_test_/",
        );

        expect(
          stripe,
        ).toContain(
          "/^(sk|rk)_live_/",
        );

        expect(
          stripe,
        ).toContain(
          "STRIPE_ENVIRONMENT_MISMATCH",
        );
      },
    );

    it(
      "uses the trusted order id as Stripe idempotency authority",
      () => {
        expect(
          stripe,
        ).toContain(
          "idempotencyKey:\n                input.idempotencyKey",
        );

        expect(
          checkout,
        ).toContain(
          "idempotencyKey:\n        order.id",
        );
      },
    );

    it(
      "preflights secure credentials before the cart is converted to an order",
      () => {
        const preflight =
          checkout.indexOf(
            "await executor.preflight",
          );

        const order =
          checkout.indexOf(
            "await createOrReuseOrderSnapshot",
          );

        expect(
          preflight,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          order,
        ).toBeGreaterThan(
          preflight,
        );
      },
    );

    it(
      "registers Stripe without enabling Square, PayPal, or Shopify execution",
      () => {
        expect(
          checkout,
        ).toContain(
          "STRIPE_COMMERCE_CHECKOUT_EXECUTOR",
        );

        expect(
          checkout,
        ).not.toContain(
          "SQUARE_COMMERCE_CHECKOUT_EXECUTOR",
        );

        expect(
          checkout,
        ).not.toContain(
          "PAYPAL_COMMERCE_CHECKOUT_EXECUTOR",
        );

        expect(
          checkout,
        ).not.toContain(
          "SHOPIFY_COMMERCE_CHECKOUT_EXECUTOR",
        );
      },
    );

    it(
      "does not decrement or reserve inventory during Stripe checkout initiation",
      () => {
        expect(
          stripe,
        ).not.toContain(
          "commerceInventoryItem",
        );

        expect(
          stripe,
        ).not.toContain(
          "reservedQuantity",
        );

        expect(
          stripe,
        ).not.toContain(
          "decrement",
        );
      },
    );
  },
);
