import {
  existsSync,
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

const routePath =
  resolve(
    repo,
    "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/[provider]/connection/route.ts",
  );

const legacyStripeRoutePath =
  resolve(
    repo,
    "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/stripe/connection/route.ts",
  );

const route =
  readFileSync(
    routePath,
    "utf8",
  );

describe(
  "ZoeBuild generic commerce provider connection route ownership",
  () => {
    it(
      "owns one dynamic provider connection route without a Stripe compatibility route",
      () => {
        expect(
          existsSync(
            routePath,
          ),
        ).toBe(
          true,
        );

        expect(
          existsSync(
            legacyStripeRoutePath,
          ),
        ).toBe(
          false,
        );

        expect(
          route,
        ).toContain(
          "provider:",
        );

        expect(
          route,
        ).toContain(
          "getCommerceProviderConnectionAdapter",
        );
      },
    );

    it(
      "requires same-origin mutation, Build ownership, and generic provider rate limiting",
      () => {
        expect(
          route,
        ).toContain(
          "enforceSameOriginPost",
        );

        expect(
          route,
        ).toContain(
          "loadCurrentBuildAccessSnapshot",
        );

        expect(
          route,
        ).toContain(
          "getBuildProjectCommand",
        );

        expect(
          route,
        ).toContain(
          "rateLimit",
        );

        expect(
          route,
        ).toContain(
          "zoebuild-commerce-provider-connection",
        );
      },
    );

    it(
      "dispatches connect and disconnect through the registered adapter boundary",
      () => {
        expect(
          route,
        ).toContain(
          "adapter.connect",
        );

        expect(
          route,
        ).toContain(
          "adapter.disconnect",
        );

        expect(
          route,
        ).toContain(
          "supportsCommerceProviderConnectionEnvironment",
        );

        expect(
          route,
        ).toContain(
          "createBuildSecretStore",
        );
      },
    );

    it(
      "contains no provider-specific connection implementation",
      () => {
        expect(
          route,
        ).not.toContain(
          "connectStripeCommerceEnvironment",
        );

        expect(
          route,
        ).not.toContain(
          "StripeCommerceConnectionError",
        );

        expect(
          route.toLowerCase(),
        ).not.toContain(
          '"stripe"',
        );
      },
    );

    it(
      "never serializes raw credentials or secret references",
      () => {
        const responseStart =
          route.indexOf(
            "return json(\n      requestId,\n      {\n        ok:\n          true",
          );

        expect(
          responseStart,
        ).toBeGreaterThan(
          -1,
        );

        const response =
          route.slice(
            responseStart,
          );

        expect(
          response,
        ).not.toContain(
          "apiKey,",
        );

        expect(
          response,
        ).not.toContain(
          "credentialsSecretRef",
        );

        expect(
          response,
        ).not.toContain(
          "webhookSecretRef",
        );

        expect(
          response,
        ).not.toContain(
          "secretRef",
        );
      },
    );
  },
);
