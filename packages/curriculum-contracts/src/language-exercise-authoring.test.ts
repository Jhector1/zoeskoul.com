import { describe, expect, it } from "vitest";
import {
  TOPIC_AUTHORING_DRAFT_JSON_SCHEMA,
  validateTopicAuthoringDraft,
  type TopicAuthoringDraft,
} from "./topic-authoring-draft.js";

const help = {
  concept: "Language concept",
  hint_1: "First hint",
  hint_2: "Second hint",
};

function baseDraft(exercise: TopicAuthoringDraft["quizDraft"][number]): TopicAuthoringDraft {
  return {
    title: "Language topic",
    summary: "Integrated language practice.",
    minutes: 12,
    sketchBlocks: [],
    quizDraft: [exercise],
  };
}

describe("language exercise authoring contract", () => {
  it.each([
    {
      id: "write-1",
      kind: "text_input",
      title: "Write",
      prompt: "Write the phrase.",
      hint: "Use the model phrase.",
      help,
      expectedText: "Bonjou",
      anyOf: ["Bonjou!"],
      normalize: { trim: true, caseFold: true, collapseSpaces: true },
    },
    {
      id: "speak-1",
      kind: "voice_input",
      title: "Speak",
      prompt: "Say the phrase.",
      hint: "Speak clearly.",
      help,
      targetText: "Bonjou",
      locale: "ht",
      anyOf: ["Bonjou!"],
      maxSeconds: 10,
      normalize: { trim: true, caseFold: true, collapseSpaces: true },
    },
    {
      id: "build-1",
      kind: "word_bank_arrange",
      title: "Build",
      prompt: "Build the sentence.",
      hint: "Start with Mwen.",
      help,
      targetText: "Mwen rele Mari.",
      locale: "ht",
      wordBank: ["Mwen", "rele", "Mari."],
      distractors: ["ou"],
      ttsText: "Mwen rele Mari.",
    },
    {
      id: "listen-1",
      kind: "listen_build",
      title: "Listen",
      prompt: "Listen and build.",
      hint: "Listen again.",
      help,
      targetText: "Kijan ou ye?",
      locale: "ht",
      wordBank: ["Kijan", "ou", "ye?"],
      distractors: ["rele"],
    },
  ] as const)("accepts $kind", (exercise) => {
    expect(validateTopicAuthoringDraft(baseDraft(exercise as any))).toEqual({
      ok: true,
      errors: [],
    });
  });

  it("exposes all generic language kinds in the JSON schema", () => {
    const schemaText = JSON.stringify(TOPIC_AUTHORING_DRAFT_JSON_SCHEMA);
    for (const kind of [
      "text_input",
      "voice_input",
      "word_bank_arrange",
      "listen_build",
    ]) {
      expect(schemaText).toContain(`"${kind}"`);
    }
  });

  it("rejects empty speaking targets", () => {
    const result = validateTopicAuthoringDraft(baseDraft({
      id: "speak-empty",
      kind: "voice_input",
      title: "Speak",
      prompt: "Say it.",
      hint: "Try again.",
      help,
      targetText: "   ",
      locale: "ht",
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("voice_input needs targetText");
  });
});
