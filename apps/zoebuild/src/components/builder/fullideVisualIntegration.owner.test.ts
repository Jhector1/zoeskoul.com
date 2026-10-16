import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const css =
  readFileSync(
    new URL(
      "../../app/globals.css",
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

const shell =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "ZoeBuild canonical FullIDE visual integration",
  () => {
    it(
      "scans shared learner Tailwind sources",
      () => {
        expect(css).toContain(
          '@source "../../../../packages/learner-ui/src";',
        );

        expect(css).toContain(
          '@source "../../../../packages/learner-workspace/src";',
        );
      },
    );

    it(
      "lets canonical FullIDE fill the Code workspace",
      () => {
        expect(workspace).toContain(
          "<FullIDE",
        );

        expect(workspace).toContain(
          "fullHeight",
        );

        expect(workspace).toContain(
          'initialTerminalDock: "right"',
        );
      },
    );

    it(
      "does not expose duplicate FullIDE/project context chrome",
      () => {
        expect(workspace).toContain(
          "showHeader: false",
        );

        expect(workspace).toContain(
          "showStatus: false",
        );

        expect(shell).not.toContain(
          "zb-project-modebar-context",
        );

        expect(shell).not.toContain(
          '"Code workspace"',
        );
      },
    );
  },
);
