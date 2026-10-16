import {
  describe,
  expect,
  it,
} from "vitest";

import {
  createGeminiAiJsonTransport,
} from "./index";

describe("Gemini structured JSON output", () => {
  it("passes the neutral response JSON schema to Gemini", async () => {
    let requestArgs: any;

    const responseJsonSchema = {
      type: "object",
      additionalProperties: false,
      properties: {
        ok: {
          type: "boolean",
        },
      },
      required: ["ok"],
    } as const;

    const transport =
      createGeminiAiJsonTransport({
        model: "gemini-test-model",
        apiKey: "test-key",
        clientFactory: async () => ({
          models: {
            async generateContent(args: unknown) {
              requestArgs = args;
              return {
                text: JSON.stringify({
                  ok: true,
                }),
              };
            },
          },
        }),
      });

    await transport.generateJsonText({
      system: "Return JSON.",
      user: "Confirm.",
      schemaName: "StructuredSmoke",
      responseJsonSchema,
    });

    expect(
      requestArgs.config.responseMimeType,
    ).toBe("application/json");

    expect(
      requestArgs.config.responseJsonSchema,
    ).toEqual(responseJsonSchema);
  });

  it("does not invent a provider schema when none is supplied", async () => {
    let requestArgs: any;

    const transport =
      createGeminiAiJsonTransport({
        model: "gemini-test-model",
        apiKey: "test-key",
        clientFactory: async () => ({
          models: {
            async generateContent(args: unknown) {
              requestArgs = args;
              return {
                text: "{}",
              };
            },
          },
        }),
      });

    await transport.generateJsonText({
      system: "Return JSON.",
      user: "Confirm.",
      schemaName: "UnstructuredSmoke",
    });

    expect(
      requestArgs.config.responseJsonSchema,
    ).toBeUndefined();
  });
});
