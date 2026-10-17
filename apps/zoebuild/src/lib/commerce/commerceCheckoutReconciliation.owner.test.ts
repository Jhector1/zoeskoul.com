import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

function read(
  path: string,
) {
  return readFileSync(
    path,
    "utf8",
  );
}

describe(
  "ZoeBuild provider-neutral stale commerce reconciliation ownership",
  () => {
    const generic =
      read(
        "src/lib/commerce/commerceCheckoutReconciliation.ts",
      );

    const stripe =
      read(
        "src/lib/commerce/stripeCommerceReconciliation.ts",
      );

    const webhook =
      read(
        "src/lib/commerce/stripeCommerceWebhook.ts",
      );

    it(
      "keeps Stripe SDK and Stripe session semantics out of the generic reconciler",
      () => {
        expect(
          generic,
        ).not.toContain(
          'from "stripe"',
        );

        expect(
          generic,
        ).not.toContain(
          "cs_test_",
        );

        expect(
          generic,
        ).not.toContain(
          "checkout.sessions",
        );

        expect(
          generic,
        ).toContain(
          "CommerceCheckoutReconciliationExecutor",
        );
      },
    );

    it(
      "makes the Stripe adapter own remote inspect and provider expiration",
      () => {
        expect(
          stripe,
        ).toContain(
          ".retrieve(",
        );

        expect(
          stripe,
        ).toContain(
          ".expire(",
        );

        expect(
          stripe,
        ).toContain(
          "inferEnvironmentFromProviderRef",
        );

        expect(
          stripe,
        ).toContain(
          "assertTrustedRemoteSession",
        );
      },
    );

    it(
      "reuses the exact webhook lifecycle for sweeper-paid and sweeper-expired outcomes",
      () => {
        expect(
          webhook,
        ).toContain(
          "export async function reconcileStripeCommercePaidSession",
        );

        expect(
          webhook,
        ).toContain(
          "export async function reconcileStripeCommerceExpiredSession",
        );

        expect(
          stripe,
        ).toContain(
          "reconcileStripeCommercePaidSession",
        );

        expect(
          stripe,
        ).toContain(
          "reconcileStripeCommerceExpiredSession",
        );
      },
    );
  },
);
