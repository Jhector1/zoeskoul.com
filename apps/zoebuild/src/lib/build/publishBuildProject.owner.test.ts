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

const path =
  fileURLToPath(
    new URL(
      "./publishBuildProject.ts",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild self-hosted publish persistence ownership",
  () => {
    it(
      "pins deployment to an immutable CodeProject revision",
      () => {
        const source =
          readFileSync(
            path,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "codeProjectRevision",
        );

        expect(
          source,
        ).toContain(
          "projectId_version",
        );

        expect(
          source,
        ).toContain(
          "expectedSourceVersion",
        );

        expect(
          source,
        ).toContain(
          "snapshot:",
        );
      },
    );

    it(
      "persists a ready BuildDeployment without mutating source",
      () => {
        const source =
          readFileSync(
            path,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          ".buildDeployment",
        );

        expect(
          source,
        ).toContain(
          'status:\n                    "ready"',
        );

        expect(
          source,
        ).toContain(
          "ZOEBUILD_SELF_HOSTED_PROVIDER",
        );

        expect(
          source,
        ).not.toContain(
          ".codeProject.update",
        );
      },
    );
  },
);
