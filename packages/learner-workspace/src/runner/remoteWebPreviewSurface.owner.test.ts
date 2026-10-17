import {
  readFileSync,
} from "node:fs";

import {
  resolve,
} from "node:path";

import {
  describe,
  expect,
  it,
} from "vitest";

const root =
  process.cwd();

function read(
  relative: string,
) {
  return readFileSync(
    resolve(
      root,
      relative,
    ),
    "utf8",
  );
}

describe(
  "shared remote preview surface override",
  () => {
    const types = read(
      "packages/learner-workspace/src/ide/types.ts",
    );

    const fullIde = read(
      "packages/learner-workspace/src/fullide/FullIDE.tsx",
    );

    const pane = read(
      "packages/learner-workspace/src/fullide/panes/IdeEditorPane.tsx",
    );

    const runner = read(
      "packages/learner-workspace/src/runner/CodeRunner.tsx",
    );

    const surface = read(
      "packages/learner-workspace/src/runner/components/OutputSurface.tsx",
    );

    it(
      "threads a generic override without ZoeBuild coupling",
      () => {
        for (
          const source of [
            types,
            fullIde,
            pane,
            runner,
          ]
        ) {
          expect(source).toContain(
            "remoteWebPreviewSurface",
          );

          expect(source).not.toContain(
            "PersistentReactPreviewSlot",
          );
        }

        expect(surface).toContain(
          "surface?: React.ReactNode",
        );

        expect(surface).not.toContain(
          "PersistentReactPreviewSlot",
        );
      },
    );

    it(
      "normalizes the override at OutputSurface while preserving RemoteWebPreview fallback",
      () => {
        expect(surface).toContain(
          "model.surface ??",
        );

        expect(surface).toContain(
          "<RemoteWebPreview preview={model.preview} />",
        );
      },
    );
  },
);
