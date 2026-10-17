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
      "requires separate active test and live connections for external providers",
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
      "updates capability ownership for both environments atomically",
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
