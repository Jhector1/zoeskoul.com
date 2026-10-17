import {
  readFileSync,
} from "node:fs";
import {
  describe,
  expect,
  it,
} from "vitest";

const contract =
  readFileSync(
    new URL(
      "./commerceProviderConnectionContract.ts",
      import.meta.url,
    ),
    "utf8",
  );

const registry =
  readFileSync(
    new URL(
      "./commerceRuntimeRegistry.ts",
      import.meta.url,
    ),
    "utf8",
  );

const runtime =
  readFileSync(
    new URL(
      "./commerceRuntime.ts",
      import.meta.url,
    ),
    "utf8",
  );

const resolver =
  readFileSync(
    new URL(
      "./commerceProviderResolver.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "commerce provider connection contract ownership",
  () => {
    it(
      "keeps adapter connection material server-only and reference-only",
      () => {
        expect(
          contract,
        ).toContain(
          'import "server-only"',
        );

        for (
          const field of [
            "credentialsSecretRef",
            "webhookSecretRef",
            "externalAccountRef",
          ]
        ) {
          expect(
            contract,
          ).toContain(
            field,
          );
        }

        for (
          const forbidden of [
            "secretKey:",
            "apiKey:",
            "accessToken:",
            "refreshToken:",
            "clientSecret:",
          ]
        ) {
          expect(
            contract,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "keeps provider and environment identity in trusted execution context",
      () => {
        expect(
          registry,
        ).toContain(
          "provider: string;",
        );
        expect(
          registry,
        ).toContain(
          "CommerceProviderEnvironment",
        );
        expect(
          registry,
        ).toContain(
          "CommerceProviderConnectionSnapshot",
        );
        expect(
          registry,
        ).toContain(
          "BuildSecretStore",
        );
      },
    );

    it(
      "rechecks provider environment executability at runtime",
      () => {
        expect(
          runtime,
        ).toContain(
          "requireCommerceProviderExecutionEnvironment",
        );

        expect(
          runtime.match(
            /\.supportsInEnvironment\(/g,
          )?.length,
        ).toBe(
          1,
        );

        expect(
          runtime.match(
            /requireCommerceProviderExecutionEnvironment\(/g,
          )?.length,
        ).toBeGreaterThanOrEqual(
          3,
        );
      },
    );

    it(
      "leaves connection lifecycle validation in the persistence resolver",
      () => {
        expect(
          resolver,
        ).toContain(
          "route.connection.status !==",
        );
        expect(
          resolver,
        ).toContain(
          '"active"',
        );
        expect(
          resolver,
        ).toContain(
          "route.connection.environment !==",
        );
        expect(
          resolver,
        ).toContain(
          "route.connection.provider !==",
        );
      },
    );

    it(
      "does not define the adapter snapshot inside the database resolver",
      () => {
        expect(
          resolver,
        ).not.toContain(
          "export type CommerceProviderConnectionSnapshot",
        );
        expect(
          resolver,
        ).toContain(
          'from "./commerceProviderConnectionContract"',
        );
      },
    );
  },
);
