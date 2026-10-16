import {
  readFileSync,
} from "node:fs";

import {
  describe,
  expect,
  it,
} from "vitest";

const runnerTypes =
  readFileSync(
    new URL(
      "../runner/types.ts",
      import.meta.url,
    ),
    "utf8",
  );

const codeRunner =
  readFileSync(
    new URL(
      "../runner/CodeRunner.tsx",
      import.meta.url,
    ),
    "utf8",
  );

const services =
  readFileSync(
    new URL(
      "../ide/fullide/services.ts",
      import.meta.url,
    ),
    "utf8",
  );

const editorPane =
  readFileSync(
    new URL(
      "./panes/IdeEditorPane.tsx",
      import.meta.url,
    ),
    "utf8",
  );

describe(
  "FullIDE initial output dock ownership",
  () => {
    it(
      "reuses the canonical CodeRunner initial dock contract",
      () => {
        expect(
          runnerTypes,
        ).toContain(
          "initialTerminalDock?: TerminalDock;",
        );

        expect(
          codeRunner,
        ).toContain(
          'initialTerminalDock ?? "bottom"',
        );

        expect(
          codeRunner,
        ).not.toContain(
          "(props as any).initialTerminalDock",
        );
      },
    );

    it(
      "forwards the optional FullIDE runner presentation preference",
      () => {
        expect(
          services,
        ).toContain(
          "initialTerminalDock?: TerminalDock;",
        );

        expect(
          editorPane,
        ).toContain(
          "initialTerminalDock={services.runner.initialTerminalDock}",
        );
      },
    );

    it(
      "preserves the canonical right-bottom user toggle",
      () => {
        expect(
          codeRunner,
        ).toContain(
          'setDock(effectiveDock === "bottom" ? "right" : "bottom")',
        );
      },
    );
  },
);
