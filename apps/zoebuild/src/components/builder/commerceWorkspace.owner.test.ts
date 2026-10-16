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
      "shows Commerce only for the registered commerce stack",
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
          '"commerce-storefront-v1"',
        );

        expect(
          shell,
        ).toContain(
          "<CommerceWorkspacePanel",
        );

        expect(
          shell,
        ).toContain(
          "Commerce",
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
          "Not connected",
        );

        expect(
          panel,
        ).toContain(
          "Provider-hosted",
        );

        expect(
          panel,
        ).toContain(
          "Not enabled",
        );

        expect(
          panel,
        ).toContain(
          "No fake order totals",
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
