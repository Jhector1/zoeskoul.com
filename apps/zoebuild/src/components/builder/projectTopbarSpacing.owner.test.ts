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

describe(
  "ZoeBuild compact project spacing",
  () => {
    it(
      "keeps the project title in the compact modebar",
      () => {
        expect(shell).toContain(
          "zb-project-modebar-title",
        );

        expect(shell).toContain(
          "zb-project-mode-tabs",
        );
      },
    );

    it(
      "does not render an empty legacy builder toolbar in the project editor",
      () => {
        expect(shell).not.toMatch(
          /<div\s+className="zb-builder-toolbar"\s*>\s*<\/div>/,
        );
      },
    );

    it(
      "keeps the builder stage directly available for Preview and Code",
      () => {
        expect(shell).toContain(
          'className="zb-builder-shell"',
        );

        expect(shell).toContain(
          'className="zb-builder-stage"',
        );

        expect(shell).toContain(
          "<WebPreview",
        );

        expect(shell).toContain(
          "<BuildWorkspaceClient",
        );
      },
    );

    it(
      "preserves live source and save state in BuildWorkspaceClient",
      () => {
        expect(workspace).toContain(
          "Source v",
        );

        expect(workspace).toContain(
          "zb-code-savebar",
        );
      },
    );
  },
);
