import { describe, expect, it } from "vitest";
import { rankPracticeRuntimeCandidates } from "./practiceRuntimeCandidateSelection";

const current = {
  key: "current",
  score: 5200,
  hasIdentityMatch: true,
  hasTerminalEvidence: false,
  updatedAt: 20,
};
const previous = {
  key: "previous",
  score: 950,
  hasIdentityMatch: false,
  hasTerminalEvidence: true,
  updatedAt: 100,
};

describe("Try terminal candidate selection", () => {
  it("refuses evidence belonging to a different Try", () => {
    expect(rankPracticeRuntimeCandidates([previous, current], true)).toEqual([current]);
  });
  it("never falls back to a previous Try when no exact candidate exists", () => {
    expect(rankPracticeRuntimeCandidates([previous], true)).toEqual([]);
  });
  it("prefers the exact target even if stale evidence is newer", () => {
    expect(rankPracticeRuntimeCandidates([previous, { ...current, hasTerminalEvidence: true }], true)[0].key)
      .toBe("current");
  });
  it("retains legacy broad candidate behavior for nonterminal exercises", () => {
    expect(rankPracticeRuntimeCandidates([previous, current], false)).toHaveLength(2);
  });
  it("does not mutate the provided candidate array", () => {
    const original = [previous, current];
    rankPracticeRuntimeCandidates(original, true);
    expect(original).toEqual([previous, current]);
  });
});
