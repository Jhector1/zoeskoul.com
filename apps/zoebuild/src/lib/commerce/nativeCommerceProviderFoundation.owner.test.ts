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

import {
  COMMERCE_PROVIDER_CAPABILITIES,
  resolveCommerceProviderEnvironment,
} from "./nativeCommerceProvider";

const repo =
  resolve(
    fileURLToPath(
      new URL(
        "../../../../../",
        import.meta.url,
      ),
    ),
  );

function read(
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
  "ZoeBuild provider-neutral commerce foundation",
  () => {
    it(
      "routes preview to test and published to live without browser choice",
      () => {
        expect(
          resolveCommerceProviderEnvironment(
            "preview",
          ),
        ).toBe(
          "test",
        );

        expect(
          resolveCommerceProviderEnvironment(
            "published",
          ),
        ).toBe(
          "live",
        );
      },
    );

    it(
      "defines ownership for every commerce capability",
      () => {
        expect(
          COMMERCE_PROVIDER_CAPABILITIES,
        ).toEqual([
          "catalog",
          "inventory",
          "cart",
          "orders",
          "checkout",
          "payments",
        ]);
      },
    );

    it(
      "stores generic provider connections and capability routes",
      () => {
        const schema =
          read(
            "packages/db/prisma/schema.prisma",
          );

        expect(
          schema,
        ).toContain(
          "model CommerceProviderConnection",
        );

        expect(
          schema,
        ).toContain(
          "model CommerceProviderRoute",
        );

        expect(
          schema,
        ).toContain(
          "@@unique([storeId, provider, environment])",
        );

        expect(
          schema,
        ).toContain(
          "@@unique([storeId, environment, capability])",
        );

        expect(
          schema,
        ).toContain(
          "credentialsSecretRef",
        );

        expect(
          schema,
        ).toContain(
          "webhookSecretRef",
        );
      },
    );

    it(
      "names the built-in default Zoé Store without making it a payment processor",
      () => {
        const contract =
          read(
            "apps/zoebuild/src/lib/commerce/nativeCommerceProvider.ts",
          );

        expect(
          contract,
        ).toContain(
          "ZOEBUILD_NATIVE_COMMERCE_DISPLAY_NAME",
        );

        expect(
          contract,
        ).toContain(
          '"Zoé Store"',
        );

        expect(
          contract,
        ).toContain(
          "defaultZoeStoreCommerceProviderRoutes",
        );

        const defaultCapabilities =
          contract.match(
            /export const ZOEBUILD_NATIVE_DEFAULT_CAPABILITIES\s*=\s*\[([\s\S]*?)\]\s*as const satisfies readonly CommerceProviderCapability\[\];/,
          )?.[1] ?? "";

        expect(
          defaultCapabilities,
        ).not.toContain(
          '"payments"',
        );
      },
    );

    it(
      "keeps the provider contract vendor-neutral",
      () => {
        const contract =
          read(
            "apps/zoebuild/src/lib/commerce/nativeCommerceProvider.ts",
          );

        for (
          const vendor of [
            "stripe",
            "square",
            "shopify",
            "paypal",
            "adyen",
          ]
        ) {
          expect(
            contract.toLowerCase(),
          ).not.toContain(
            vendor,
          );
        }
      },
    );

    it(
      "keeps generated storefront code behind the neutral facade",
      () => {
        const template =
          read(
            "packages/build-template-registry/src/index.ts",
          );

        expect(
          template,
        ).toContain(
          "globalThis.__ZOEBUILD_COMMERCE__",
        );

        expect(
          template,
        ).toContain(
          "commerce.products.list",
        );

        expect(
          template,
        ).toContain(
          "commerce.cart.add",
        );

        expect(
          template,
        ).toContain(
          "commerce.checkout.begin",
        );
      },
    );

    it(
      "backfills existing native stores to explicit test/live capability ownership",
      () => {
        const migration =
          read(
            "packages/db/prisma/migrations/20261016194500_zoebuild_commerce_provider_foundation/migration.sql",
          );

        expect(
          migration,
        ).toContain(
          'CREATE TABLE "CommerceProviderConnection"',
        );

        expect(
          migration,
        ).toContain(
          'CREATE TABLE "CommerceProviderRoute"',
        );

        expect(
          migration,
        ).toContain(
          "'zoebuild-native'",
        );

        expect(
          migration,
        ).toContain(
          "'test'",
        );

        expect(
          migration,
        ).toContain(
          "'live'",
        );

        expect(
          migration,
        ).not.toContain(
          "'payments', 'zoebuild-native'",
        );
      },
    );
  },
);
