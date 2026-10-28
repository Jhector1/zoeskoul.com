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
      "../../app/api/build/projects/[buildProjectId]/publish/route.ts",
      import.meta.url,
    ),
  );

const source =
  readFileSync(
    routePath,
    "utf8",
  );

describe(
  "ZoeBuild publish HTTP boundary",
  () => {
    it(
      "keeps same-origin, shared account auth, publish gate and rate limiting ahead of mutation",
      () => {
        expect(
          source,
        ).toContain(
          "enforceSameOriginPost",
        );

        expect(
          source,
        ).toContain(
          "loadCurrentBuildAccessSnapshot",
        );

        expect(
          source,
        ).toContain(
          "isZoeBuildPublishEnabled",
        );

        expect(
          source,
        ).toContain(
          '"zoebuild-publish"',
        );

        expect(
          source,
        ).toContain(
          "getBuildProjectCommand",
        );
      },
    );

    it("does not publish direct-static source or retain its publisher", () => {
      expect(source).not.toContain("directStatic");
      expect(source).not.toContain("createPrismaSelfHostedStaticPublisher");
      expect(source).toContain("trustedReact");
      expect(source).toContain("ZOEBUILD_STATIC_ASSETS_KIND");
    });

    it(
      "routes React through only the registered trusted production executor",
      () => {
        expect(
          source,
        ).toContain(
          'preparation.stackId ===\n        "react-vite-v1"',
        );

        expect(
          source,
        ).toContain(
          "createRegisteredProductionBuildJob",
        );

        expect(
          source,
        ).toContain(
          "requireRunnerActorKey",
        );

        expect(
          source,
        ).toContain(
          "executeTrustedProductionBuildAtRunner",
        );

        expect(
          source,
        ).toContain(
          "createPrismaSelfHostedCompiledPublisher",
        );

        expect(
          source,
        ).not.toContain(
          "child_process",
        );

        expect(
          source,
        ).not.toContain(
          "createContainer(",
        );

        expect(
          source,
        ).not.toContain(
          "Docker",
        );
      },
    );

    it(
      "reuses an unchanged ready compiled deployment before spending runner compute",
      () => {
        const reuse =
          source.indexOf(
            "const reusableCompiledDeployment",
          );

        const actor =
          source.indexOf(
            "const actorKey",
          );

        const executor =
          source.indexOf(
            "await executeTrustedProductionBuildAtRunner",
          );

        expect(
          reuse,
        ).toBeGreaterThan(
          -1,
        );

        expect(
          actor,
        ).toBeGreaterThan(
          reuse,
        );

        expect(
          executor,
        ).toBeGreaterThan(
          actor,
        );

        expect(
          source,
        ).toContain(
          "ZOEBUILD_COMPILED_ARTIFACT_PROVIDER",
        );
      },
    );

    it(
      "adds a separate build-compute limiter without accepting execution controls from the browser",
      () => {
        expect(
          source,
        ).toContain(
          '"zoebuild-production-build"',
        );

        expect(
          source,
        ).toContain(
          "limit: 12",
        );

        for (
          const forbidden of [
            "req.command",
            "req.argv",
            "req.shell",
            "req.env",
            "req.network",
            "req.image",
          ]
        ) {
          expect(
            source,
          ).not.toContain(
            forbidden,
          );
        }
      },
    );
  },
);
