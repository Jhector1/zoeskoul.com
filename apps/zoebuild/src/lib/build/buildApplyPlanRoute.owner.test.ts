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

const routePath =
  fileURLToPath(
    new URL(
      "../../app/api/build/projects/[buildProjectId]/apply-plan/route.ts",
      import.meta.url,
    ),
  );

describe(
  "ZoeBuild Apply Plan HTTP boundary",
  () => {
    it(
      "keeps transport, authentication, rate limiting and specification validation ahead of mutation",
      () => {
        const source =
          readFileSync(
            routePath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "enforceSameOriginPost(",
        );

        expect(
          source,
        ).toContain(
          "exceedsContentLength(",
        );

        expect(
          source,
        ).toContain(
          "loadCurrentBuildAccessSnapshot()",
        );

        expect(
          source,
        ).toContain(
          'bucket:\n          "zoebuild-apply-plan"',
        );

        expect(
          source,
        ).toContain(
          "parseProjectSpecification(",
        );

        expect(
          source,
        ).toContain(
          "applyBuildProjectPlanCommand({",
        );

        expect(
          source,
        ).toContain(
          "createPrismaBuildProjectPlanWriter(",
        );
      },
    );

    it(
      "exposes optimistic conflict and does not perform direct project mutation in the route",
      () => {
        const source =
          readFileSync(
            routePath,
            "utf8",
          );

        expect(
          source,
        ).toContain(
          "BuildSourceConflictError",
        );

        expect(
          source,
        ).toContain(
          "409",
        );

        expect(
          source,
        ).not.toContain(
          "prisma.codeProject.update",
        );

        expect(
          source,
        ).not.toContain(
          "prisma.buildProject.update",
        );

        expect(
          source.toLowerCase(),
        ).not.toContain(
          "shopify",
        );

        expect(
          source.toLowerCase(),
        ).not.toContain(
          "openai",
        );
      },
    );
  },
);
