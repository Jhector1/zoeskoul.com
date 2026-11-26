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
          '"tanstack-start-v1"',
        );
        const panel = source(
          "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx",
        );
        expect(panel).toContain('props.project.stackId !==');
        expect(panel).toContain('"tanstack-start-v1"');
        expect(panel).not.toContain('"react-vite-v1"');

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
      "opens provider settings without creating a connection or claiming success",
      () => {
        const shell = source(
          "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
        );
        const start = shell.indexOf('if (semantic.action === "provider_settings")');
        const end = shell.indexOf('if (semantic.action === "edit")', start + 1);
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeGreaterThan(start);
        const navigation = shell.slice(start, end);
        expect(navigation).toContain("resolveZoeSelectedProvider(semantic.provider)");
        expect(navigation).toContain("setAssistantSettingsSection(known.section)");
        expect(navigation).toContain('kind:"settings-opened"');
        expect(navigation).toContain("No connection was changed.");
        expect(navigation).toContain("setSettingsOpen(true)");
        expect(navigation).not.toMatch(/\bfetch\s*\(|method\s*:/);
        expect(shell).not.toContain("Import complete");

        const commerce = source(
          "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/CommerceWorkspacePanel.tsx",
        );
        expect(commerce).toContain('item.provider === "shopify" && item.status === "active"');
        expect(commerce).toContain("shopifyOAuthConfigured === true");
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
