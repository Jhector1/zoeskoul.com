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
  "ZoeBuild clean project workspace presentation",
  () => {
    it(
      "lets Preview consume the project stage without Code chrome",
      () => {
        expect(
          shell,
        ).toContain(
          'className="zb-project-preview-stage"',
        );

        expect(
          shell,
        ).toContain(
          'hidden={commerceOpen || mode !== "code"}',
        );

        expect(
          css,
        ).toContain(
          ".zb-project-stage-body .zb-builder-stage",
        );

        expect(
          css,
        ).toContain(
          ".zb-project-preview-stage",
        );
      },
    );

    it(
      "replaces bulky Code cards with a compact source-save strip",
      () => {
        expect(
          workspace,
        ).toContain(
          'className="zb-code-workspace"',
        );

        expect(
          workspace,
        ).toContain(
          'className="zb-code-savebar"',
        );

        expect(
          workspace,
        ).toContain(
          'className="zb-code-fullide"',
        );

        expect(
          workspace,
        ).not.toContain(
          'className="space-y-4"',
        );

        expect(
          workspace,
        ).not.toContain(
          "Source editing and versioned saves are enabled.",
        );
      },
    );

    it(
      "preserves canonical FullIDE source editing and preview docking",
      () => {
        expect(
          workspace,
        ).toContain(
          "<FullIDE",
        );

        expect(
          workspace,
        ).toContain(
          "saveSource",
        );

        expect(
          workspace,
        ).toContain(
          'initialTerminalDock: "right"',
        );

        expect(
          workspace,
        ).toContain(
          "showTerminalDockToggle: true",
        );
      },
    );
  },
);
