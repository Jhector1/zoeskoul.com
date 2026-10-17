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
      "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/route.ts",
    ),
    "utf8",
  );

describe(
  "ZoeBuild commerce provider configuration route",
  () => {
    it(
      "uses Build ownership and same-origin mutation protection",
      () => {
        expect(route).toContain(
          "loadCurrentBuildAccessSnapshot",
        );
        expect(route).toContain(
          "getBuildProjectCommand",
        );
        expect(route).toContain(
          "enforceSameOriginPost",
        );
        expect(route).toContain(
          "rateLimit",
        );
      },
    );

    it(
      "requires an active connection for every targeted environment without fallback",
      () => {
        expect(route).toContain(
          "COMMERCE_PROVIDER_ENVIRONMENTS",
        );
        expect(route).toContain(
          'status:\n                "active"',
        );
        expect(route).toContain(
          "COMMERCE_PROVIDER_CONNECTION_REQUIRED",
        );
        expect(route).toContain(
          "targetEnvironments",
        );
        expect(route).toContain(
          "body?.environment",
        );
        expect(route).toContain(
          "COMMERCE_PROVIDER_ENVIRONMENT_INVALID",
        );
        expect(route).not.toContain(
          "fallback",
        );
      },
    );

    it(
      "never serializes provider secret references",
      () => {
        expect(route).not.toContain(
          "credentialsSecretRef",
        );
        expect(route).not.toContain(
          "webhookSecretRef",
        );
        expect(route).not.toContain(
          "accessToken",
        );
      },
    );

    it(
      "keeps the original atomic both-environment mode when no environment is supplied",
      () => {
        expect(route).toContain(
          ".$transaction",
        );
        expect(route).toContain(
          ".commerceProviderRoute",
        );
        expect(route).toContain(
          ".upsert",
        );
        expect(route).toContain(
          "storeId_environment_capability",
        );
      },
    );
  },
);
