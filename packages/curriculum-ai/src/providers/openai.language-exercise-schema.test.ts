import { describe, expect, it } from "vitest";
import {
  assertOpenAiStructuredOutputSchemaCompatible,
  getOpenAiStructuredOutputSchema,
} from "./openai.js";

describe("OpenAI TopicAuthoringDraft language exercise schema", () => {
  it("accepts all generic language exercise kinds and compatibility fields", () => {
    const schema = getOpenAiStructuredOutputSchema("TopicAuthoringDraft") as any;
    const exercise = schema.properties.quizDraft.items;

    expect(exercise.properties.kind.enum).toEqual(expect.arrayContaining([
      "text_input",
      "voice_input",
      "word_bank_arrange",
      "listen_build",
    ]));

    for (const field of [
      "expectedText",
      "anyOf",
      "placeholder",
      "targetText",
      "locale",
      "maxSeconds",
      "wordBank",
      "distractors",
      "ttsText",
      "normalize",
    ]) {
      expect(exercise.required).toContain(field);
      expect(exercise.properties[field]).toBeDefined();
    }

    expect(() => assertOpenAiStructuredOutputSchemaCompatible(schema)).not.toThrow();
  });

  it("still rejects a real JSON Schema anyOf keyword", () => {
    expect(() =>
      assertOpenAiStructuredOutputSchemaCompatible({
        type: "string",
        anyOf: [{ type: "string" }],
      } as any),
    ).toThrow(/unsupported keyword "anyOf"/);
  });
});
