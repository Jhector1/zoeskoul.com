import {
  fileURLToPath,
} from "node:url";

import {
  readFileSync,
} from "node:fs";

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

const buttonPath =
  fileURLToPath(
    new URL(
      "./PublishProjectButton.tsx",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild project publish UX",
  () => {
    it(
      "uses the compact modebar right-side action slot",
      () => {
        const shell =
          readFileSync(
            shellPath,
            "utf8",
          );

        expect(
          shell,
        ).toContain(
          "<PublishProjectButton",
        );

        expect(
          shell.indexOf(
            "<PublishProjectButton",
          ),
        ).toBeGreaterThan(
          shell.indexOf(
            'className="zb-project-mode-tabs"',
          ),
        );

        expect(
          shell.indexOf(
            "<PublishProjectButton",
          ),
        ).toBeLessThan(
          shell.indexOf(
            'className="zb-project-stage-body"',
          ),
        );
      },
    );

    it(
      "publishes through the server boundary and exposes the stable public site URL",
      () => {
        const source =
          readFileSync(
            buttonPath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "/publish",
        );

        expect(
          source,
        ).toContain(
          'method:\n              "POST"',
        );

        expect(
          source,
        ).toContain(
          "View site",
        );
      },
    );

    it(
      "rehydrates Published vN and View site from persisted server state",
      () => {
        const shell =
          readFileSync(
            shellPath,
            "utf8",
          );

        const source =
          readFileSync(
            buttonPath,
            "utf8",
          );

        expect(shell).toContain(
          "initialDeployment={props.initialDeployment}",
        );

        expect(source).toContain(
          "props.initialDeployment",
        );

        expect(source).toContain(
          "`Published v${props.initialDeployment.sourceVersion}`",
        );

        expect(source).toContain(
          "deployment.publicUrl",
        );
      },
    );
  },
);
