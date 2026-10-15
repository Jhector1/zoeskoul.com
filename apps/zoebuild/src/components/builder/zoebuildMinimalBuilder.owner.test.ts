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
  resolve(__dirname, "../../../../..");

function source(path: string) {
  return readFileSync(
    resolve(repo, path),
    "utf8",
  );
}

describe(
  "ZoeBuild minimal builder experience",
  () => {
    it(
      "keeps home to prompt plus Preview Code AI",
      () => {
        const landing = source(
          "apps/zoebuild/src/components/builder/ZoeBuildLanding.tsx",
        );
        const tabs = source(
          "apps/zoebuild/src/components/builder/ZoeBuildModeTabs.tsx",
        );
        const composer = source(
          "apps/zoebuild/src/components/builder/ZoeBuildPromptComposer.tsx",
        );

        expect(tabs).toContain(
          '{ id: "preview", label: "Preview" }',
        );
        expect(tabs).toContain(
          '{ id: "code", label: "Code" }',
        );
        expect(tabs).toContain(
          '{ id: "ai", label: "AI" }',
        );
        expect(composer).toContain("<textarea");
        expect(composer).toContain(
          "Import Shopify",
        );
        expect(landing).not.toContain(
          "AI website builder",
        );
        expect(landing).not.toContain(
          "Describe it",
        );
        expect(landing).not.toContain(
          "Publish it",
        );
      },
    );

    it(
      "reuses builder controls on project workspace",
      () => {
        const shell = source(
          "apps/zoebuild/src/app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
        );

        expect(shell).toContain(
          "<ZoeBuildModeTabs",
        );
        expect(shell).toContain(
          "<ZoeBuildPromptComposer",
        );
        expect(shell).toContain(
          "<BuildWorkspaceClient",
        );
      },
    );

    it(
      "keeps Shopify import as a validated seam without fake success",
      () => {
        const importer = source(
          "apps/zoebuild/src/lib/import/shopify.ts",
        );
        const landing = source(
          "apps/zoebuild/src/components/builder/ZoeBuildLanding.tsx",
        );

        expect(importer).toContain(
          "parseShopifyStoreUrl",
        );
        expect(importer).toContain(
          'parseShopifyStoreIdentity',
        );
        expect(importer).toContain(
          'from "@zoeskoul/build-imports"',
        );
        expect(landing).toContain(
          "Connect Shopify to continue.",
        );
        expect(landing).not.toContain(
          "Import complete",
        );
      },
    );

    it(
      "renders only one locale switcher",
      () => {
        const header = source(
          "apps/zoebuild/src/components/chrome/ZoeBuildHeader.tsx",
        );

        expect(
          header.match(
            /<ZoeBuildLocaleSwitcher compact \/>/g,
          )?.length,
        ).toBe(1);
        expect(header).not.toContain(
          "centerSlot=",
        );
        expect(header).not.toContain(
          "mobileMenu=",
        );
      },
    );
  },
);
