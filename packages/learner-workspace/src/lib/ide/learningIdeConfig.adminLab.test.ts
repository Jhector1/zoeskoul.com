import { describe, expect, it } from "vitest";
import { mergeLearningIdeConfigs } from "./learningIdeConfig";

describe("administrator lab IDE metadata", () => {
  it("retains an eligible topic across the existing sparse IDE merge", () => {
    expect(mergeLearningIdeConfigs(
      { runnerBackend: "pty", administratorLab: "disabled", requires: { terminal: true } },
      { administratorLab: "eligible" },
    )).toMatchObject({ runnerBackend: "pty", administratorLab: "eligible", requires: { terminal: true } });
  });

  it("allows an explicit topic denial to override an inherited eligible parent", () => {
    expect(mergeLearningIdeConfigs(
      { administratorLab: "eligible" },
      { administratorLab: "disabled" },
    )?.administratorLab).toBe("disabled");
  });

  it("does not invent eligibility for an ordinary terminal", () => {
    expect(mergeLearningIdeConfigs({ runnerBackend: "pty" })?.administratorLab).toBeUndefined();
  });
});
