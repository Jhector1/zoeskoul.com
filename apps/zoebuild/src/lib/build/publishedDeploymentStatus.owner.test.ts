import {
  fileURLToPath,
} from "node:url";

import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const helperPath =
  fileURLToPath(
    new URL(
      "./publishedDeploymentStatus.ts",
      import.meta.url,
    ),
  );

const pagePath =
  fileURLToPath(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/page.tsx",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild persisted publish-status reopen hydration",
  () => {
    it(
      "reads only the latest owner-scoped ready production deployment",
      () => {
        const source =
          readFileSync(
            helperPath,
            "utf8",
          );

        expect(source).toContain(
          ".buildDeployment",
        );

        expect(source).toContain(
          '"ready"',
        );

        expect(source).toContain(
          "ownerId,",
        );

        expect(source).toContain(
          '"production"',
        );

        expect(source).toContain(
          '"desc"',
        );

        expect(source).not.toContain(
          ".create(",
        );

        expect(source).not.toContain(
          ".update(",
        );

        expect(source).not.toContain(
          "executeTrustedProductionBuildAtRunner",
        );

        expect(source).not.toMatch(
          /(?:gemini|openai|anthropic|claude)/i,
        );
      },
    );

    it(
      "hydrates the project page without republishing on reopen",
      () => {
        const page =
          readFileSync(
            pagePath,
            "utf8",
          );

        expect(page).toContain(
          "readLatestOwnedPublishedDeployment",
        );

        expect(page).toContain(
          "initialDeployment={initialDeployment}",
        );

        expect(page).not.toContain(
          'method: "POST"',
        );
      },
    );
  },
);
