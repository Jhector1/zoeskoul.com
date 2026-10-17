import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  name: string,
) {
  return readFileSync(
    new URL(
      name,
      import.meta.url,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild provider-neutral commerce runtime contracts",
  () => {
    const contracts = source(
      "./commerceRuntimeContracts.ts",
    );
    const registry = source(
      "./commerceRuntimeRegistry.ts",
    );
    const runtime = source(
      "./commerceRuntime.ts",
    );
    const catalog = source(
      "./nativeCommerceCatalog.ts",
    );
    const cart = source(
      "./nativeCommerceCart.ts",
    );
    const checkout = source(
      "./nativeCommerceCheckout.ts",
    );

    it(
      "owns runtime shapes outside native implementations",
      () => {
        expect(contracts).toContain(
          "export type CommerceCatalogProduct",
        );
        expect(contracts).toContain(
          "export type CommerceCartCommand",
        );
        expect(contracts).toContain(
          "export type CommerceCheckoutRequest",
        );
        expect(contracts).toContain(
          "export type TrustedCommerceOrderSnapshot",
        );
        expect(catalog).not.toContain(
          "export type NativeCommerceProduct",
        );
        expect(cart).not.toContain(
          "export type NativeCommerceCartCommand",
        );
        expect(checkout).not.toContain(
          "export type TrustedCommerceOrderSnapshot",
        );
      },
    );

    it(
      "does not derive generic handlers from native function types",
      () => {
        expect(registry).toContain(
          'from "./commerceRuntimeContracts"',
        );
        expect(runtime).toContain(
          'from "./commerceRuntimeContracts"',
        );
        expect(registry).not.toContain(
          "typeof listNativeCommerceProducts",
        );
        expect(registry).not.toContain(
          "typeof getNativeCommerceProduct",
        );
        expect(registry).not.toContain(
          "typeof executeNativeCommerceCartCommand",
        );
      },
    );

    it(
      "keeps provider and credential details outside the generic contract",
      () => {
        for (
          const forbidden of [
            "Stripe",
            "Shopify",
            "PayPal",
            "Square",
            "BuildSecretStore",
            "credentialsSecretRef",
            "webhookSecretRef",
          ]
        ) {
          expect(contracts).not.toContain(
            forbidden,
          );
        }
      },
    );
  },
);
