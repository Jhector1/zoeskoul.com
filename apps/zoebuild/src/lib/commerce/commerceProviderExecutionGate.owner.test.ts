import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(
    process.cwd(),
    "../..",
  );

function source(
  relativePath: string,
) {
  return readFileSync(
    resolve(
      repo,
      relativePath,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild executable commerce capability gate",
  () => {
    const registry =
      source(
        "apps/zoebuild/src/lib/commerce/commerceRuntimeRegistry.ts",
      );

    const runtime =
      source(
        "apps/zoebuild/src/lib/commerce/commerceRuntime.ts",
      );

    const route =
      source(
        "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/route.ts",
      );

    it(
      "maps every persisted commerce capability into the runtime capability namespace",
      () => {
        for (
          const capability of [
            "catalog",
            "inventory",
            "cart",
            "orders",
            "checkout",
            "payments",
          ]
        ) {
          expect(
            registry,
          ).toContain(
            `${capability}: "commerce.${capability}"`,
          );
        }

        expect(
          runtime,
        ).toContain(
          '"commerce.inventory":',
        );
        expect(
          runtime,
        ).toContain(
          '"inventory"',
        );
      },
    );

    it(
      "keeps ZoeStore inventory ownership explicit in the runtime registry",
      () => {
        expect(
          registry,
        ).toContain(
          'capability: "commerce.inventory"',
        );
        expect(
          registry,
        ).toContain(
          '"commerce.inventory": {',
        );
      },
    );

    it(
      "exposes one reusable provider execution context for external adapters",
      () => {
        expect(
          registry,
        ).toContain(
          "export type CommerceProviderExecutionContext",
        );
        expect(
          registry,
        ).toContain(
          "CommerceProviderConnectionSnapshot",
        );
        expect(
          registry,
        ).toContain(
          "secretStore?",
        );
        expect(
          registry,
        ).not.toContain(
          "PaymentProviderContext",
        );
      },
    );

    it(
      "fails closed before connection lookup or route writes when the runtime adapter is unavailable",
      () => {
        const gate =
          route.indexOf(
            "!supportsCommerceProviderExecutionForEnvironments(",
          );
        const connectionLookup =
          route.indexOf(
            "const connections =",
          );
        const routeWrite =
          route.indexOf(
            ".commerceProviderRoute",
            gate,
          );

        expect(
          gate,
        ).toBeGreaterThanOrEqual(
          0,
        );
        expect(
          route,
        ).toContain(
          "COMMERCE_PROVIDER_EXECUTION_UNAVAILABLE",
        );
        expect(
          connectionLookup,
        ).toBeGreaterThan(
          gate,
        );
        expect(
          routeWrite,
        ).toBeGreaterThan(
          gate,
        );
      },
    );

    it(
      "publishes executable capability state separately from provider capability declarations",
      () => {
        expect(
          route,
        ).toContain(
          "executableCapabilities:",
        );
        expect(
          route,
        ).toContain(
          "supportsCommerceProviderExecutionForEnvironments(",
        );
        expect(
          route,
        ).toContain(
          "definition.capabilities",
        );
      },
    );
    it(
      "binds executable provider support to explicit test/live environments",
      () => {
        expect(
          registry,
        ).toContain(
          "export type CommerceProviderAdapterRegistration",
        );
        expect(
          registry,
        ).toContain(
          "registerCommerceProviderAdapter",
        );
        expect(
          registry,
        ).toContain(
          "ZOESTORE_COMMERCE_PROVIDER_MANIFEST",
        );
        expect(
          registry,
        ).toContain(
          "STRIPE_COMMERCE_PROVIDER_MANIFEST",
        );
        expect(
          registry,
        ).toContain(
          ".supportsInEnvironment(",
        );
        expect(
          registry,
        ).toContain(
          "supportsCommerceProviderExecutionForEnvironments",
        );
        expect(
          route,
        ).toContain(
          "definition.environments",
        );
        expect(
          route,
        ).toContain(
          "targetEnvironments",
        );
        expect(
          route,
        ).not.toContain(
          "supportsCommerceProviderExecution(",
        );
      },
    );

  },
);
