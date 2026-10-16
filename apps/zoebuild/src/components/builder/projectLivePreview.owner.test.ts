import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const projectShell =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const workspaceClient =
  readFileSync(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/BuildWorkspaceClient.tsx",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "ZoeBuild live project preview",
  () => {
    it(
      "renders Preview with canonical shared WebPreview",
      () => {
        expect(
          projectShell,
        ).toContain(
          'import WebPreview from "@zoeskoul/learner-workspace/runner/components/WebPreview";',
        );

        expect(
          projectShell,
        ).toContain(
          'import { exportWorkspaceEntries } from "@zoeskoul/learner-workspace/ide/fsTree";',
        );

        expect(
          projectShell,
        ).toContain(
          "exportWorkspaceEntries(previewWorkspace.nodes)",
        );

        expect(
          projectShell,
        ).toContain(
          "<WebPreview",
        );

        expect(
          projectShell,
        ).not.toContain(
          '<div className="zb-stage-quiet">',
        );
      },
    );

    it(
      "keeps FullIDE mounted while Explorer and editor are visible only in Code",
      () => {
        expect(
          projectShell,
        ).toContain(
          'hidden={commerceOpen || mode !== "code"}',
        );

        expect(
          projectShell,
        ).toContain(
          "onWorkspaceSnapshot={setPreviewWorkspace}",
        );

        expect(
          workspaceClient,
        ).toContain(
          "onWorkspaceSnapshot?.(workspace);",
        );
      },
    );

    it(
      "starts Code preview on the right and preserves user docking",
      () => {
        expect(
          workspaceClient,
        ).toContain(
          'initialTerminalDock: "right"',
        );

        expect(
          workspaceClient,
        ).toContain(
          "showTerminalDockToggle: true",
        );
      },
    );
  },
);
