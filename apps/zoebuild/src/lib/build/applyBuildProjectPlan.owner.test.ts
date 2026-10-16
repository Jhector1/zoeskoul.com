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

const path =
  fileURLToPath(
    new URL(
      "./applyBuildProjectPlan.ts",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild Apply Plan persistence ownership",
  () => {
    it(
      "reuses the canonical CodeProject transaction writer",
      () => {
        const source =
          readFileSync(
            path,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "saveCodeProjectInTransaction",
        );

        expect(
          source,
        ).toContain(
          "client.$transaction",
        );

        expect(
          source,
        ).toContain(
          "tx.buildProject",
        );

        expect(
          source,
        ).toContain(
          'revisionNote:\n                    "ZoeBuild applied plan"',
        );
      },
    );

    it(
      "keeps ownership authoritative on CodeProject and optimistic concurrency required",
      () => {
        const source =
          readFileSync(
            path,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          ".ownerId !==\n                input.ownerId",
        );

        expect(
          source,
        ).toContain(
          "baseVersion:\n                    input.baseVersion",
        );

        expect(
          source,
        ).toContain(
          "ProjectVersionConflictError",
        );

        expect(
          source,
        ).toContain(
          "BuildSourceConflictError",
        );
      },
    );
  },
);
