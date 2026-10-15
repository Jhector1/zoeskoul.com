import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import type {
  BuildAiPlanner,
} from "./index";
import {
  BuildAiPlanningError,
  planBuildProjectFromPrompt,
} from "./index";

const validSpecification = {
  version: 1,
  name: "Photographer Portfolio",
  projectType: "static-site",
  targets: ["web"],
  requirements: {
    backend: false,
    database: false,
    auth: false,
    storage: false,
    payments: false,
    email: false,
    commerce: false,
  },
  pages: ["Home", "Gallery", "Contact"],
  stackId: "static-html-v1",
  deployment: {
    preference: "static",
  },
} as const;

function planner(
  specification: unknown =
    validSpecification,
): BuildAiPlanner {
  return {
    generateProjectSpecification:
      vi.fn(async () => ({
        specification,
        metadata: {
          provider: "test",
          model: "test-model",
        },
      })),
  };
}

describe(
  "provider-neutral ZoeBuild AI planner",
  () => {
    it(
      "accepts only a specification that passes the canonical parser and stack gate",
      async () => {
        const result =
          await planBuildProjectFromPrompt({
            prompt:
              "Create a photographer portfolio",
            planner: planner(),
          });

        expect(
          result.specification,
        ).toEqual(validSpecification);
        expect(result.metadata).toEqual({
          provider: "test",
          model: "test-model",
        });
      },
    );

    it(
      "rejects invalid model output before persistence",
      async () => {
        await expect(
          planBuildProjectFromPrompt({
            prompt: "Create a site",
            planner: planner({
              ...validSpecification,
              targets: ["desktop"],
            }),
          }),
        ).rejects.toMatchObject({
          code: "BUILD_AI_SPEC_INVALID",
        });
      },
    );

    it(
      "rejects unknown stacks before persistence",
      async () => {
        await expect(
          planBuildProjectFromPrompt({
            prompt: "Create a site",
            planner: planner({
              ...validSpecification,
              stackId: "unknown-stack-v1",
            }),
          }),
        ).rejects.toBeTruthy();
      },
    );

    it(
      "rejects empty and oversized prompts",
      async () => {
        await expect(
          planBuildProjectFromPrompt({
            prompt: "   ",
            planner: planner(),
          }),
        ).rejects.toBeInstanceOf(
          BuildAiPlanningError,
        );

        await expect(
          planBuildProjectFromPrompt({
            prompt: "x".repeat(12_001),
            planner: planner(),
          }),
        ).rejects.toMatchObject({
          code: "BUILD_AI_PROMPT_INVALID",
        });
      },
    );
  },
);
