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
    __dirname,
    "../../../../..",
  );

const route =
  readFileSync(
    resolve(
      repo,
      "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/route.ts",
    ),
    "utf8",
  );

describe(
  "ZoeBuild commerce provider configuration route",
  () => {
    it(
      "uses Build ownership same-origin mutation protection and rate limiting",
      () => {
        expect(
          route,
        ).toContain(
          "authorizeProject",
        );
        expect(
          route,
        ).toContain(
          "enforceSameOriginPost",
        );
        expect(
          route,
        ).toContain(
          "rateLimit",
        );
      },
    );

    it(
      "requires an active explicit connection for every targeted environment without fallback",
      () => {
        expect(
          route,
        ).toContain(
          "COMMERCE_PROVIDER_ENVIRONMENTS",
        );
        expect(
          route,
        ).toContain(
          "commerceProviderConnection",
        );
        expect(
          route,
        ).toContain(
          "findMany",
        );
        expect(
          route,
        ).toMatch(
          /status:\s*"active"/,
        );
        expect(
          route,
        ).toContain(
          "connectionByEnvironment",
        );
        expect(
          route,
        ).toContain(
          "COMMERCE_PROVIDER_CONNECTION_REQUIRED",
        );
        expect(
          route,
        ).toContain(
          "Missing explicit",
        );
      },
    );

    it(
      "never serializes credential or webhook secret references",
      () => {
        const start =
          route.indexOf(
            "function publicStoreSnapshot",
          );
        const end =
          route.indexOf(
            "export async function GET",
          );

        expect(
          start,
        ).toBeGreaterThanOrEqual(
          0,
        );
        expect(
          end,
        ).toBeGreaterThan(
          start,
        );

        const publicSnapshot =
          route.slice(
            start,
            end,
          );

        expect(
          publicSnapshot,
        ).not.toContain(
          "credentialsSecretRef",
        );
        expect(
          publicSnapshot,
        ).not.toContain(
          "webhookSecretRef",
        );
      },
    );

    it(
      "keeps atomic both-environment routing when environment is omitted",
      () => {
        expect(
          route,
        ).toContain(
          "targetEnvironments",
        );
        expect(
          route,
        ).toContain(
          "...COMMERCE_PROVIDER_ENVIRONMENTS",
        );
        expect(
          route,
        ).toContain(
          "$transaction",
        );
      },
    );
  },
);
