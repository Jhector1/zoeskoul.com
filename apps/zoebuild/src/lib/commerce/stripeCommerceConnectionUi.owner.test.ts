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
  "ZoeBuild Stripe connection UI ownership",
  () => {
    const panel =
      source(
        "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx",
      );

    const stripe =
      source(
        "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/StripeConnectionPanel.tsx",
      );

    it(
      "keeps Stripe connection inside the commerce workspace",
      () => {
        expect(
          panel,
        ).toContain(
          "StripeConnectionPanel",
        );

        expect(
          panel,
        ).toContain(
          "configurationRevision",
        );
      },
    );

    it(
      "uses ephemeral password inputs and no browser persistence",
      () => {
        expect(
          stripe.match(
            /type="password"/g,
          )?.length,
        ).toBe(
          4,
        );

        expect(
          stripe.match(
            /placeholder="whsec_…"/g,
          )?.length,
        ).toBe(
          2,
        );

        expect(
          stripe,
        ).toContain(
          "testWebhookSecret",
        );

        expect(
          stripe,
        ).toContain(
          "liveWebhookSecret",
        );

        for (
          const forbidden of [
            "localStorage",
            "sessionStorage",
            "indexedDB",
            "document.cookie",
          ]
        ) {
          expect(
            stripe,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );

    it(
      "never collects card data and activates only the payments capability",
      () => {
        expect(
          stripe,
        ).not.toMatch(
          /cardNumber|cvv|cvc|expiry|paymentMethod/,
        );

        expect(
          stripe,
        ).toContain(
          'capabilities: [\n                  "payments",\n                ]',
        );

        expect(
          stripe,
        ).toContain(
          "environment,",
        );

        expect(
          stripe,
        ).toContain(
          "Activate preview payments",
        );

        expect(
          stripe,
        ).toContain(
          "Activate live payments",
        );

        expect(
          stripe,
        ).toContain(
          "Zoé Store still owns checkout orchestration",
        );
      },
    );

    it(
      "uses separate test and live credential entry paths",
      () => {
        expect(
          stripe,
        ).toContain(
          "Test secret key",
        );

        expect(
          stripe,
        ).toContain(
          "Live secret key",
        );

        expect(
          stripe,
        ).toContain(
          'className="zb-stripe-panel"',
        );

        expect(
          stripe,
        ).toContain(
          'className="zb-stripe-environments"',
        );

        expect(
          stripe,
        ).toContain(
          'className="zb-stripe-status"',
        );

        expect(
          stripe,
        ).toContain(
          '"test"',
        );

        expect(
          stripe,
        ).toContain(
          '"live"',
        );
      },
    );
  },
);
