import {
  describe,
  expect,
  it,
} from "vitest";

import {
  listBuildStacks,
} from "@zoeskoul/build-registry";
import {
  AI_JSON_DEFAULT_TEMPERATURE,
  type AiJsonRequest,
  type AiJsonTransport,
} from "@zoeskoul/ai-json";

import {
  BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA,
  BUILD_AI_REGISTERED_STACK_IDS,
  createBuildAiPlannerFromJsonTransport,
} from "./index";

describe("Build AI structured output ownership", () => {
  it("forwards the registry-constrained ProjectSpecification schema", async () => {
    let captured:
      | AiJsonRequest
      | undefined;

    const transport: AiJsonTransport = {
      providerId: "test",
      model: "test-model",
      capabilities: {
        text: true,
        image: true,
        audio: true,
        video: true,
      },

      async generateJsonText(request) {
        captured = request;

        return {
          text: JSON.stringify({
            version: 1,
            name: "Structured output test",
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
            pages: ["Home"],
            stackId: "static-html-v1",
            deployment: {
              preference: "static",
            },
          }),
          metadata: {
            provider: "test",
            model: "test-model",
            temperature:
              AI_JSON_DEFAULT_TEMPERATURE,
            schemaName:
              request.schemaName,
          },
        };
      },
    };

    const planner =
      createBuildAiPlannerFromJsonTransport(
        transport,
      );

    await planner.generateProjectSpecification({
      prompt: "Build a simple landing page.",
    });

    expect(captured).toBeDefined();

    expect(
      BUILD_AI_REGISTERED_STACK_IDS,
    ).toEqual(
      listBuildStacks().map(
        (stack) => stack.id,
      ),
    );

    expect(
      captured!.responseJsonSchema,
    ).toBe(
      BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA,
    );

    expect(
      BUILD_AI_PROJECT_SPECIFICATION_JSON_SCHEMA
        .properties.stackId.enum,
    ).toEqual(
      listBuildStacks().map(
        (stack) => stack.id,
      ),
    );
  });
});
