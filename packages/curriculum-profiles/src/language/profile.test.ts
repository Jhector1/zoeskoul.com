import { describe, expect, it } from "vitest";
import {
  getCurriculumProfile,
  languageShape,
  validateProfileShapeConsistency,
} from "../index.js";

describe("language curriculum profile", () => {
  it("registers a non-code language profile with integrated-skill kinds", () => {
    const profile = getCurriculumProfile("language");

    expect(profile.shape).toBe(languageShape);
    expect(validateProfileShapeConsistency(profile)).toEqual([]);
    expect(profile.allowedExerciseKinds).toEqual(expect.arrayContaining([
      "single_choice",
      "multi_choice",
      "drag_reorder",
      "fill_blank_choice",
      "text_input",
      "voice_input",
      "word_bank_arrange",
      "listen_build",
    ]));
    expect(profile.allowedExerciseKinds).not.toContain("code_input");
    expect(profile.allowedExerciseKinds).not.toContain("pseudocode_input");
    expect(profile.runtimeKind).toBeUndefined();
    expect(profile.defaultLanguage).toBeUndefined();
    expect(profile.defaultEntryFileName).toBeUndefined();
    expect(profile.buildModuleRuntimeDefaults()).toBeNull();
  });

  it("describes voice_input as transcript-based practice rather than pronunciation scoring", () => {
    const profile = getCurriculumProfile("language");
    const rules = profile.renderExerciseKindPromptRules?.({
      mode: "authoring",
      seed: {} as any,
    }) ?? [];

    expect(rules.join("\n")).toMatch(/transcript-based/i);
    expect(rules.join("\n")).toMatch(/not phoneme-level pronunciation scoring/i);
  });
});
