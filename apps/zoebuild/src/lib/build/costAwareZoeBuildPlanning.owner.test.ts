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

function source(
  relative: string,
): string {
  return readFileSync(
    fileURLToPath(
      new URL(
        relative,
        import.meta.url,
      ),
    ),
    "utf8",
  );
}

describe(
  "ZoeBuild cost-aware planning ownership",
  () => {
    it(
      "locks architecture outside of the model",
      () => {
        const owner =
          source(
            "./costAwareZoeBuildPlanning.ts",
          );

        expect(
          owner,
        ).toContain(
          "lockArchitecture",
        );

        for (const contract of [
          'projectType:',
          '"frontend-app"',
          'targets:',
          '"web"',
          'requirements:',
          'profile.requirements',
          'commerce:',
          'profile.requirements.commerce',
          'storefrontRuntime: "react-vite"',
          'stackId:',
          '"react-vite-v1"',
          'deployment:',
          'preference:',
        ]) {
          expect(owner).toContain(contract);
        }
      },
    );

    it(
      "keeps cheap-first auto routing separate from manual override",
      () => {
        const owner =
          source(
            "./costAwareZoeBuildPlanning.ts",
          );

        expect(
          owner,
        ).toContain(
          "ZOEBUILD_AI_ROUTING_MODE",
        );

        expect(
          owner,
        ).toContain(
          'mode === "manual"',
        );

        expect(
          owner,
        ).toContain(
          "resolveBuildModelRoute",
        );
      },
    );

    it(
      "escalates provider capacity and invalid model output but not arbitrary failures",
      () => {
        const owner =
          source(
            "./costAwareZoeBuildPlanning.ts",
          );

        expect(
          owner,
        ).toContain(
          "isRetryableProviderFailure",
        );

        expect(
          owner,
        ).toContain(
          '"BUILD_AI_SPEC_INVALID"',
        );

        expect(
          owner,
        ).toContain(
          '"BUILD_AI_STACK_INCOMPATIBLE"',
        );
      },
    );
  },
);
