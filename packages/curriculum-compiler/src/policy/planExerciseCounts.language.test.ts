import { describe, expect, it } from "vitest";
import { planExerciseCounts } from "./planExerciseCounts.js";

describe("planExerciseCounts language kinds", () => {
  it("plans generic language kinds when explicitly weighted", () => {
    const result = planExerciseCounts({
      policy: {
        source: "module_spec",
        mix: {
          single_choice: 0.1,
          fill_blank_choice: 0.1,
          text_input: 0.2,
          voice_input: 0.2,
          word_bank_arrange: 0.2,
          listen_build: 0.2,
        },
      },
      total: 10,
    });

    expect(result.counts.text_input).toBeGreaterThan(0);
    expect(result.counts.voice_input).toBeGreaterThan(0);
    expect(result.counts.word_bank_arrange).toBeGreaterThan(0);
    expect(result.counts.listen_build).toBeGreaterThan(0);
    expect(Object.values(result.counts).reduce((sum, value) => sum + value, 0)).toBe(10);
  });

  it("keeps new language kinds at zero when omitted by an old policy", () => {
    const result = planExerciseCounts({
      policy: {
        source: "module_spec",
        mix: {
          single_choice: 0.5,
          fill_blank_choice: 0.5,
        },
      },
      total: 4,
    });

    expect(result.counts.text_input).toBe(0);
    expect(result.counts.voice_input).toBe(0);
    expect(result.counts.word_bank_arrange).toBe(0);
    expect(result.counts.listen_build).toBe(0);
  });
});
