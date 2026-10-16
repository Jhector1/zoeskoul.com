import {
  readFileSync,
} from "node:fs";

import {
  fileURLToPath,
} from "node:url";

import {
  describe,
  expect,
  it,
} from "vitest";

const projectShellPath =
  fileURLToPath(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
  );

const landingPath =
  fileURLToPath(
    new URL(
      "./ZoeBuildLanding.tsx",
      import.meta.url,
    ),
  );

const tabsPath =
  fileURLToPath(
    new URL(
      "./ZoeBuildModeTabs.tsx",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild project mode ownership",
  () => {
    it(
      "keeps Preview Code AI on the landing builder",
      () => {
        const landing =
          readFileSync(
            landingPath,
            "utf8",
          );

        const tabs =
          readFileSync(
            tabsPath,
            "utf8",
          );

        expect(
          landing,
        ).toContain(
          "<ZoeBuildModeTabs",
        );

        expect(
          tabs,
        ).toContain(
          '{ id: "preview", label: "Preview" }',
        );

        expect(
          tabs,
        ).toContain(
          '{ id: "code", label: "Code" }',
        );

        expect(
          tabs,
        ).toContain(
          '{ id: "ai", label: "AI" }',
        );
      },
    );

    it(
      "uses only the Lovable Preview Code Commerce modebar inside a project",
      () => {
        const project =
          readFileSync(
            projectShellPath,
            "utf8",
          );

        expect(
          project,
        ).not.toContain(
          "<ZoeBuildModeTabs",
        );

        expect(
          project,
        ).not.toContain(
          'className="zb-project-modes"',
        );

        expect(
          project,
        ).toContain(
          'className="zb-project-mode-tabs"',
        );

        expect(
          project,
        ).toContain(
          "Preview",
        );

        expect(
          project,
        ).toContain(
          "Code",
        );

        expect(
          project,
        ).toContain(
          "Commerce",
        );
      },
    );

    it(
      "has no project AI mode because Zoé is persistently visible",
      () => {
        const project =
          readFileSync(
            projectShellPath,
            "utf8",
          );

        expect(
          project,
        ).not.toContain(
          'setMode("ai")',
        );

        expect(
          project,
        ).not.toContain(
          'mode === "ai"',
        );

        expect(
          project,
        ).not.toContain(
          'className="zb-ai-panel"',
        );

        expect(
          project,
        ).not.toContain(
          'className="zb-ai-apply-card"',
        );

        expect(
          project,
        ).toContain(
          'className="zb-project-assistant-rail"',
        );

        expect(
          project.match(
            /<ZoeBuildPromptComposer\b/g,
          ) ?? [],
        ).toHaveLength(1);
      },
    );
  },
);
