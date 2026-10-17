import {
  readFileSync,
} from "node:fs";
import {
  fileURLToPath,
} from "node:url";
import {
  describe,
  expect,
  it,
} from "vitest";

function source(
  relative:
    string,
) {
  return readFileSync(
    fileURLToPath(
      new URL(
        relative,
        import.meta.url,
      ),
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild Native Commerce cart rate limiting",
  () => {
    it(
      "keys anonymous cart traffic by trusted project scope and hashed client identity",
      () => {
        const limiter =
          source(
            "./nativeCommerceCartRateLimit.ts",
          );

        expect(
          limiter,
        ).toContain(
          "getClientIp(",
        );

        expect(
          limiter,
        ).toContain(
          '"sha256"',
        );

        expect(
          limiter,
        ).toContain(
          "zoebuild-commerce-cart:${projectId}:${scope}:${clientIdentity}",
        );

        expect(
          limiter,
        ).toContain(
          '"zoebuild-commerce-cart"',
        );

        expect(
          limiter,
        ).toContain(
          "120",
        );

        expect(
          limiter,
        ).toContain(
          '"1 m"',
        );
      },
    );

    it(
      "fails closed when the shared limiter is unavailable",
      () => {
        const limiter =
          source(
            "./nativeCommerceCartRateLimit.ts",
          );

        expect(
          limiter,
        ).toContain(
          '"unavailable"',
        );

        expect(
          limiter,
        ).toContain(
          "return null;",
        );
      },
    );

    it(
      "runs preview limiting only after capability-derived project authority",
      () => {
        const route =
          source(
            "../../app/api/build/projects/[buildProjectId]/preview/[previewId]/content/[capability]/[[...path]]/route.ts",
          );

        const post =
          route.indexOf(
            "export async function POST(",
          );

        const capability =
          route.indexOf(
            "resolveTrustedReactPreviewCapabilityAtRunner",
            post,
          );

        const comparison =
          route.indexOf(
            "context.buildProjectId !==",
            capability,
          );

        const limiter =
          route.indexOf(
            "enforceNativeCommerceCartRateLimit",
            comparison,
          );

        const execution =
          route.indexOf(
            "executeCommerceCartCommand",
            limiter,
          );

        expect(capability).toBeGreaterThan(post);
        expect(comparison).toBeGreaterThan(capability);
        expect(limiter).toBeGreaterThan(comparison);
        expect(execution).toBeGreaterThan(limiter);
      },
    );

    it(
      "runs published limiting only after origin and ready-deployment authority",
      () => {
        const route =
          source(
            "../../app/sites/[buildProjectId]/[[...path]]/route.ts",
          );

        const post =
          route.indexOf(
            "export async function POST(",
          );

        const origin =
          route.indexOf(
            "isPublishedSiteOriginRequest",
            post,
          );

        const deployment =
          route.indexOf(
            ".buildDeployment",
            origin,
          );

        const ready =
          route.indexOf(
            '"ready"',
            deployment,
          );

        const limiter =
          route.indexOf(
            "enforceNativeCommerceCartRateLimit",
            ready,
          );

        const execution =
          route.indexOf(
            "executeCommerceCartCommand",
            limiter,
          );

        expect(origin).toBeGreaterThan(post);
        expect(deployment).toBeGreaterThan(origin);
        expect(ready).toBeGreaterThan(deployment);
        expect(limiter).toBeGreaterThan(ready);
        expect(execution).toBeGreaterThan(limiter);
      },
    );
  },
);
