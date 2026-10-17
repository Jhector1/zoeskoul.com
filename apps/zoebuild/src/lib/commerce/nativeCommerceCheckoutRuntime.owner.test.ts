import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relative:
    string,
) {
  return readFileSync(
    fileURLToPath(
      new URL(
        relative,
        import.meta.url,
      ),
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild trusted checkout and order orchestration",
  () => {
    const checkout =
      source(
        "./nativeCommerceCheckout.ts",
      );

    const preview =
      source(
        "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts",
      );

    const published =
      source(
        "../../app/sites/[buildProjectId]/[[...path]]/route.ts",
      );

    it(
      "never accepts browser totals, provider selection, environment, or redirect authority",
      () => {
        const parserStart =
          checkout.indexOf(
            "export function parseCommerceCheckoutRequest(",
          );

        const parserEnd =
          checkout.indexOf(
            "type CheckoutCartRow",
            parserStart,
          );

        expect(
          parserStart,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          parserEnd,
        ).toBeGreaterThan(
          parserStart,
        );

        const parserSource =
          checkout.slice(
            parserStart,
            parserEnd,
          );

        expect(
          parserSource,
        ).toContain(
          'keys[0] !==\n      "cartId"',
        );

        for (
          const forbidden of [
            "subtotalMinor",
            "totalMinor",
            "paymentProvider",
            "environment",
            "successUrl",
          ]
        ) {
          expect(
            parserSource,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "reprices the order from current server-side variant data",
      () => {
        expect(
          checkout,
        ).toContain(
          "variant.priceMinor",
        );

        expect(
          checkout,
        ).toContain(
          "variant.product.status",
        );

        expect(
          checkout,
        ).toContain(
          "variant.availableForSale",
        );

        expect(
          checkout,
        ).toContain(
          "COMMERCE_INVENTORY_UNAVAILABLE",
        );
      },
    );

    it(
      "creates one idempotent order per cart and freezes the cart",
      () => {
        expect(
          checkout,
        ).toContain(
          ".commerceOrder",
        );

        expect(
          checkout,
        ).toContain(
          ".upsert",
        );

        expect(
          checkout,
        ).toContain(
          "cartId:\n                cart.id",
        );

        expect(
          checkout,
        ).toContain(
          'status:\n                "converted"',
        );

        expect(
          checkout,
        ).toContain(
          "idempotencyKey:\n        order.id",
        );
      },
    );

    it(
      "does not reserve or decrement inventory merely for checkout initiation",
      () => {
        expect(
          checkout,
        ).not.toContain(
          "increment:",
        );

        expect(
          checkout,
        ).not.toContain(
          "decrement:",
        );

        expect(
          checkout,
        ).not.toContain(
          "reservedQuantity: {",
        );
      },
    );

    it(
      "requires Zoé Store to own checkout and orders while payments remain separately resolved",
      () => {
        expect(
          checkout,
        ).toContain(
          'capability:\n          "checkout"',
        );

        expect(
          checkout,
        ).toContain(
          'capability:\n          "orders"',
        );

        expect(
          checkout,
        ).toContain(
          'capability:\n          "payments"',
        );

        expect(
          checkout.match(
            /requireCommerceProviderAdapter/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          2,
        );

        expect(
          checkout,
        ).toContain(
          "COMMERCE_PAYMENT_PROVIDER_REQUIRED",
        );
      },
    );

    it(
      "keeps payment execution behind a server-only executor registry",
      () => {
        expect(
          checkout,
        ).toContain(
          'import "server-only"',
        );

        expect(
          checkout,
        ).toContain(
          "CommercePaymentCheckoutExecutor",
        );

        expect(
          checkout,
        ).toContain(
          "COMMERCE_PAYMENT_CHECKOUT_EXECUTORS",
        );

        expect(
          checkout,
        ).toContain(
          "payment.connection",
        );

        expect(
          checkout,
        ).not.toContain(
          "globalThis",
        );
      },
    );

    it(
      "wires preview checkout only after runner-held project authority",
      () => {
        const path =
          preview.indexOf(
            '"__zoebuild/commerce/checkout"',
          );

        const context =
          preview.indexOf(
            "resolveTrustedReactPreviewCapabilityAtRunner",
            path,
          );

        const project =
          preview.indexOf(
            "context.buildProjectId !==",
            context,
          );

        const checkoutCall =
          preview.indexOf(
            "beginNativeCommerceCheckout(",
            project,
          );

        expect(
          path,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          context,
        ).toBeGreaterThan(
          path,
        );

        expect(
          project,
        ).toBeGreaterThan(
          context,
        );

        expect(
          checkoutCall,
        ).toBeGreaterThan(
          project,
        );

        expect(
          preview,
        ).toContain(
          'surface:\n              "preview"',
        );
      },
    );

    it(
      "wires published checkout only after origin and ready deployment authority",
      () => {
        const origin =
          published.indexOf(
            "isPublishedSiteOriginRequest",
          );

        const deployment =
          published.indexOf(
            ".buildDeployment",
            origin,
          );

        const ready =
          published.indexOf(
            '"ready"',
            deployment,
          );

        const checkoutPath =
          published.indexOf(
            '"__zoebuild/commerce/checkout"',
          );

        const checkoutCall =
          published.indexOf(
            "beginNativeCommerceCheckout(",
            ready,
          );

        expect(
          origin,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          deployment,
        ).toBeGreaterThan(
          origin,
        );

        expect(
          ready,
        ).toBeGreaterThan(
          deployment,
        );

        expect(
          checkoutPath,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          checkoutCall,
        ).toBeGreaterThan(
          ready,
        );

        expect(
          published,
        ).toContain(
          'surface:\n              "published"',
        );
      },
    );

    it(
      "returns only public checkout handoff data",
      () => {
        expect(
          checkout,
        ).toContain(
          "orderId:",
        );

        expect(
          checkout,
        ).toContain(
          "provider:",
        );

        expect(
          checkout,
        ).toContain(
          "url,",
        );

        expect(
          preview,
        ).not.toContain(
          "credentialsSecretRef",
        );

        expect(
          published,
        ).not.toContain(
          "credentialsSecretRef",
        );
      },
    );
  },
);
