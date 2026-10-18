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

function source(
  path: string,
) {
  return readFileSync(
    resolve(
      repo,
      path,
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild commerce workspace ownership",
  () => {
    it(
      "shows Site Settings for every project and gates commerce integrations by stack",
      () => {
        const shell =
          source(
            "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
          );

        expect(
          shell,
        ).toContain(
          'props.project.stackId ===',
        );

        expect(
          shell,
        ).toContain(
          '"commerce-static-v1"',
        );

        expect(
          shell,
        ).toContain(
          "<SiteSettingsWorkspacePanel",
        );

        expect(
          shell,
        ).toContain(
          "Site Settings",
        );
      },
    );

    it(
      "keeps a validated Shopify hostname pending rather than claiming connection success",
      () => {
        const shell =
          source(
            "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
          );

        expect(
          shell,
        ).toContain(
          "setCommerceCandidate",
        );

        expect(
          shell,
        ).toContain(
          "No store connection has been created yet.",
        );

        expect(
          shell,
        ).not.toContain(
          "Import complete",
        );
      },
    );

    it(
      "keeps merchant status honest and exposes no secret or payment-card form",
      () => {
        const panel =
          source(
            "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx",
          );

        expect(
          panel,
        ).toContain(
          "Zoé Store",
        );

        expect(
          panel,
        ).toContain(
          "Choose a payment provider",
        );

        expect(
          panel,
        ).toContain(
          "Test + Live separated",
        );

        expect(
          panel,
        ).toContain(
          "Stripe",
        );

        expect(
          panel,
        ).toContain(
          "Shopify",
        );

        expect(
          panel,
        ).toContain(
          "Square",
        );

        expect(
          panel,
        ).toContain(
          "PayPal",
        );

        expect(
          panel,
        ).not.toMatch(
          /type=["']password["']/,
        );

        expect(
          panel,
        ).not.toMatch(
          /cardNumber|cvv|secretKey|accessToken/,
        );
      },
    );

    it(
      "does not add the Commerce control to the generic landing experience",
      () => {
        const landing =
          source(
            "apps/zoebuild/src/components/builder/ZoeBuildLanding.tsx",
          );

        expect(
          landing,
        ).not.toContain(
          "CommerceWorkspacePanel",
        );
      },
    );
  },
);
