import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AiJsonUnsupportedModalityError,
} from "./index";
import {
  createOpenAiJsonTransport,
  type OpenAiFetchLike,
} from "./openai";

const schema = {
  type: "object",
  properties: {
    ok: {
      type: "boolean",
    },
  },
  required: [
    "ok",
  ],
  additionalProperties: false,
} as const;

function successFetch(
  inspect?: (
    input: string,
    init:
      | Readonly<{
          method?: string;
          headers?: Readonly<
            Record<
              string,
              string
            >
          >;
          body?: string;
        }>
      | undefined,
  ) => void,
): OpenAiFetchLike {
  return async (
    input,
    init,
  ) => {
    inspect?.(
      input,
      init,
    );

    return {
      ok: true,
      status: 200,

      async text() {
        return JSON.stringify({
          output_text:
            '{"ok":true}',
        });
      },
    };
  };
}

describe(
  "OpenAI neutral JSON transport",
  () => {
    it(
      "declares text/image support and fails closed for audio/video",
      async () => {
        const transport =
          createOpenAiJsonTransport({
            model:
              "gpt-6.1-sol",
            apiKey:
              "test-key",
            fetchImpl:
              successFetch(),
          });

        expect(
          transport.providerId,
        ).toBe("openai");

        expect(
          transport.model,
        ).toBe(
          "gpt-6.1-sol",
        );

        expect(
          transport.capabilities,
        ).toEqual({
          text: true,
          image: true,
          audio: false,
          video: false,
        });

        for (
          const kind of [
            "audio",
            "video",
          ] as const
        ) {
          await expect(
            transport.generateJsonText({
              system:
                "Return JSON.",
              user:
                "Build something.",
              schemaName:
                "Example",
              responseJsonSchema:
                schema,
              media: [
                {
                  kind,
                  mimeType:
                    kind ===
                    "audio"
                      ? "audio/wav"
                      : "video/mp4",
                  source: {
                    type:
                      "base64",
                    data:
                      "AAAA",
                  },
                },
              ],
            }),
          ).rejects.toBeInstanceOf(
            AiJsonUnsupportedModalityError,
          );
        }
      },
    );

    it(
      "uses Responses structured outputs and does not store the response",
      async () => {
        let requestBody:
          any = null;

        const transport =
          createOpenAiJsonTransport({
            model:
              "gpt-6.1-sol",
            apiKey:
              "test-key",

            fetchImpl:
              successFetch(
                (
                  input,
                  init,
                ) => {
                  expect(
                    input,
                  ).toBe(
                    "https://api.openai.com/v1/responses",
                  );

                  expect(
                    init?.method,
                  ).toBe(
                    "POST",
                  );

                  expect(
                    init
                      ?.headers
                      ?.Authorization,
                  ).toBe(
                    "Bearer test-key",
                  );

                  requestBody =
                    JSON.parse(
                      init?.body ??
                      "{}",
                    );
                },
              ),
          });

        const result =
          await transport
            .generateJsonText({
              system:
                "Return exactly one JSON object.",
              user:
                "Build a portfolio.",
              schemaName:
                "Project Specification",
              responseJsonSchema:
                schema,
            });

        expect(
          result.text,
        ).toBe(
          '{"ok":true}',
        );

        expect(
          result.metadata,
        ).toMatchObject({
          provider:
            "openai",
          model:
            "gpt-6.1-sol",
          schemaName:
            "Project Specification",
        });

        expect(
          requestBody
            .instructions,
        ).toBe(
          "Return exactly one JSON object.",
        );

        expect(
          requestBody.store,
        ).toBe(false);

        expect(
          requestBody
            .text
            .format,
        ).toEqual({
          type:
            "json_schema",
          name:
            "Project_Specification",
          strict:
            true,
          schema,
        });

        expect(
          requestBody.input,
        ).toEqual([
          {
            role: "user",
            content: [
              {
                type:
                  "input_text",
                text:
                  "Build a portfolio.",
              },
            ],
          },
        ]);

        expect(
          requestBody,
        ).not.toHaveProperty(
          "temperature",
        );
      },
    );

    it("counts the identical model, system, input and JSON schema before generation", async () => {
      const bodies: Record<string, unknown>[] = [];
      const paths: string[] = [];
      const transport = createOpenAiJsonTransport({
        model: "gpt-6.1-sol", apiKey: "test-key",
        fetchImpl: async (url, init) => {
          paths.push(url);
          bodies.push(JSON.parse(init?.body ?? "{}") as Record<string, unknown>);
          return {ok: true, status: 200, text: async () => JSON.stringify(
            url.endsWith("/input_tokens")
              ? {object: "response.input_tokens", input_tokens: 777}
              : {output_text: '{"ok":true}', service_tier: "default",
                 usage: {input_tokens: 777, output_tokens: 40}},
          )};
        },
      });
      const request = { system: "System instructions", user: "Make a site",
        schemaName: "Project Spec", responseJsonSchema: schema,
        maxOutputTokens: 1024, serviceTier: "default" as const };
      expect(await transport.countInputTokens?.(request)).toBe(777);
      const result = await transport.generateJsonText(request);
      expect(result.metadata.serviceTier).toBe("default");
      expect(paths).toEqual([
        "https://api.openai.com/v1/responses/input_tokens",
        "https://api.openai.com/v1/responses",
      ]);
      for (const key of ["model", "instructions", "input", "text"]) {
        expect(bodies[0]?.[key]).toEqual(bodies[1]?.[key]);
      }
      expect(bodies[1]).toMatchObject({max_output_tokens: 1024, store: false,
        service_tier: "default", truncation: "disabled"});
      expect(bodies[0]).not.toHaveProperty("max_output_tokens");
      expect(bodies[0]).not.toHaveProperty("service_tier");
      expect(bodies[0]).not.toHaveProperty("truncation");
    });

    it("rejects an unsupported premium-tier request before HTTP dispatch", async () => {
      const fetchImpl = vi.fn();
      const transport = createOpenAiJsonTransport({
        model: "gpt-6-luna", apiKey: "unit", fetchImpl,
      });
      await expect(transport.generateJsonText({
        system: "s", user: "u", schemaName: "test",
        serviceTier: "fast" as never,
      })).rejects.toThrow("AI_JSON_SERVICE_TIER_UNSUPPORTED");
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("rejects invalid or incomplete provider input-count responses", async () => {
      const transport = createOpenAiJsonTransport({model: "gpt-6.1-sol", apiKey: "test-key",
        fetchImpl: async () => ({ok: true, status: 200,
          text: async () => JSON.stringify({object: "response.input_tokens", input_tokens: "100"})})});
      await expect(transport.countInputTokens?.({system: "s", user: "u", schemaName: "x"}))
        .rejects.toThrow("AI_INPUT_COUNT_INVALID_RESPONSE");
    });

    it(
      "maps base64 images to Responses input_image data URLs",
      async () => {
        let requestBody:
          any = null;

        const transport =
          createOpenAiJsonTransport({
            model:
              "gpt-6.1-sol",
            apiKey:
              "test-key",

            fetchImpl:
              successFetch(
                (
                  _input,
                  init,
                ) => {
                  requestBody =
                    JSON.parse(
                      init?.body ??
                      "{}",
                    );
                },
              ),
          });

        await transport
          .generateJsonText({
            system:
              "Return JSON.",
            user: "",
            schemaName:
              "ImagePlan",
            responseJsonSchema:
              schema,
            media: [
              {
                kind:
                  "image",
                mimeType:
                  "image/png",
                source: {
                  type:
                    "base64",
                  data:
                    "YWJj",
                },
              },
            ],
          });

        expect(
          requestBody
            .input[0]
            .content[0],
        ).toEqual({
          type:
            "input_image",
          detail:
            "auto",
          image_url:
            "data:image/png;base64,YWJj",
        });
      },
    );

    it(
      "surfaces Responses API failures without leaking credentials",
      async () => {
        const transport =
          createOpenAiJsonTransport({
            model:
              "gpt-6.1-sol",
            apiKey:
              "secret-test-key",

            fetchImpl:
              async () => ({
                ok: false,
                status: 429,

                async text() {
                  return JSON.stringify({
                    error: {
                      message:
                        "Rate limit reached.",
                    },
                  });
                },
              }),
          });

        await expect(
          transport.generateJsonText({
            system:
              "Return JSON.",
            user:
              "Build a site.",
            schemaName:
              "Example",
            responseJsonSchema:
              schema,
          }),
        ).rejects.toThrow(
          /OpenAI Responses API request failed \(429\): Rate limit reached/,
        );

        await expect(
          transport.generateJsonText({
            system:
              "Return JSON.",
            user:
              "Build a site.",
            schemaName:
              "Example",
            responseJsonSchema:
              schema,
          }),
        ).rejects.not.toThrow(
          /secret-test-key/,
        );
      },
    );
    it("captures the actual API base once for both counting and generation", async () => {
      const calls: string[] = [];
      const options = {
        model: "gpt-6-luna", apiKey: "fixture-key",
        baseURL: "https://eu.api.openai.com/v1/",
        fetchImpl: async (url: string) => {
          calls.push(url);
          return {ok: true, status: 200, text: async () => JSON.stringify(
            url.endsWith("/input_tokens")
              ? {object: "response.input_tokens", input_tokens: 10}
              : {output_text: '{"ok":true}', service_tier: "default",
                  usage: {input_tokens: 10, output_tokens: 2}},
          )};
        },
      };
      const transport = createOpenAiJsonTransport(options);
      expect(transport.billingEndpointBaseUrl).toBe("https://eu.api.openai.com/v1");
      // Mutating the original options cannot redirect just the generation call.
      options.baseURL = "https://api.openai.com/v1";
      const request = {system: "s", user: "u", schemaName: "x",
        maxOutputTokens: 64, serviceTier: "default" as const};
      expect(await transport.countInputTokens?.(request)).toBe(10);
      await transport.generateJsonText(request);
      expect(calls).toEqual([
        "https://eu.api.openai.com/v1/responses/input_tokens",
        "https://eu.api.openai.com/v1/responses",
      ]);
    });
  },
);
