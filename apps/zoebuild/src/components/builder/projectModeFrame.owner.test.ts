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

describe(
  "ZoeBuild project mode ownership",
  () => {
    it("uses a centered prompt instead of placeholder landing tabs", () => {
      const landing = readFileSync(landingPath, "utf8");
      expect(landing).not.toContain("<ZoeBuildModeTabs");
      expect(landing).not.toContain("zb-stage-quiet");
      expect(landing).toContain('variant="home"');
      expect(landing).toContain("onPrompt={prompt}");
      expect(landing).toContain("requestZoeBuildPlan(submission)");
      expect(landing).toContain('aria-label="What will you build today?"');
      expect(landing).toContain('const HOME_ACTION_WORDS = ["build", "design", "launch"]');
    }),

    it(
      "keeps Preview, Code and Site Settings in the project modebar",
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
          "Site Settings",
        );
        expect(project).toContain('onClick={() => setSettingsOpen(true)}');
        expect(project).toContain("<SiteSettingsWorkspacePanel");
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
