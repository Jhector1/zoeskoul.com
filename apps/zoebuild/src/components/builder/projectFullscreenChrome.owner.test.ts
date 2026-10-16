import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const header =
  readFileSync(
    new URL(
      "../chrome/ZoeBuildHeader.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const shell =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const css =
  readFileSync(
    new URL(
      "../../app/globals.css",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "ZoeBuild fullscreen project editor",
  () => {
    it(
      "suppresses global chrome on project-detail routes",
      () => {
        expect(
          header,
        ).toContain(
          "const isProjectEditor",
        );

        expect(
          header,
        ).toContain(
          "if (isProjectEditor)",
        );

        expect(
          header,
        ).toContain(
          "return null",
        );

        /*
         * Header remains canonical for non-editor pages.
         */
        expect(
          header,
        ).toContain(
          "HeaderChrome",
        );

        expect(
          header,
        ).toContain(
          "ThemeToggle",
        );

        expect(
          header,
        ).toContain(
          "UserMenuChrome",
        );
      },
    );

    it(
      "moves the essential Projects escape hatch into the Zoé rail",
      () => {
        expect(
          shell,
        ).toContain(
          "zb-project-rail-projects",
        );

        expect(
          shell,
        ).toContain(
          'href=".."',
        );

        expect(
          shell,
        ).toContain(
          'aria-label="Back to projects"',
        );
      },
    );

    it(
      "uses the full viewport for project editing",
      () => {
        expect(
          css,
        ).toContain(
          "ZOEBUILD_FULLSCREEN_PROJECT_EDITOR_V301E7",
        );

        expect(
          css,
        ).toMatch(
          /\.zb-project-frame\s*\{[\s\S]*?height:\s*100dvh;[\s\S]*?min-height:\s*0;/,
        );
      },
    );
  },
);
