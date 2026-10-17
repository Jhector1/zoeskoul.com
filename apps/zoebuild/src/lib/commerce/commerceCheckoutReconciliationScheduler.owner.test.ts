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

const repoRoot =
  resolve(
    process.cwd(),
    "../..",
  );

function source(
  path: string,
) {
  return readFileSync(
    resolve(
      repoRoot,
      path,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild commerce reconciliation scheduler ownership",
  () => {
    it(
      "keeps the protected recurring production trigger outside the ZoeBuild request lifecycle",
      () => {
        const workflow =
          source(
            ".github/workflows/zoebuild-commerce-reconciliation.yml",
          );

        expect(
          workflow,
        ).toContain(
          'cron: "11,26,41,56 * * * *"',
        );

        expect(
          workflow,
        ).toContain(
          "workflow_dispatch:",
        );

        expect(
          workflow,
        ).toContain(
          "https://build.zoeskoul.com/api/internal/commerce/reconciliation/tick",
        );

        expect(
          workflow,
        ).toContain(
          "secrets.ZOEBUILD_COMMERCE_SCHEDULER_SECRET",
        );

        expect(
          workflow,
        ).toContain(
          'Authorization: Bearer ${SCHEDULER_SECRET}',
        );

        expect(
          workflow,
        ).toContain(
          "--retry 3",
        );

        expect(
          workflow,
        ).not.toMatch(
          /Authorization:\s*Bearer\s+[A-Za-z0-9_-]{16,}/,
        );
      },
    );

    it(
      "keeps the internal tick secret-authenticated and delegates to provider-neutral reconciliation",
      () => {
        const route =
          source(
            "apps/zoebuild/src/app/api/internal/commerce/reconciliation/tick/route.ts",
          );

        expect(
          route,
        ).toContain(
          "ZOEBUILD_COMMERCE_SCHEDULER_SECRET",
        );

        expect(
          route,
        ).toContain(
          "timingSafeEqual",
        );

        expect(
          route,
        ).toContain(
          "sweepStaleCommerceCheckouts",
        );

        expect(
          route,
        ).toContain(
          "expireOpen:",
        );

        expect(
          route,
        ).not.toContain(
          "loadCurrentBuildAccessSnapshot",
        );

        expect(
          route,
        ).not.toContain(
          "sameOrigin(",
        );
      },
    );

    it(
      "keeps global enumeration provider-neutral and leaves staleness policy with the project reconciler",
      () => {
        const sweep =
          source(
            "apps/zoebuild/src/lib/commerce/commerceCheckoutReconciliationSweep.ts",
          );

        expect(
          sweep,
        ).toContain(
          "commerceStore.findMany",
        );

        expect(
          sweep,
        ).toContain(
          "reconcileStaleCommerceCheckouts",
        );

        expect(
          sweep,
        ).toContain(
          'status: "pending"',
        );

        expect(
          sweep,
        ).toContain(
          "paymentProvider: {",
        );

        expect(
          sweep,
        ).not.toContain(
          "stripeCommerce",
        );

        expect(
          sweep,
        ).not.toContain(
          "checkoutExpiresAt",
        );
      },
    );
  },
);
