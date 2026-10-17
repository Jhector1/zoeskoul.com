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
  relative:
    string,
) {
  return readFileSync(
    resolve(
      repo,
      relative,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild Stripe commerce webhook ownership",
  () => {
    const route =
      source(
        "apps/zoebuild/src/app/api/build/projects/[buildProjectId]/commerce/providers/stripe/webhook/[environment]/route.ts",
      );

    const webhook =
      source(
        "apps/zoebuild/src/lib/commerce/stripeCommerceWebhook.ts",
      );

    const panel =
      source(
        "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/StripeConnectionPanel.tsx",
      );

    it(
      "verifies raw Stripe payloads with environment-scoped encrypted webhook secrets",
      () => {
        const post =
          route.indexOf(
            "export async function POST",
          );

        expect(post).toBeGreaterThan(-1);

        const postSource =
          route.slice(
            post,
          );

        expect(
          postSource,
        ).toContain(
          "await request.text()",
        );

        expect(
          postSource,
        ).toContain(
          '"stripe-signature"',
        );

        expect(
          postSource,
        ).toContain(
          ".constructEvent(",
        );

        expect(
          postSource,
        ).toContain(
          "readStripeCommerceWebhookSecrets",
        );

        expect(
          postSource,
        ).not.toContain(
          "loadCurrentBuildAccessSnapshot",
        );

        expect(
          postSource,
        ).not.toContain(
          "sameOrigin(",
        );
      },
    );

    it(
      "fails test/live mismatches closed and validates trusted Checkout order identity and totals",
      () => {
        for (
          const marker of [
            "STRIPE_WEBHOOK_EVENT_ENVIRONMENT_MISMATCH",
            "STRIPE_WEBHOOK_ENVIRONMENT_MISMATCH",
            "STRIPE_WEBHOOK_PROJECT_MISMATCH",
            "STRIPE_WEBHOOK_PROVIDER_REFERENCE_MISMATCH",
            "STRIPE_WEBHOOK_AMOUNT_MISMATCH",
            "STRIPE_WEBHOOK_CURRENCY_MISMATCH",
            "zoebuildOrderId",
            "zoebuildProjectId",
          ]
        ) {
          expect(
            webhook,
          ).toContain(
            marker,
          );
        }
      },
    );

    it(
      "uses the paid transition as the exactly-once inventory commit gate",
      () => {
        const paidTransition =
          webhook.indexOf(
            'paymentStatus: {\n                  in: [\n                    "pending"',
          );

        const inventory =
          webhook.indexOf(
            ".commerceInventoryItem",
            paidTransition,
          );

        expect(
          paidTransition,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          inventory,
        ).toBeGreaterThan(
          paidTransition,
        );

        expect(
          webhook,
        ).toContain(
          "inventoryReservations",
        );

        expect(
          webhook,
        ).toContain(
          'status:\n                      "reserved"',
        );

        expect(
          webhook,
        ).toContain(
          'decrement:\n                          reservation.quantity',
        );

        expect(
          webhook,
        ).toContain(
          'status:\n                      "committed"',
        );

        expect(
          webhook,
        ).toContain(
          '"already-processed"',
        );
      },
    );

    it(
      "keeps webhook secret setup authenticated and its response opaque",
      () => {
        const put =
          route.indexOf(
            "export async function PUT",
          );

        const post =
          route.indexOf(
            "export async function POST",
          );

        const putSource =
          route.slice(
            put,
            post,
          );

        expect(
          putSource,
        ).toContain(
          "sameOrigin(",
        );

        expect(
          putSource,
        ).toContain(
          "authorizeProject(",
        );

        expect(
          panel,
        ).toContain(
          "Save test webhook secret",
        );

        expect(
          panel,
        ).toContain(
          "Save live webhook secret",
        );

        expect(
          panel.match(
            /placeholder="whsec_…"/g,
          )?.length,
        ).toBe(
          2,
        );

        const responseStart =
          putSource.lastIndexOf(
            "return json({",
          );

        const responseSource =
          putSource.slice(
            responseStart,
          );

        expect(
          responseSource,
        ).not.toContain(
          "webhookSecretRef",
        );

        expect(
          responseSource,
        ).not.toContain(
          "secretRef",
        );

        expect(
          panel,
        ).not.toContain(
          "webhookSecretRef",
        );
      },
    );
  },
);
