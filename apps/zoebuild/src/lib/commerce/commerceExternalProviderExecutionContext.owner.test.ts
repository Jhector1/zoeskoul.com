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

const registry =
  readFileSync(
    resolve(
      repo,
      "apps/zoebuild/src/lib/commerce/commerceRuntimeRegistry.ts",
    ),
    "utf8",
  );

const runtime =
  readFileSync(
    resolve(
      repo,
      "apps/zoebuild/src/lib/commerce/commerceRuntime.ts",
    ),
    "utf8",
  );

describe(
  "external commerce provider execution context ownership",
  () => {
    it(
      "gives catalog, cart, checkout, and payments one trusted server execution context",
      () => {
        expect(
          registry,
        ).toContain(
          "export type CommerceProviderExecutionContext",
        );

        expect(
          registry.match(
            /context:\s*\n\s*CommerceProviderExecutionContext/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          4,
        );

        expect(
          registry.match(
            /requiresSecretStore:/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          4,
        );
      },
    );

    it(
      "keeps native catalog, cart, and checkout secret-free",
      () => {
        expect(
          registry.match(
            /requiresSecretStore:\s*\n\s*false/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          3,
        );
      },
    );

    it(
      "centralizes optional secret-store creation at the runtime boundary",
      () => {
        expect(
          runtime,
        ).toContain(
          "function createCommerceProviderExecutionContext(",
        );

        expect(
          runtime,
        ).toContain(
          "handler.requiresSecretStore",
        );

        expect(
          runtime.match(
            /createCommerceProviderExecutionContext\(/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          7,
        );
      },
    );

    it(
      "passes resolved context to catalog, cart, and checkout handlers",
      () => {
        for (
          const marker of [
            "handler.listProducts(\n    client,\n    input,\n    context,",
            "handler.getProduct(\n    client,\n    input,\n    context,",
            "handler.executeCommand(\n    client,\n    input,\n    context,",
            "handler.beginCheckout(\n    client,\n    input,\n    context,",
          ]
        ) {
          expect(
            runtime,
          ).toContain(
            marker.replace(
              /\\n/g,
              "\n",
            ),
          );
        }
      },
    );

    it(
      "does not register Shopify before its adapter exists",
      () => {
        expect(
          registry.toLowerCase(),
        ).not.toContain(
          '"shopify"',
        );
      },
    );
  },
);
