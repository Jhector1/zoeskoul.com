import { describe, expect, it } from "vitest";
import { renderExerciseKindPromptRules } from "./exerciseKindPromptRules.js";

describe("language exercise prompt rules", () => {
  it("renders the four generic language exercise contracts", () => {
    const lines = renderExerciseKindPromptRules({
      mode: "authoring",
      seed: {
        profileId: "language",
      } as any,
    });
    const text = lines.join("\n");

    expect(text).toContain("text_input");
    expect(text).toContain("voice_input");
    expect(text).toContain("word_bank_arrange");
    expect(text).toContain("listen_build");
    expect(text).toMatch(/transcript-based speaking practice/i);
    expect(text).toMatch(/targetText/i);
    expect(text).toMatch(/locale/i);
  });
});
