import { describe, expect, it } from "vitest";
import type { TopicAuthoringDraft, TopicSeed } from "@zoeskoul/curriculum-contracts";
import { languageShape } from "@zoeskoul/curriculum-profiles";
import { buildTopicBundleFromDraft } from "./buildTopicBundleFromDraft.js";

const help = {
  concept: "Language concept",
  hint_1: "First hint",
  hint_2: "Second hint",
};

const seed = {
  subjectSlug: "haitian-creole",
  profileId: "language",
  moduleSlug: "haitian-creole-foundations-1",
  sectionSlug: "greetings",
  topicId: "bonjou",
  order: 1,
  title: "Bonjou",
  summary: "Greet someone in Kreyòl.",
  minutes: 12,
  moduleTitle: "Bonjou!",
  modulePurpose: "Use basic greetings.",
  moduleObjectives: [],
  guidedExercises: [],
  quizFocus: [],
  sectionTitle: "Greetings",
  sourceLocale: "en",
  targetLocales: ["en"],
  modulePrefix: "ht1",
  moduleOrder: 1,
  sectionOrder: 1,
  moduleRuntimeDefaults: null,
} as unknown as TopicSeed;

const draft: TopicAuthoringDraft = {
  title: "Bonjou",
  summary: "Integrated greeting practice.",
  minutes: 12,
  sketchBlocks: [],
  quizDraft: [
    {
      id: "write-bonjou",
      kind: "text_input",
      title: "Write bonjou",
      prompt: "Write the greeting.",
      hint: "It begins with B.",
      help,
      expectedText: "Bonjou",
      anyOf: ["Bonjou!"],
      normalize: { trim: true, caseFold: true, collapseSpaces: true },
    },
    {
      id: "say-bonjou",
      kind: "voice_input",
      title: "Say bonjou",
      prompt: "Say the greeting.",
      hint: "Speak clearly.",
      help,
      targetText: "Bonjou",
      locale: "ht",
      maxSeconds: 10,
      normalize: { trim: true, caseFold: true, collapseSpaces: true },
    },
    {
      id: "build-name",
      kind: "word_bank_arrange",
      title: "Build a name sentence",
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
      id: "listen-greeting",
      kind: "listen_build",
      title: "Listen and build",
      prompt: "Listen and build the question.",
      hint: "Listen again.",
      help,
      targetText: "Kijan ou ye?",
      locale: "ht",
      wordBank: ["Kijan", "ou", "ye?"],
      distractors: ["rele"],
    },
  ],
};

describe("language exercise compilation", () => {
  it("emits all four generic language kinds without a code runtime", () => {
    const bundle = buildTopicBundleFromDraft({
      shape: languageShape,
      seed,
      draft,
    });

    expect(bundle.runtimeDefaults).toBeNull();
    expect(bundle.exercises.map((exercise) => exercise.kind)).toEqual([
      "text_input",
      "voice_input",
      "word_bank_arrange",
      "listen_build",
    ]);

    expect(bundle.exercises[0]).toMatchObject({
      kind: "text_input",
      expected: { kind: "text_input", value: "Bonjou", anyOf: ["Bonjou!"] },
    });
    expect(bundle.exercises[1]).toMatchObject({
      kind: "voice_input",
      targetText: "Bonjou",
      locale: "ht",
      expected: { kind: "voice_input", targetText: "Bonjou", locale: "ht" },
    });
    expect(bundle.exercises[2]).toMatchObject({
      kind: "word_bank_arrange",
      targetText: "Mwen rele Mari.",
      locale: "ht",
      wordBank: ["Mwen", "rele", "Mari."],
      distractors: ["ou"],
      expected: { kind: "word_bank_arrange", targetText: "Mwen rele Mari." },
    });
    expect(bundle.exercises[3]).toMatchObject({
      kind: "listen_build",
      targetText: "Kijan ou ye?",
      locale: "ht",
      expected: { kind: "listen_build", targetText: "Kijan ou ye?" },
    });

    const serialized = JSON.stringify(bundle);
    expect(serialized).not.toContain('"kind":"code"');
    expect(serialized).not.toContain("main.py");
    expect(serialized).not.toContain("main.sql");
  });
});
