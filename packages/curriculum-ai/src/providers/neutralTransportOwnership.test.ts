import {
  readFileSync,
} from "node:fs";
import {
  resolve,
} from "node:path";
import {
  describe,
  expect,
  it,
} from "vitest";

const repo =
  resolve(__dirname, "../../../..");

function source(path: string) {
  return readFileSync(
    resolve(repo, path),
    "utf8",
  );
}

describe(
  "neutral multimodal AI transport ownership",
  () => {
    it(
      "owns Gemini Claude and DeepSeek SDK calls outside curriculum-ai",
      () => {
        const neutral = [
          source(
            "packages/ai-json/src/gemini.ts",
          ),
          source(
            "packages/ai-json/src/claude.ts",
          ),
          source(
            "packages/ai-json/src/deepseek.ts",
          ),
        ].join("\n");

        expect(neutral).toContain(
          "@google/genai",
        );
        expect(neutral).toContain(
          "@anthropic-ai/sdk",
        );
        expect(neutral).toContain(
          'from "openai"',
        );

        for (const path of [
          "packages/curriculum-ai/src/providers/gemini.ts",
          "packages/curriculum-ai/src/providers/claude.ts",
          "packages/curriculum-ai/src/providers/deepseek.ts",
        ]) {
          const provider =
            source(path);

          expect(provider).toContain(
            'from "@zoeskoul/ai-json"',
          );
          expect(provider).not.toContain(
            "@google/genai",
          );
          expect(provider).not.toContain(
            "@anthropic-ai/sdk",
          );
          expect(provider).not.toContain(
            'from "openai"',
          );
        }
      },
    );

    it(
      "keeps provider capability differences explicit",
      () => {
        const gemini = source(
          "packages/ai-json/src/gemini.ts",
        );
        const claude = source(
          "packages/ai-json/src/claude.ts",
        );
        const deepseek = source(
          "packages/ai-json/src/deepseek.ts",
        );

        expect(gemini).toContain(
          "audio: true",
        );
        expect(gemini).toContain(
          "video: true",
        );
        expect(claude).toContain(
          "audio: false",
        );
        expect(claude).toContain(
          "video: false",
        );
        expect(deepseek).toContain(
          "audio: false",
        );
        expect(deepseek).toContain(
          "video: false",
        );
      },
    );

    it(
      "leaves curriculum structured-output ownership in curriculum-ai",
      () => {
        const openai = source(
          "packages/curriculum-ai/src/providers/openai.ts",
        );

        expect(openai).toContain(
          "getOpenAiStructuredOutputSchema",
        );
        expect(openai).toContain(
          '"TopicAuthoringDraft"',
        );
        expect(openai).toContain(
          '"CoursePlan"',
        );

        const neutral = source(
          "packages/ai-json/src/index.ts",
        );

        expect(neutral).not.toContain(
          "TopicAuthoringDraft",
        );
        expect(neutral).not.toContain(
          "CoursePlan",
        );
        expect(neutral).not.toContain(
          "TranslatedEntries",
        );
      },
    );
  },
);
