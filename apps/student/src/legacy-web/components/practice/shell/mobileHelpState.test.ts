import { describe, expect, it } from "vitest";

import { resolveMobilePracticeHelpState } from "./mobileHelpState";

describe("resolveMobilePracticeHelpState", () => {
  it("offers hints before reveal", () => {
    expect(
      resolveMobilePracticeHelpState({
        enabledStepKeys: ["concept", "hint_1", "hint_2", "reveal"],
        openedStepKeys: [],
        allowReveal: true,
      }),
    ).toMatchObject({
      nextHintKey: "concept",
      openedHintKeys: [],
      revealEnabled: true,
      revealOpened: false,
    });
  });

  it("advances to the next unopened hint", () => {
    expect(
      resolveMobilePracticeHelpState({
        enabledStepKeys: ["concept", "hint_1", "hint_2", "reveal"],
        openedStepKeys: ["concept", "hint_1"],
        allowReveal: true,
      }).nextHintKey,
    ).toBe("hint_2");
  });

  it("never enables reveal when the run policy forbids it", () => {
    expect(
      resolveMobilePracticeHelpState({
        enabledStepKeys: ["concept", "hint_1", "reveal"],
        openedStepKeys: [],
        allowReveal: false,
      }).revealEnabled,
    ).toBe(false);
  });
});
