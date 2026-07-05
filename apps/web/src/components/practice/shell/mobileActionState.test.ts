import { describe, expect, it } from "vitest";

import { resolvePracticeMobilePrimaryAction } from "./mobileActionState";

describe("resolvePracticeMobilePrimaryAction", () => {
  it("keeps Submit as the primary action while an answer is still editable", () => {
    expect(
      resolvePracticeMobilePrimaryAction({
        hasCurrent: true,
        submitted: false,
        finalized: false,
        outOfAttempts: false,
        canGoNext: false,
      }),
    ).toBe("submit");
  });

  it("switches to Next after a finalized correct answer", () => {
    expect(
      resolvePracticeMobilePrimaryAction({
        hasCurrent: true,
        submitted: true,
        finalized: true,
        outOfAttempts: false,
        canGoNext: true,
      }),
    ).toBe("next");
  });

  it("switches to Next after attempts are exhausted", () => {
    expect(
      resolvePracticeMobilePrimaryAction({
        hasCurrent: true,
        submitted: false,
        finalized: false,
        outOfAttempts: true,
        canGoNext: true,
      }),
    ).toBe("next");
  });

  it("uses Next to load the first question when the run is empty", () => {
    expect(
      resolvePracticeMobilePrimaryAction({
        hasCurrent: false,
        submitted: false,
        finalized: false,
        outOfAttempts: false,
        canGoNext: true,
      }),
    ).toBe("next");
  });
});
