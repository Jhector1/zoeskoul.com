import { describe, expect, it } from "vitest";
import { sanitizeGeneratedTopicAuthoringDraft } from "./sanitizeGeneratedTopicAuthoringDraft.js";

const help = {
  concept: "concept",
  hint_1: "hint one",
  hint_2: "hint two",
};

describe("sanitizeGeneratedTopicAuthoringDraft language kinds", () => {
  it("preserves and normalizes the four language exercise shapes", () => {
    const draft = sanitizeGeneratedTopicAuthoringDraft({
      title: "Bonjou",
      summary: "Greetings",
      minutes: 10,
      sketchBlocks: [],
      projectDraft: null,
      quizDraft: [
        {
          id: "write",
          kind: "text_input",
          title: " Write ",
          prompt: " Write bonjou ",
          hint: " Hint ",
          help,
          expectedText: " Bonjou ",
          anyOf: [" Bonjou! ", ""],
          placeholder: " Type here ",
          normalize: {
            trim: true,
            caseFold: true,
            collapseSpaces: true,
            stripPunct: false,
            ignored: true,
          },
          starterCode: "DROP",
        },
        {
          id: "speak",
          kind: "voice_input",
          title: " Speak ",
          prompt: " Say bonjou ",
          hint: " Hint ",
          help,
          targetText: " Bonjou ",
          locale: " ht ",
          anyOf: [" Bonjou! "],
          maxSeconds: 999,
          normalize: { trim: true },
          solutionCode: "DROP",
        },
        {
          id: "build",
          kind: "word_bank_arrange",
          title: " Build ",
          prompt: " Build it ",
          hint: " Hint ",
          help,
          targetText: " Mwen rele Mari. ",
          locale: " ht ",
          wordBank: [" Mwen ", " rele ", " Mari. ", ""],
          distractors: [" ou "],
          ttsText: " Mwen rele Mari. ",
          anyOf: ["Mwen rele Mari"],
          normalize: { trim: true, collapseSpaces: true },
        },
        {
          id: "listen",
          kind: "listen_build",
          title: " Listen ",
          prompt: " Listen and build ",
          hint: " Hint ",
          help,
          targetText: " Kijan ou ye? ",
          locale: " ht ",
          wordBank: [" Kijan ", " ou ", " ye? "],
          distractors: [" rele "],
          normalize: { trim: true },
        },
      ],
    } as any, { profileId: "language" });

    expect(draft.quizDraft[0]).toMatchObject({
      kind: "text_input",
      expectedText: "Bonjou",
      anyOf: ["Bonjou!"],
      placeholder: "Type here",
      normalize: {
        trim: true,
        caseFold: true,
        collapseSpaces: true,
        stripPunct: false,
      },
    });
    expect(draft.quizDraft[0]).not.toHaveProperty("starterCode");

    expect(draft.quizDraft[1]).toMatchObject({
      kind: "voice_input",
      targetText: "Bonjou",
      locale: "ht",
      anyOf: ["Bonjou!"],
      maxSeconds: 120,
      normalize: { trim: true },
    });
    expect(draft.quizDraft[1]).not.toHaveProperty("solutionCode");

    expect(draft.quizDraft[2]).toMatchObject({
      kind: "word_bank_arrange",
      targetText: "Mwen rele Mari.",
      locale: "ht",
      wordBank: ["Mwen", "rele", "Mari."],
      distractors: ["ou"],
      ttsText: "Mwen rele Mari.",
      anyOf: ["Mwen rele Mari"],
    });

    expect(draft.quizDraft[3]).toMatchObject({
      kind: "listen_build",
      targetText: "Kijan ou ye?",
      locale: "ht",
      wordBank: ["Kijan", "ou", "ye?"],
      distractors: ["rele"],
    });
  });
});
