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
  projectType: "fullstack-app",
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
  stackId: "tanstack-start-v1",
  deployment: {
    preference: "managed-runtime",
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


describe("semantic architecture is not coerced to fit the runtime", () => {
  it("keeps a game about a store separate from real commerce", async () => {
    const proposal = {...validSpecification, name: "Shop simulation", pages: ["Play"], commerce: null};
    const model = planner(proposal);
    const prompt = "Build a restaurant shop simulation game, no real checkout or accounts.";
    const result = await planBuildProjectFromPrompt({prompt, planner: model});
    expect(model.generateProjectSpecification).toHaveBeenCalledWith({prompt, media: [], maxOutputTokens: undefined});
    expect(result.specification).toEqual(proposal);
  });
  it("preserves a catalog plan without inventing payments", async () => {
    const proposal = {...validSpecification, name: "Catalog", requirements: {...validSpecification.requirements, commerce: true},
      commerce: {storefrontRuntime: "tanstack-start"}};
    expect((await planBuildProjectFromPrompt({prompt: "Store catalog only. No checkout.", planner: planner(proposal)})).specification).toEqual(proposal);
  });
  it.each(["auth", "database", "storage", "email"] as const)("rejects unsupported %s without deleting the requirement", async capability => {
    await expect(planBuildProjectFromPrompt({prompt: "A real application", planner: planner({
      ...validSpecification, requirements: {...validSpecification.requirements, [capability]: true},
    })})).rejects.toMatchObject({code: "BUILD_AI_STACK_INCOMPATIBLE"});
  });
  it("does not turn an unsupported deployment request into a fake supported deployment", async () => {
    await expect(planBuildProjectFromPrompt({prompt: "Native deployment", planner: planner({
      ...validSpecification, deployment: {preference: "mobile-cloud"},
    })})).rejects.toMatchObject({code: "BUILD_AI_STACK_INCOMPATIBLE"});
  });
});
