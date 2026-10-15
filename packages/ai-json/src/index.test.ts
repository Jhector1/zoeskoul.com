import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  AiJsonUnsupportedModalityError,
  createClaudeAiJsonTransport,
  createDeepSeekAiJsonTransport,
  createGeminiAiJsonTransport,
  parseAiJsonText,
} from "./index";
import {
  supportsDeepSeekImageInput,
} from "./deepseek";

const image = {
  kind: "image",
  mimeType: "image/png",
  source: {
    type: "base64",
    data: "aW1hZ2U=",
  },
} as const;

const audio = {
  kind: "audio",
  mimeType: "audio/mpeg",
  source: {
    type: "base64",
    data: "YXVkaW8=",
  },
} as const;

const video = {
  kind: "video",
  mimeType: "video/mp4",
  source: {
    type: "base64",
    data: "dmlkZW8=",
  },
} as const;

describe(
  "neutral multimodal AI JSON transports",
  () => {
    it(
      "parses raw and fenced JSON",
      () => {
        expect(
          parseAiJsonText(
            '{"name":"ZoeBuild"}',
          ),
        ).toEqual({
          name: "ZoeBuild",
        });

        expect(
          parseAiJsonText(
            '```json\n{"ok":true}\n```',
          ),
        ).toEqual({
          ok: true,
        });
      },
    );

    it(
      "Gemini declares image audio and video support",
      async () => {
        const generateContent =
          vi.fn(async (_args: unknown) => ({
            text: '{"ok":true}',
          }));

        const transport =
          createGeminiAiJsonTransport({
            model: "gemini-test",
            apiKey: "test-key",
            clientFactory:
              async () => ({
                models: {
                  generateContent,
                },
              }),
          });

        expect(
          transport.capabilities,
        ).toEqual({
          text: true,
          image: true,
          audio: true,
          video: true,
        });

        await transport.generateJsonText({
          system: "system",
          user: "",
          schemaName:
            "ProjectSpecification",
          media: [
            image,
            audio,
            video,
          ],
        });

        const request =
          generateContent.mock
            .calls[0]?.[0] as any;

        expect(
          request.contents[0].parts,
        ).toHaveLength(4);
      },
    );

    it(
      "Claude accepts images and fails closed for audio/video",
      async () => {
        const create =
          vi.fn(async () => ({
            content: [
              {
                type: "text",
                text: '{"ok":true}',
              },
            ],
          }));

        const transport =
          createClaudeAiJsonTransport({
            model: "claude-test",
            apiKey: "test-key",
            clientFactory:
              async () => ({
                messages: {
                  create,
                },
              }),
          });

        expect(
          transport.capabilities,
        ).toEqual({
          text: true,
          image: true,
          audio: false,
          video: false,
        });

        await transport.generateJsonText({
          system: "system",
          user: "Use this design",
          schemaName:
            "ProjectSpecification",
          media: [image],
        });

        await expect(
          transport.generateJsonText({
            system: "system",
            user: "",
            schemaName:
              "ProjectSpecification",
            media: [audio],
          }),
        ).rejects.toBeInstanceOf(
          AiJsonUnsupportedModalityError,
        );
      },
    );

    it(
      "DeepSeek enables images only for vision-capable models",
      async () => {
        expect(
          supportsDeepSeekImageInput(
            "deepseek-flash",
          ),
        ).toBe(true);
        expect(
          supportsDeepSeekImageInput(
            "deepseek-chat",
          ),
        ).toBe(false);
        expect(
          supportsDeepSeekImageInput(
            "deepseek-reasoner",
          ),
        ).toBe(false);

        const create =
          vi.fn(async (_args: unknown) => ({
            choices: [
              {
                message: {
                  content:
                    '{"ok":true}',
                },
              },
            ],
          }));

        const vision =
          createDeepSeekAiJsonTransport({
            model: "deepseek-flash",
            apiKey: "test-key",
            clientFactory:
              async () => ({
                chat: {
                  completions: {
                    create,
                  },
                },
              }),
          });

        expect(
          vision.capabilities.image,
        ).toBe(true);

        await vision.generateJsonText({
          system: "system",
          user: "Use this screenshot",
          schemaName:
            "ProjectSpecification",
          media: [image],
        });

        const textOnly =
          createDeepSeekAiJsonTransport({
            model: "deepseek-chat",
            apiKey: "test-key",
            clientFactory:
              async () => ({
                chat: {
                  completions: {
                    create,
                  },
                },
              }),
          });

        expect(
          textOnly.capabilities.image,
        ).toBe(false);

        await expect(
          textOnly.generateJsonText({
            system: "system",
            user: "Use this screenshot",
            schemaName:
              "ProjectSpecification",
            media: [image],
          }),
        ).rejects.toBeInstanceOf(
          AiJsonUnsupportedModalityError,
        );

        await expect(
          vision.generateJsonText({
            system: "system",
            user: "",
            schemaName:
              "ProjectSpecification",
            media: [video],
          }),
        ).rejects.toBeInstanceOf(
          AiJsonUnsupportedModalityError,
        );
      },
    );
  },
);
