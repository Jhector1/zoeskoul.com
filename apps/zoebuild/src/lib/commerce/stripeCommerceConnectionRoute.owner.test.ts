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

const route =
  readFileSync(
    resolve(
      repo,
      "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/stripe/connection/route.ts",
    ),
    "utf8",
  );

describe(
  "ZoeBuild Stripe connection route ownership",
  () => {
    it(
      "requires same-origin mutation, Build ownership, and rate limiting",
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
      },
    );

    it(
      "hands credentials directly to the BuildSecret-backed connection service",
      () => {
        expect(
          route,
        ).toContain(
          "createBuildSecretStore",
        );

        expect(
          route,
        ).toContain(
          "connectStripeCommerceEnvironment",
        );
      },
    );

    it(
      "never serializes raw provider credentials or secret references",
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
          "secretRef",
        );
      },
    );
  },
);
