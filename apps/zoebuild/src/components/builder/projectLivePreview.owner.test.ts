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
      "renders the canonical isolated TanStack preview, not static HTML",
      () => {
        expect(projectShell).toContain('props.project.stackId === "tanstack-start-v1"');
        expect(projectShell).toContain("<PersistentReactPreviewSlot");
        expect(projectShell).toContain("preview={fullStackPreview}");
        expect(projectShell).toContain("remoteWebPreview={fullStackPreview}");
        expect(projectShell).not.toContain("<WebPreview");
        expect(projectShell).not.toContain("exportWorkspaceEntries");
      },
    );

    it(
      "keeps FullIDE mounted while Explorer and editor are visible only in Code",
      () => {
        expect(
          projectShell,
        ).toContain(
          'hidden={settingsOpen || mode !== "code"}',
        );

        expect(
          projectShell,
        ).toContain(
          "onWorkspaceSnapshot={(workspace) => {",
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
