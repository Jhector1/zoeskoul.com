import { describe, expect, it } from "vitest";
import { getCurriculumProfile } from "@zoeskoul/curriculum-profiles";
import { buildTopicAuthoringDraftPrompt } from "./buildTopicAuthoringDraftPrompt.js";

describe("language topic authoring prompt", () => {
  it("teaches the model the language authoring fields", () => {
    const profile = getCurriculumProfile("language");
    const prompt = buildTopicAuthoringDraftPrompt({
      seed: {
        profileId: "language",
        topicId: "bonjou",
        plannedExerciseCounts: {
          total: 4,
          dominantKind: "voice_input",
          counts: {
            single_choice: 0,
            multi_choice: 0,
            drag_reorder: 0,
            fill_blank_choice: 0,
            text_input: 1,
            voice_input: 1,
            word_bank_arrange: 1,
            listen_build: 1,
            pseudocode_input: 0,
            code_input: 0,
          },
        },
      } as any,
      locale: "en",
      shape: profile.shape,
    });

    expect(prompt.system).toContain("expectedText");
    expect(prompt.system).toContain("targetText");
    expect(prompt.system).toContain("wordBank");
    expect(prompt.system).toContain("listen_build");
    expect(prompt.system).toMatch(/transcript-based speaking practice/i);
  });
});
