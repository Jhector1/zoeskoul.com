import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const lifecycle =
  readFileSync(
    new URL(
      "./commerceProviderConnectionLifecycle.ts",
      import.meta.url,
    ),
    "utf8",
  );

const stripe =
  readFileSync(
    new URL(
      "./stripeCommerceConnection.ts",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "commerce provider connection lifecycle ownership",
  () => {
    it(
      "owns generic vault rotation and persisted connection lifecycle",
      () => {
        expect(
          lifecycle,
        ).toContain(
          "activateCommerceProviderCredentialConnection",
        );
        expect(
          lifecycle,
        ).toContain(
          "disconnectCommerceProviderEnvironment",
        );
        expect(
          lifecycle,
        ).toContain(
          ".commerceProviderConnection",
        );
        expect(
          lifecycle,
        ).toContain(
          ".upsert({",
        );
        expect(
          lifecycle,
        ).toContain(
          ".update({",
        );
        expect(
          lifecycle,
        ).toContain(
          ".put({",
        );
        expect(
          lifecycle,
        ).toContain(
          ".delete({",
        );
      },
    );

    it(
      "stays provider-neutral",
      () => {
        for (
          const forbidden of [
            'from "stripe"',
            '"stripe"',
            '"shopify"',
            '"square"',
            '"paypal"',
          ]
        ) {
          expect(
            lifecycle.toLowerCase(),
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "keeps Stripe-specific credential validation and probing in the Stripe adapter service",
      () => {
        expect(
          stripe,
        ).toContain(
          "normalizedApiKey",
        );
        expect(
          stripe,
        ).toContain(
          "verifyCheckoutAccess",
        );
        expect(
          stripe,
        ).toContain(
          "StripeConnectionProbeFactory",
        );
        expect(
          stripe,
        ).toContain(
          "activateCommerceProviderCredentialConnection",
        );
      },
    );

    it(
      "removes direct connection persistence and vault rotation from Stripe",
      () => {
        expect(
          stripe,
        ).not.toContain(
          ".commerceProviderConnection",
        );
        expect(
          stripe,
        ).not.toContain(
          ".put({",
        );
        expect(
          stripe,
        ).not.toContain(
          ".delete({",
        );
      },
    );
  },
);
