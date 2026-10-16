import {
  describe,
  expect,
  it,
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
  },
);
