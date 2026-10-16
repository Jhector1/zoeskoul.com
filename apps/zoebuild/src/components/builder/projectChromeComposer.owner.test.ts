import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const composer =
  readFileSync(
    new URL(
      "./ZoeBuildPromptComposer.tsx",
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
  "ZoeBuild polished Zoé composer",
  () => {
    it(
      "uses the reusable Zoéskoul Tooltip",
      () => {
        expect(
          composer,
        ).toContain(
          '@zoeskoul/learner-workspace/ui/Tooltip',
        );

        expect(
          composer,
        ).toContain(
          'tip="Add media"',
        );

        expect(
          composer,
        ).toContain(
          'tip="Record voice"',
        );

        expect(
          composer,
        ).toContain(
          'side="top"',
        );
      },
    );

    it(
      "uses icon-only media and microphone actions",
      () => {
        expect(
          composer,
        ).toContain(
          'aria-label="Add media"',
        );

        expect(
          composer,
        ).toContain(
          'aria-label="Record voice"',
        );

        expect(
          composer,
        ).toContain(
          'd="M12 5v14M5 12h14"',
        );

        expect(
          composer,
        ).toContain(
          'className="zb-composer-action-icon"',
        );
      },
    );

    it(
      "keeps the composer spacious and clean",
      () => {
        expect(
          composer,
        ).toContain(
          "zb-prompt-textarea",
        );

        expect(
          css,
        ).toContain(
          "ZOEBUILD_ICON_COMPOSER_V301E6R6A",
        );

        expect(
          css,
        ).toContain(
          "min-height: 140px",
        );
      },
    );

    it(
      "preserves Shopify Build and project prompt ownership",
      () => {
        expect(
          composer,
        ).toContain(
          "Import Shopify",
        );

        expect(
          composer,
        ).toContain(
          "zb-build-button",
        );

        expect(
          shell,
        ).toContain(
          "Ask Zoé to build, change, or refine anything…",
        );
      },
    );
  },
);
