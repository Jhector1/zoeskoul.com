import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const shell =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const workspace =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx",
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
  "ZoeBuild compact project topbar",
  () => {
    it(
      "puts project title in the same bar as Preview and Code",
      () => {
        expect(
          shell,
        ).toContain(
          "zb-project-modebar-title",
        );

        expect(
          shell,
        ).toContain(
          "zb-project-mode-tabs",
        );

        expect(
          shell,
        ).not.toContain(
          'className="zb-project-title"',
        );
      },
    );

    it(
      "keeps source version with the live Code save owner",
      () => {
        expect(
          workspace,
        ).toContain(
          "Source v",
        );

        expect(
          workspace,
        ).toContain(
          "sourceVersion",
        );

        expect(
          workspace,
        ).toContain(
          "zb-code-savebar",
        );
      },
    );

    it(
      "centers mode controls independently from long project names",
      () => {
        expect(
          css,
        ).toContain(
          "ZOEBUILD_COMPACT_PROJECT_TOPBAR_V301E8",
        );

        expect(
          css,
        ).toContain(
          "grid-template-columns:",
        );

        expect(
          css,
        ).toContain(
          ".zb-project-modebar-title",
        );

        expect(
          css,
        ).toContain(
          "text-overflow: ellipsis",
        );
      },
    );
  },
);
