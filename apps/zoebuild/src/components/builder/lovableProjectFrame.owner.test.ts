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

const shellPath =
  fileURLToPath(
    new URL(
      "../../app/[locale]/projects/[buildProjectId]/ProjectBuilderShell.tsx",
      import.meta.url,
    ),
  );

const globalsPath =
  fileURLToPath(
    new URL(
      "../../app/globals.css",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild Lovable-style project frame",
  () => {
    it(
      "keeps Zoé persistent beside the project workspace",
      () => {
        const source =
          readFileSync(
            shellPath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          'className="zb-project-frame"',
        );

        expect(
          source,
        ).toContain(
          'className="zb-project-assistant-rail"',
        );

        expect(
          source,
        ).toContain(
          'aria-label="Zoé project assistant"',
        );

        expect(
          source,
        ).toContain(
          "messages.map(",
        );

        expect(
          source,
        ).toContain(
          "onPrompt={planChange}",
        );

        expect(
          source.match(
            /<ZoeBuildPromptComposer\b/g,
          ) ?? [],
        ).toHaveLength(1);
      },
    );

    it(
      "switches the right workspace among Preview Code and Commerce without navigation",
      () => {
        const source =
          readFileSync(
            shellPath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          'className="zb-project-mode-tabs"',
        );

        expect(
          source,
        ).toContain(
          "Preview",
        );

        expect(
          source,
        ).toContain(
          "Code",
        );

        expect(
          source,
        ).toContain(
          "Commerce",
        );

        expect(
          source,
        ).toContain(
          "setCommerceOpen(false)",
        );

        expect(
          source,
        ).toContain(
          'mode === "preview"',
        );

        expect(
          source,
        ).toContain(
          'mode === "code"',
        );

        expect(
          source,
        ).not.toContain(
          'window.location.href = "/preview"',
        );
      },
    );

    it(
      "keeps explicit Apply Plan inside the persistent assistant",
      () => {
        const source =
          readFileSync(
            shellPath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "pendingPlan ?",
        );

        expect(
          source,
        ).toContain(
          "applyPendingPlan",
        );

        expect(
          source,
        ).toContain(
          "Nothing changes in project source until you apply this plan.",
        );
      },
    );

    it(
      "owns responsive frame presentation without duplicating IDE implementation",
      () => {
        const styles =
          readFileSync(
            globalsPath,
            "utf8",
          );

        expect(
          styles,
        ).toContain(
          "ZOEBUILD_LOVABLE_PROJECT_FRAME_V301D2C2E6E1_5A",
        );

        expect(
          styles,
        ).toContain(
          ".zb-project-frame",
        );

        expect(
          styles,
        ).toContain(
          ".zb-project-assistant-rail",
        );

        expect(
          styles,
        ).toContain(
          ".zb-project-stage",
        );
      },
    );
  },
);
