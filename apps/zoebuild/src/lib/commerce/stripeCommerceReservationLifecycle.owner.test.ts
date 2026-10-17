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
  "ZoeBuild checkout reservation ownership",
  () => {
    it(
      "stores order-owned inventory reservations and trusted expiry",
      () => {
        const schema =
          source(
            "packages/db/prisma/schema.prisma",
          );

        for (
          const marker of [
            "model CommerceInventoryReservation",
            "CommerceInventoryReservationStatus",
            "paymentEnvironment",
            "checkoutExpiresAt",
          ]
        ) {
          expect(
            schema,
          ).toContain(
            marker,
          );
        }
      },
    );

    it(
      "reserves in native commerce and keeps Stripe provider-only",
      () => {
        const native =
          source(
            "apps/zoebuild/src/lib/commerce/nativeCommerceCheckout.ts",
          );

        const stripe =
          source(
            "apps/zoebuild/src/lib/commerce/stripeCommerceCheckout.ts",
          );

        expect(
          native,
        ).toContain(
          ".commerceInventoryReservation",
        );
        expect(
          native,
        ).toContain(
          "reservedQuantity: {",
        );
        expect(
          stripe,
        ).toContain(
          "expires_at:",
        );
        expect(
          stripe,
        ).not.toContain(
          "commerceInventoryItem",
        );
      },
    );

    it(
      "uses signed webhook state to commit or release reservations",
      () => {
        const webhook =
          source(
            "apps/zoebuild/src/lib/commerce/stripeCommerceWebhook.ts",
          );

        for (
          const marker of [
            '"checkout.session.expired"',
            "inventoryReservations",
            "commerceInventoryReservation",
            '"committed"',
            '"released"',
            "STRIPE_WEBHOOK_EXPIRY_MISMATCH",
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
  },
);
