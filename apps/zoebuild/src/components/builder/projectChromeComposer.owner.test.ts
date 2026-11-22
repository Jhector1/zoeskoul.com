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

const compactCss = readFileSync(new URL("./ZoeBuildPromptComposer.module.css",import.meta.url),"utf8");

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
      "keeps the composer compact and auto-growing",
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

        expect(compactCss).toContain("min-height: 36px");
        expect(compactCss).toContain("max-height: 144px");
        expect(composer).toContain("useLayoutEffect");
        expect(composer).toContain("rows={1}");
        expect(compactCss).toContain("min-height: 30px !important");
        expect(compactCss).toContain("border: 0 !important");
        expect(compactCss).toContain("height: 30px !important");
        expect(composer).toContain("shouldSubmitZoePromptOnEnter");
        expect(composer).toContain("form?.requestSubmit()");
      },
    );

    it(
      "keeps Build and removes the Shopify composer shortcut",
      () => {
        expect(composer).not.toContain("Import Shopify");

        expect(
          composer,
        ).toContain(
          "zb-build-button",
        );

        expect(
          shell,
        ).toContain(
          'placeholder=""',
        );
      },
    );
  },
);
